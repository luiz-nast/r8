import asyncio
import hashlib
import hmac
import json
import os
import time
from datetime import date
from pathlib import Path

import httpx
from fastapi import FastAPI, Form, HTTPException, Request
from fastapi.responses import FileResponse, JSONResponse, PlainTextResponse, RedirectResponse
from fastapi.staticfiles import StaticFiles

import lab
import market

DATA = Path("data").resolve()
DATA.mkdir(exist_ok=True)
FAVS = DATA / "favoritos.json"

PASSWORD = os.environ["PASSWORD"]
# o cookie é só um hash da senha: trocou a senha, todo mundo é deslogado
TOKEN = hmac.new(os.environ["SECRET"].encode(), PASSWORD.encode(), hashlib.sha256).hexdigest()

# tentativas erradas de login por IP: 5 erros em 15 min bloqueiam aquele IP por 15 min
MAX_FAILS, WINDOW = 5, 15 * 60
fails: dict[str, list[float]] = {}

# a vitrine da tela inicial: as ações mais negociadas da B3, por setor
SHOWCASE = {
    "Bancos": ["ITUB4", "BBDC4", "BBAS3", "SANB11", "BPAC11"],
    "Petróleo e mineração": ["PETR4", "VALE3", "PRIO3", "SUZB3", "GGBR4"],
    "Energia e saneamento": ["AXIA3", "EGIE3", "TAEE11", "SBSP3", "CMIG4"],
    "Consumo e varejo": ["ABEV3", "MGLU3", "LREN3", "RADL3", "ASAI3"],
    "Indústria e outros": ["WEGE3", "EMBJ3", "RENT3", "B3SA3", "VIVT3"],
    "Fundos (ETFs e FIIs)": ["BOVA11", "IVVB11", "SMAL11", "HGLG11", "MXRF11"],
}
INDICES = ["^BVSP", "USDBRL=X", "EURBRL=X", "^GSPC"]

app = FastAPI(docs_url=None, redoc_url=None, openapi_url=None)
app.mount("/static", StaticFiles(directory="static"), name="static")


@app.middleware("http")
async def auth(request: Request, call_next):
    path = request.url.path
    if path == "/login" or path.startswith("/static/") or hmac.compare_digest(request.cookies.get("s", ""), TOKEN):
        return await call_next(request)
    if path.startswith("/api/"):
        return PlainTextResponse("log in first", 401)
    return RedirectResponse("/login")


@app.exception_handler(market.NotFound)
async def not_found(request, exc):
    return JSONResponse({"detail": f"Não achei dados para {exc}."}, 404)


@app.exception_handler(httpx.HTTPError)
async def upstream(request, exc):
    return JSONResponse({"detail": "A fonte de dados não respondeu. Tenta de novo daqui a pouco."}, 502)


# ---------- sessão ----------


@app.get("/login")
def login_page():
    return FileResponse("static/login.html")


@app.post("/login")
async def login(request: Request, password: str = Form()):
    ip = request.client.host if request.client else "?"
    now = time.time()
    recent = fails[ip] = [t for t in fails.get(ip, []) if t > now - WINDOW]
    if len(recent) >= MAX_FAILS:
        return RedirectResponse(f"/login?blocked={int((recent[0] + WINDOW - now) / 60) + 1}", 303)
    if not hmac.compare_digest(password.encode(), PASSWORD.encode()):
        recent.append(now)
        await asyncio.sleep(1)
        return RedirectResponse("/login?wrong", 303)
    fails.pop(ip, None)
    r = RedirectResponse("/", 303)
    r.set_cookie("s", TOKEN, max_age=60 * 60 * 24 * 30, httponly=True, secure=True, samesite="lax")
    return r


@app.post("/logout")
def logout():
    r = RedirectResponse("/login", 303)
    r.delete_cookie("s")
    return r


@app.get("/")
def index():
    return FileResponse("static/index.html")


# ---------- mercado ----------


@app.get("/api/home")
def home():
    favs = read_favs()
    every = INDICES + favs + [t for ts in SHOWCASE.values() for t in ts]
    got = {q["ticker"]: q for q in market.quotes(list(dict.fromkeys(every)))}
    pick = lambda ts: [got[market.label(market.symbol(t))] for t in ts]
    return {"indices": pick(INDICES), "favs": pick(favs), "groups": [{"name": k, "items": pick(v)} for k, v in SHOWCASE.items()]}


@app.get("/api/search")
def search(q: str):
    return market.search(q.strip()[:40]) if q.strip() else []


@app.get("/api/asset/{ticker}")
def asset(ticker: str):
    return market.profile(ticker)


@app.get("/api/chart/{ticker}")
def chart(ticker: str, years: float = 1):
    return market.series(ticker, years or None)


@app.post("/api/simulate")
def simulate(body: dict):
    tickers = [t for t in body.get("tickers", []) if t][:5]
    if not tickers:
        raise HTTPException(400, "Escolhe pelo menos um ativo.")
    start = body.get("start") or str(date.today().replace(year=date.today().year - 5))
    return market.simulate(tickers, float(body.get("amount") or 0), float(body.get("monthly") or 0), start, float(body.get("rate") or 0) / 100)


# ---------- laboratório ----------


@app.get("/api/lab/models")
def lab_models():
    return [{"id": k, "name": v["name"], "kind": v["kind"], "about": v["about"]} for k, v in lab.MODELS.items()]


@app.post("/api/lab/run")
def lab_run(body: dict):
    model = body.get("model")
    if model not in lab.MODELS:
        raise HTTPException(400, "Modelo desconhecido.")
    if lab.busy.locked():
        raise HTTPException(429, "Já tem um modelo treinando. Espera ele terminar.")
    try:
        return lab.run(body.get("ticker", "PETR4"), model, max(1, min(int(body.get("years", 3)), 15)), body.get("params") or {})
    except ValueError as e:
        raise HTTPException(400, str(e))


# ---------- favoritos ----------


def read_favs() -> list[str]:
    try:
        return json.loads(FAVS.read_text())
    except (FileNotFoundError, ValueError):
        return []


@app.get("/api/favs")
def get_favs():
    return read_favs()


@app.put("/api/favs")
def put_favs(favs: list[str]):
    clean = list(dict.fromkeys(market.label(market.symbol(t)) for t in favs if t))[:30]
    tmp = FAVS.with_suffix(".tmp")
    tmp.write_text(json.dumps(clean))
    tmp.replace(FAVS)
    return clean
