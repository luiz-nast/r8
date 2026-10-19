"""Dados de mercado: histórico e cotação do Yahoo Finance, fundamentos do brapi.dev.

Nenhuma das duas pede chave. O Yahoo não é API oficial (pode mudar sem aviso);
o brapi grátis tem 15 mil chamadas/mês, então tudo passa por um cache em memória.
"""

import os
import re
import threading
import time
from collections import OrderedDict
from concurrent.futures import ThreadPoolExecutor
from pathlib import Path

import httpx
import numpy as np
import pandas as pd

YAHOO = "https://query1.finance.yahoo.com"
BRAPI = "https://brapi.dev/api"
BRAPI_TOKEN = os.environ.get("BRAPI_TOKEN", "")
# sem User-Agent o Yahoo responde 429, e com um de Chrome completo também (testado); o curto passa
http = httpx.Client(timeout=20, headers={"User-Agent": "Mozilla/5.0"})

# o servidor tem pouca RAM: na memória só fica um punhado de coisas recentes (LRU),
# o histórico de preços mora em disco (data/cache, ~100 KB por ativo, apagado depois de 3 dias sem uso)
MEM_ITEMS = 48
DISK = Path("data/cache")
DISK.mkdir(parents=True, exist_ok=True)
DISK_DAYS = 3

_cache: OrderedDict[str, tuple[float, object]] = OrderedDict()
_lock = threading.Lock()


def cached(key: str, ttl: int, fn):
    now = time.time()
    with _lock:
        hit = _cache.get(key)
        if hit and hit[0] > now:
            _cache.move_to_end(key)
            return hit[1]
    value = fn()
    with _lock:
        _cache[key] = (now + ttl, value)
        _cache.move_to_end(key)
        while len(_cache) > MEM_ITEMS:
            _cache.popitem(last=False)
    return value


def on_disk(name: str, ttl: int, fn):
    """Cache em arquivo. Se a fonte falhar, devolve o arquivo velho mesmo (melhor que nada)."""
    path = DISK / (re.sub(r"[^A-Za-z0-9._=-]", "_", name) + ".pkl.gz")
    fresh = path.exists() and path.stat().st_mtime > time.time() - ttl
    if not fresh:
        try:
            value = fn()
            tmp = path.with_suffix(".tmp")
            pd.to_pickle(value, tmp, compression="gzip")
            tmp.replace(path)
            sweep()
            return value
        except Exception:
            if not path.exists():
                raise
    return pd.read_pickle(path, compression="gzip")


def sweep():
    old = time.time() - DISK_DAYS * 86400
    for f in DISK.iterdir():
        if f.stat().st_mtime < old:
            f.unlink(missing_ok=True)


class NotFound(Exception):
    pass


def symbol(ticker: str) -> str:
    """'petr4' -> 'PETR4.SA'; índices (^BVSP), moedas (BRL=X) e tickers de fora passam direto."""
    t = ticker.strip().upper()
    if re.fullmatch(r"[A-Z][A-Z0-9]{3}\d{1,2}F?", t):
        return t + ".SA"
    return t


def label(sym: str) -> str:
    return {"^BVSP": "IBOV", "USDBRL=X": "USD", "BRL=X": "USD", "EURBRL=X": "EUR", "^GSPC": "S&P 500", "IFIX.SA": "IFIX"}.get(sym, sym.removesuffix(".SA"))


def _chart(sym: str, params: dict) -> dict:
    for wait in (1, 3, 0):
        r = http.get(f"{YAHOO}/v8/finance/chart/{sym}", params=params)
        # rajada de pedidos às vezes toma 429: espera um pouco e tenta de novo
        if r.status_code != 429 or not wait:
            break
        time.sleep(wait)
    if r.status_code == 404:
        raise NotFound(sym)
    r.raise_for_status()
    res = (r.json().get("chart") or {}).get("result")
    if not res or not res[0].get("timestamp"):
        raise NotFound(sym)
    return res[0]


