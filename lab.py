"""Laboratório: estratégias e modelos de ML testados no histórico de um ativo.

Todos seguem o mesmo jogo: a cada pregão, decidir se fica comprado amanhã ou fica de fora,
usando só o que já se sabia no fechamento de hoje. O teste é "walk-forward": o modelo treina
no passado, opera o trimestre seguinte, retreina com esse trimestre incluído e segue.
Para criar um modelo novo, basta escrever a função e registrar em MODELS.
"""

import threading

import numpy as np
import pandas as pd
from sklearn.ensemble import HistGradientBoostingClassifier, RandomForestClassifier
from sklearn.linear_model import LogisticRegression
from sklearn.neighbors import KNeighborsClassifier
from sklearn.neural_network import MLPClassifier
from sklearn.pipeline import make_pipeline
from sklearn.preprocessing import StandardScaler

import market

# a máquina tem 1 vCPU: um treino por vez
busy = threading.Lock()

COST = 0.0005  # 0,05% por compra ou venda (corretagem zero, mas tem emolumentos e spread)
STEP = 63  # retreina a cada ~trimestre (63 pregões)

FEATURES = {
    "ret1": "Retorno de ontem pra hoje",
    "ret5": "Retorno da última semana",
    "ret20": "Retorno do último mês",
    "ret60": "Retorno dos últimos 3 meses",
    "ma10": "Distância da média de 10 dias",
    "ma50": "Distância da média de 50 dias",
    "ma200": "Distância da média de 200 dias",
    "vol20": "Volatilidade do último mês",
    "rsi14": "RSI de 14 dias (sobrecompra/sobrevenda)",
    "volume": "Volume de hoje vs média do mês",
    "ibov20": "Retorno do Ibovespa no último mês",
}


def features(df: pd.DataFrame, ibov: pd.Series | None) -> pd.DataFrame:
    s = df["adj"]
    r = s.pct_change()
    up, down = r.clip(lower=0).rolling(14).mean(), (-r.clip(upper=0)).rolling(14).mean()
    x = pd.DataFrame({
        "ret1": r,
        "ret5": s.pct_change(5),
        "ret20": s.pct_change(20),
        "ret60": s.pct_change(60),
        "ma10": s / s.rolling(10).mean() - 1,
        "ma50": s / s.rolling(50).mean() - 1,
        "ma200": s / s.rolling(200).mean() - 1,
        "vol20": r.rolling(20).std(),
        "rsi14": 100 - 100 / (1 + up / down.replace(0, np.nan)),
        "volume": df["volume"] / df["volume"].rolling(20).mean() - 1,
    })
    if ibov is not None:
        x["ibov20"] = ibov.reindex(s.index).ffill().pct_change(20)
    return x.replace([np.inf, -np.inf], np.nan)


def walk_forward(make, x: pd.DataFrame, y: pd.Series, start: int):
    """Treina em [0, i), prevê [i, i+STEP), anda STEP e repete."""
    pred = pd.Series(np.nan, index=x.index)
    importance = np.zeros(x.shape[1])
    fits = 0
    for i in range(start, len(x), STEP):
        model = make()
        model.fit(x.iloc[:i], y.iloc[:i])
        pred.iloc[i:i + STEP] = model.predict_proba(x.iloc[i:i + STEP])[:, 1]
        est = model[-1] if hasattr(model, "steps") else model
        if hasattr(est, "feature_importances_"):
            importance += est.feature_importances_
            fits += 1
        elif hasattr(est, "coef_"):
            importance += np.abs(est.coef_[0])
            fits += 1
    return pred, (importance / fits if fits else None)


def ml(make):
    def run(df, x, y, start, params):
        pred, imp = walk_forward(make, x, y, start)
        threshold = params.get("threshold", 0.5)
        return (pred > threshold).astype(float), pred, imp
    return run


def ma_cross(df, x, y, start, params):
    """Regra clássica, sem ML: fica comprado enquanto a média curta está acima da longa."""
    s = df["adj"]
    short, long = int(params.get("short", 20)), int(params.get("long", 100))
    pos = (s.rolling(short).mean() > s.rolling(long).mean()).astype(float)
    return pos, None, None


def momentum(df, x, y, start, params):
    """Fica comprado se o ativo subiu nos últimos N dias (tendência)."""
    n = int(params.get("days", 120))
    return (df["adj"].pct_change(n) > 0).astype(float), None, None