def history(ticker: str) -> tuple[pd.DataFrame, dict, pd.Series]:
    """Histórico diário completo: (tabela de preços, meta, dividendos por data)."""
    sym = symbol(ticker)

    def load():
        r = _chart(sym, {"period1": 0, "period2": int(time.time()) + 86400, "interval": "1d", "events": "div"})
        q = r["indicators"]["quote"][0]
        adj = (r["indicators"].get("adjclose") or [{}])[0].get("adjclose") or q["close"]
        day = lambda ts: pd.to_datetime(ts, unit="s", utc=True).tz_convert("America/Sao_Paulo").tz_localize(None).normalize()
        df = pd.DataFrame({"open": q["open"], "high": q["high"], "low": q["low"], "close": q["close"], "adj": adj, "volume": q["volume"]},
                          index=day(r["timestamp"]), dtype="float64")
        df = df[~df.index.duplicated(keep="last")].dropna(subset=["close"])
        divs = (r.get("events") or {}).get("dividends") or {}
        div = pd.Series({day(d["date"]): d["amount"] for d in divs.values()}, dtype=float).sort_index()
        return df, r["meta"], div

    # disco vale 30 min; a memória só segura os últimos acessados
    return cached(f"hist:{sym}", 5 * 60, lambda: on_disk(f"hist-{sym}", 30 * 60, load))


def quote(ticker: str) -> dict:
    """Preço atual, variação do dia e o último mês (para o mini gráfico)."""
    sym = symbol(ticker)

    def load():
        r = _chart(sym, {"range": "1mo", "interval": "1d"})
        m = r["meta"]
        closes = [c for c in r["indicators"]["quote"][0]["close"] if c is not None]
        price = m.get("regularMarketPrice") or closes[-1]
        change = m.get("regularMarketChangePercent")
        if change is None and len(closes) > 1:
            change = (closes[-1] / closes[-2] - 1) * 100
        return {
            "ticker": label(sym), "symbol": sym, "name": m.get("longName") or m.get("shortName") or label(sym),
            "price": price, "change": change, "currency": m.get("currency"), "time": m.get("regularMarketTime"),
            "spark": closes, "type": m.get("instrumentType"),
        }

    return cached(f"quote:{sym}", 120, load)


def quotes(tickers: list[str]) -> list[dict]:
    def safe(t):
        try:
            return quote(t)
        except Exception:
            return {"ticker": label(symbol(t)), "symbol": symbol(t), "error": True}

    with ThreadPoolExecutor(8) as pool:
        return list(pool.map(safe, tickers))


def search(q: str) -> list[dict]:
    def load():
        r = http.get(f"{YAHOO}/v1/finance/search", params={"q": q, "quotesCount": 10, "newsCount": 0, "lang": "pt-BR", "region": "BR"})
        r.raise_for_status()
        out = []
        for it in r.json().get("quotes", []):
            if it.get("quoteType") not in ("EQUITY", "ETF", "INDEX", "MUTUALFUND", "CURRENCY"):
                continue
            out.append({"ticker": label(it["symbol"]), "name": it.get("longname") or it.get("shortname") or it["symbol"],
                        "exchange": it.get("exchDisp"), "type": it.get("typeDisp"), "br": it["symbol"].endswith(".SA")})
        # o que é da B3 primeiro
        return sorted(out, key=lambda x: not x["br"])

    return cached(f"search:{q.lower()}", 3600, load)


def fundamentals(ticker: str) -> dict:
    """P/L, LPA e valor de mercado do brapi. Só existe para ativos da B3; falha vira {}."""
    sym = symbol(ticker)
    if not sym.endswith(".SA"):
        return {}

    def load():
        try:
            params = {"token": BRAPI_TOKEN} if BRAPI_TOKEN else {}
            r = http.get(f"{BRAPI}/quote/{sym.removesuffix('.SA')}", params=params)
            r.raise_for_status()
            d = r.json()["results"][0]
            return {"pe": d.get("priceEarnings"), "eps": d.get("earningsPerShare"), "marketCap": d.get("marketCap"), "logo": d.get("logourl")}
        except Exception:
            return {}

    return cached(f"fund:{sym}", 6 * 3600, load)


# ---------- números para o raio-x ----------


def _ret(s: pd.Series, days: int) -> float | None:
    start = s.index[-1] - pd.Timedelta(days=days)
    past = s[s.index <= start]
    return None if past.empty else float(s.iloc[-1] / past.iloc[-1] - 1)


def drawdown(s: pd.Series) -> float:
    return float((s / s.cummax() - 1).min())


def profile(ticker: str) -> dict:
    df, meta, div = history(ticker)
    s = df["adj"]
    close = df["close"]
    last_year = df[df.index > df.index[-1] - pd.Timedelta(days=365)]
    daily = s.pct_change().dropna()
    div_12m = float(div[div.index > df.index[-1] - pd.Timedelta(days=365)].sum()) if len(div) else 0.0
    price = float(close.iloc[-1])

    # comparar com o Ibovespa no mesmo período
    ibov = None
    if symbol(ticker) != "^BVSP":
        try:
            ibov = _ret(history("^BVSP")[0]["adj"], 365)
        except Exception:
            pass

    return {
        "ticker": label(symbol(ticker)), "symbol": symbol(ticker),
        "name": meta.get("longName") or meta.get("shortName") or label(symbol(ticker)),
        "currency": meta.get("currency"), "type": meta.get("instrumentType"),
        "price": price, "first": df.index[0].strftime("%Y-%m-%d"), "last": df.index[-1].strftime("%Y-%m-%d"),
        "returns": {k: _ret(s, d) for k, d in {"1m": 30, "6m": 182, "1a": 365, "5a": 5 * 365, "10a": 10 * 365}.items()},
        "ibov1a": ibov,
        "high52": float(last_year["high"].max()), "low52": float(last_year["low"].min()),
        # volatilidade anualizada: desvio padrão dos retornos diários x raiz de 252 pregões
        "vol1a": float(daily[daily.index > df.index[-1] - pd.Timedelta(days=365)].std() * np.sqrt(252)),
        "dd5a": drawdown(s[s.index > df.index[-1] - pd.Timedelta(days=5 * 365)]),
        "ddMax": drawdown(s),
        "ma200": float(close.rolling(200).mean().iloc[-1]) if len(close) >= 200 else None,
        "div12m": div_12m, "dy": div_12m / price if price else None,
        "dividends": [{"date": d.strftime("%Y-%m-%d"), "value": float(v)} for d, v in div.iloc[-12:][::-1].items()],
        "avgVolume": float(last_year["volume"].mean() or 0),
        **fundamentals(ticker),
    }


def series(ticker: str, years: float | None) -> dict:
    df, _, _ = history(ticker)
    if years:
        df = df[df.index > df.index[-1] - pd.Timedelta(days=int(years * 365))]
    day = df.index.strftime("%Y-%m-%d").tolist()
    full = history(ticker)[0]["close"]
    out = {"candles": [{"time": t, "open": o, "high": h, "low": l, "close": c}
                       for t, o, h, l, c in zip(day, df["open"], df["high"], df["low"], df["close"]) if None not in (o, h, l) and not np.isnan([o, h, l]).any()],
           "volume": [{"time": t, "value": float(v)} for t, v in zip(day, df["volume"].fillna(0))]}
    # médias calculadas no histórico inteiro, depois recortadas, para não começarem "do zero" no gráfico
    for n in (50, 200):
        ma = full.rolling(n).mean().reindex(df.index)
        out[f"ma{n}"] = [{"time": t, "value": float(v)} for t, v in zip(day, ma) if not np.isnan(v)]
    return out


# ---------- simulador "e se?" ----------


def simulate(tickers: list[str], amount: float, monthly: float, start: str, fixed_rate: float) -> dict:
    start_ts = pd.Timestamp(start)
    frames = {}
    for t in tickers:
        s = history(t)[0]["adj"]
        frames[label(symbol(t))] = s[s.index >= start_ts]
    frames = {k: v for k, v in frames.items() if len(v) > 1}
    if not frames:
        raise NotFound("sem dados nesse período")
    # dias em que algum dos ativos negociou
    days = sorted(set().union(*[set(v.index) for v in frames.values()]))
    idx = pd.DatetimeIndex(days)
    # aporte: o inicial no primeiro dia, depois um por mês, no primeiro pregão do mês
    month = idx.to_period("M")
    contrib = pd.Series(0.0, index=idx)
    contrib.iloc[0] = amount
    if monthly:
        firsts = ~month.duplicated()
        firsts[0] = False
        contrib[firsts] += monthly
    invested = contrib.cumsum()

    out = {"days": [d.strftime("%Y-%m-%d") for d in idx], "invested": invested.round(2).tolist(), "lines": {}}
    for name, s in frames.items():
        p = s.reindex(idx).ffill().bfill()
        shares = (contrib / p).cumsum()
        out["lines"][name] = (shares * p).round(2).tolist()
    if fixed_rate:
        # renda fixa hipotética: juros compostos diários na taxa anual informada
        daily = (1 + fixed_rate) ** (1 / 252) - 1
        value, vals = 0.0, []
        for c in contrib:
            value = value * (1 + daily) + c
            vals.append(round(value, 2))
        out["lines"][f"Renda fixa {fixed_rate * 100:.1f}% a.a.".replace(".", ",", 1)] = vals
    return out