MODELS = {
    "medias": {"name": "Cruzamento de médias", "kind": "Regra", "run": ma_cross,
               "about": "Compra quando a média dos últimos 20 dias passa a média de 100 dias, vende quando cai abaixo. É a estratégia mais antiga dos gráficos."},
    "momentum": {"name": "Momentum", "kind": "Regra", "run": momentum,
                 "about": "Fica comprado só quando o ativo está subindo nos últimos ~6 meses. A ideia: o que vem subindo tende a continuar subindo."},
    "logistica": {"name": "Regressão logística", "kind": "ML", "run": ml(lambda: make_pipeline(StandardScaler(), LogisticRegression(C=0.1, max_iter=500))),
                  "about": "O modelo de ML mais simples: dá um peso pra cada indicador e soma tudo numa probabilidade de subir amanhã."},
    "knn": {"name": "Vizinhos mais próximos (KNN)", "kind": "ML", "run": ml(lambda: make_pipeline(StandardScaler(), KNeighborsClassifier(50))),
            "about": "Procura os 50 dias do passado mais parecidos com hoje e vê o que aconteceu no dia seguinte deles."},
    "floresta": {"name": "Random Forest", "kind": "ML", "run": ml(lambda: RandomForestClassifier(200, max_depth=5, min_samples_leaf=20, n_jobs=1, random_state=0)),
                 "about": "200 árvores de decisão, cada uma vê um pedaço dos dados e vota se sobe ou cai. A maioria decide."},
    "boosting": {"name": "Gradient Boosting", "kind": "ML", "run": ml(lambda: HistGradientBoostingClassifier(max_depth=3, learning_rate=0.05, max_iter=150, random_state=0)),
                 "about": "Árvores em sequência, cada uma corrigindo os erros da anterior. É o que mais ganha competição de dados em tabela."},
    "rede": {"name": "Rede neural (MLP)", "kind": "Deep learning", "run": ml(lambda: make_pipeline(StandardScaler(), MLPClassifier((32, 16), alpha=1e-2, max_iter=300, early_stopping=True, random_state=0))),
             "about": "Uma rede neural pequena com 2 camadas escondidas (32 e 16 neurônios). É a porta de entrada pro deep learning."},
}


def stats(equity: pd.Series, pos: pd.Series) -> dict:
    years = max((equity.index[-1] - equity.index[0]).days / 365.25, 1e-9)
    daily = equity.pct_change().dropna()
    return {
        "total": float(equity.iloc[-1] - 1),
        "cagr": float(equity.iloc[-1] ** (1 / years) - 1),
        "vol": float(daily.std() * np.sqrt(252)),
        "sharpe": float(daily.mean() / daily.std() * np.sqrt(252)) if daily.std() > 0 else 0.0,
        "dd": market.drawdown(equity),
        "exposure": float(pos.mean()),
        "trades": int(pos.diff().abs().fillna(0).sum()),
    }


def run(ticker: str, model: str, years: int, params: dict) -> dict:
    spec = MODELS[model]
    df = market.history(ticker)[0]
    df = df[df.index > df.index[-1] - pd.Timedelta(days=int((years + 3) * 365))]  # +3 anos pra treinar antes do teste
    try:
        ibov = None if market.symbol(ticker) == "^BVSP" else market.history("^BVSP")[0]["adj"]
    except Exception:
        ibov = None
    x = features(df, ibov)
    # alvo: o preço sobe amanhã?
    nxt = df["adj"].pct_change().shift(-1)
    y = (nxt > 0).astype(int)
    ok = x.notna().all(axis=1) & nxt.notna()
    x, y = x[ok], y[ok]
    test_from = df.index[-1] - pd.Timedelta(days=int(years * 365))
    start = int((x.index <= test_from).sum())
    if start < 250 or len(x) - start < 60:
        raise ValueError("Histórico curto demais pra esse teste. Tenta um período menor ou outro ativo.")

    with busy:
        pos, prob, imp = spec["run"](df, x, y, start, params)

    test = x.index[start:]
    pos = pos.reindex(test).fillna(0)
    r = nxt.reindex(test)  # retorno de hoje->amanhã, que a posição decidida hoje captura
    trade = pos.diff().abs().fillna(pos.iloc[0])
    strat = (1 + pos * r - trade * COST).cumprod()
    hold = (1 + r).cumprod()
    hits = ((pos > 0) == (y.reindex(test) > 0))

    out = {
        "model": spec["name"], "kind": spec["kind"], "about": spec["about"],
        "from": test[0].strftime("%Y-%m-%d"), "to": test[-1].strftime("%Y-%m-%d"),
        "days": [d.strftime("%Y-%m-%d") for d in test],
        "strategy": strat.round(4).tolist(), "hold": hold.round(4).tolist(), "position": pos.astype(int).tolist(),
        "stats": {"strategy": stats(strat, pos), "hold": stats(hold, pd.Series(1.0, index=test))},
        # acerto: dias em que "comprado" coincidiu com "subiu" e "de fora" com "caiu"
        "accuracy": float(hits.mean()),
        "baseline": float((y.reindex(test) > 0).mean()),  # acerto de quem chuta "sobe" todo dia
    }
    if imp is not None:
        names = list(x.columns)
        order = np.argsort(imp)[::-1]
        out["importance"] = [{"feature": FEATURES.get(names[i], names[i]), "value": float(imp[i] / imp.sum())} for i in order]
    return out
