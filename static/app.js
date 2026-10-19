const $ = (s, el = document) => el.querySelector(s)
const $$ = (s, el = document) => [...el.querySelectorAll(s)]
const view = $("#view")
const LC = LightweightCharts
const COLORS = ["#FFB020", "#60A5FA", "#A78BFA", "#F472B6", "#34D399", "#F87171"]
const NAMES = { IBOV: "Ibovespa", USD: "Dólar", EUR: "Euro", "S&P 500": "S&P 500 (EUA)" }

// ---------- utilidades ----------

const esc = s => String(s ?? "").replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c])
const nf = (d = 2) => new Intl.NumberFormat("pt-BR", { minimumFractionDigits: d, maximumFractionDigits: d })
const num = (v, d = 2) => v == null || isNaN(v) ? "—" : nf(d).format(v)
const money = (v, cur = "BRL", d = 2) => v == null || isNaN(v) ? "—" : new Intl.NumberFormat("pt-BR", { style: "currency", currency: cur || "BRL", minimumFractionDigits: d, maximumFractionDigits: d }).format(v)
const pct = (v, d = 1, sign = true) => v == null || isNaN(v) ? "—" : (sign && v > 0 ? "+" : "") + nf(d).format(v * 100) + "%"
const cls = v => v == null ? "" : v >= 0 ? "up" : "down"
const big = v => {
  if (v == null) return "—"
  for (const [n, s] of [[1e12, "tri"], [1e9, "bi"], [1e6, "mi"], [1e3, "mil"]]) if (Math.abs(v) >= n) return nf(1).format(v / n) + " " + s
  return nf(0).format(v)
}
const isIndex = q => q.type === "INDEX"
const isFx = q => q.type === "CURRENCY"
const price = q => isIndex(q) ? num(q.price, 0) + " pts" : isFx(q) ? money(q.price, "BRL", 4) : money(q.price, q.currency)
const nameOf = q => NAMES[q.ticker] || q.name || q.ticker
const href = t => "#/ativo/" + encodeURIComponent(t)
const br = d => d.split("-").reverse().join("/")
const yearsAgo = n => { const d = new Date(); d.setFullYear(d.getFullYear() - n); return d.toISOString().slice(0, 10) }

async function api(path, body, method) {
  const r = await fetch(path, body === undefined ? {} : { method: method || "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) })
  if (r.status === 401) { location.href = "/login"; throw new Error("sessão expirada") }
  const data = await r.json().catch(() => ({}))
  if (!r.ok) throw new Error(data.detail || `Erro ${r.status}`)
  return data
}

let toastTimer
function toast(msg) {
  const t = $("#toast")
  t.textContent = msg
  t.hidden = false
  clearTimeout(toastTimer)
  toastTimer = setTimeout(() => (t.hidden = true), 4000)
}

function store(key, value) {
  try { return value === undefined ? localStorage.getItem(key) : localStorage.setItem(key, value) } catch { return null }
}

function spark(values, up) {
  if (!values || values.length < 2) return ""
  const min = Math.min(...values), max = Math.max(...values), w = 100, h = 30
  const pts = values.map((v, i) => `${(i / (values.length - 1) * w).toFixed(1)},${(h - 2 - (v - min) / (max - min || 1) * (h - 4)).toFixed(1)}`).join(" ")
  const c = up ? "var(--up)" : "var(--down)"
  return `<svg viewBox="0 0 ${w} ${h}" preserveAspectRatio="none" aria-hidden="true"><polyline points="${pts}" fill="none" stroke="${c}" stroke-width="1.6" vector-effect="non-scaling-stroke" stroke-linejoin="round"/></svg>`
}

function tile(q, isBig) {
  if (q.error) return `<a class="tile err" href="${href(q.ticker)}"><span class="t">${esc(q.ticker)}</span><span class="n">sem dados agora</span></a>`
  return `<a class="tile${isBig ? " big" : ""}" href="${href(q.ticker)}">
    <span class="t">${esc(isBig ? nameOf(q) : q.ticker)}</span><span></span>
    <span class="n">${esc(isBig ? q.ticker : q.name)}</span>
    <span class="p num">${price(q)}</span><span class="c num ${cls(q.change)}">${pct(q.change / 100, 2)}</span>
    ${spark(q.spark, (q.spark?.at(-1) ?? 0) >= (q.spark?.[0] ?? 0))}
  </a>`
}

// ---------- gráficos ----------

let charts = []
function makeChart(el, extra = {}) {
  const chart = LC.createChart(el, {
    autoSize: true,
    layout: { background: { type: "solid", color: "transparent" }, textColor: "#9A9CA3", fontFamily: "JetBrains Mono, monospace", fontSize: 11 },
    grid: { vertLines: { color: "#1B1D21" }, horzLines: { color: "#1B1D21" } },
    rightPriceScale: { borderColor: "#24262B" },
    timeScale: { borderColor: "#24262B" },
    crosshair: { mode: LC.CrosshairMode.Normal },
    localization: { locale: "pt-BR", priceFormatter: v => num(v, Math.abs(v) < 10 ? 2 : Math.abs(v) < 1000 ? 2 : 0) },
    ...extra,
  })
  charts.push(chart)
  return chart
}
function clearCharts() { charts.forEach(c => c.remove()); charts = [] }

// ---------- busca ----------

function attachSearch(input, list, onPick) {
  let items = [], sel = -1, timer, last = ""
  const render = () => {
    list.hidden = !items.length
    input.closest("[role=combobox]")?.setAttribute("aria-expanded", String(!list.hidden))
    list.innerHTML = items.map((it, i) => `<li role="option" aria-selected="${i === sel}" data-i="${i}"><span class="t">${esc(it.ticker)}</span><span class="n">${esc(it.name)}</span><span class="x">${esc([it.type, it.exchange].filter(Boolean).join(" · "))}</span></li>`).join("")
  }
  const pick = it => { items = []; render(); input.value = ""; onPick(it.ticker) }
  input.addEventListener("input", () => {
    clearTimeout(timer)
    const q = input.value.trim()
    if (!q) { items = []; return render() }
    timer = setTimeout(async () => {
      last = q
      const got = await api("/api/search?q=" + encodeURIComponent(q)).catch(() => [])
      if (last !== q) return
      items = got; sel = got.length ? 0 : -1; render()
    }, 220)
  })
  input.addEventListener("keydown", e => {
    if (e.key === "ArrowDown" || e.key === "ArrowUp") {
      e.preventDefault()
      if (!items.length) return
      sel = (sel + (e.key === "ArrowDown" ? 1 : -1) + items.length) % items.length
      render()
    } else if (e.key === "Enter") {
      e.preventDefault()
      if (items[sel]) pick(items[sel])
      else if (input.value.trim()) pick({ ticker: input.value.trim().toUpperCase() })
    } else if (e.key === "Escape") { items = []; render() }
  })
  list.addEventListener("mousedown", e => {
    const li = e.target.closest("li")
    if (li) { e.preventDefault(); pick(items[+li.dataset.i]) }
  })
  input.addEventListener("blur", () => setTimeout(() => { items = []; render() }, 120))
}
attachSearch($("#q"), $("#results"), t => (location.hash = href(t)))
document.addEventListener("keydown", e => {
  if (e.key === "/" && !/INPUT|SELECT|TEXTAREA/.test(document.activeElement.tagName)) { e.preventDefault(); $("#q").focus() }
})

// ---------- favoritos ----------

let favs = []
api("/api/favs").then(f => (favs = f)).catch(() => {})
async function toggleFav(t) {
  const next = favs.includes(t) ? favs.filter(x => x !== t) : [...favs, t]
  favs = await api("/api/favs", next, "PUT")
  return favs.includes(t)
}

// ---------- explicações dos números ----------

const HELP = {
  ret: ["Retorno", "Quanto o preço variou no período, já somando os dividendos como se tivessem sido reinvestidos na própria ação. É o ganho real de quem segurou o papel."],
  ibov: ["Contra o Ibovespa", "Compara o retorno dessa ação com o do Ibovespa (a média da bolsa) nos mesmos 12 meses. Se ficou atrás, teria sido melhor comprar um ETF como o BOVA11."],
  range: ["Mínima e máxima de 52 semanas", "O menor e o maior preço do último ano. O tracinho mostra onde o preço está agora dentro dessa faixa."],
  vol: ["Volatilidade", "Mede o tamanho das oscilações. 20% ao ano é tranquilo pra ação, 40%+ é montanha-russa. Quanto maior, mais o preço chacoalha (pra cima e pra baixo)."],
  dd: ["Maior queda", "A maior perda do topo até o fundo no período. Mostra a pior dor que um acionista já sentiu segurando esse papel. Uma queda de 50% precisa subir 100% pra recuperar."],
  dy: ["Dividend yield", "Quanto a empresa pagou de dividendos e JCP nos últimos 12 meses, dividido pelo preço atual. É tipo o 'aluguel' que a ação paga."],
  pe: ["P/L (preço sobre lucro)", "Preço da ação dividido pelo lucro por ação. Dá pra ler como 'quantos anos de lucro você está pagando'. Só compare com empresas do mesmo setor."],
  eps: ["LPA (lucro por ação)", "O lucro dos últimos 12 meses dividido pelo número de ações. Negativo significa prejuízo."],
  cap: ["Valor de mercado", "Preço da ação vezes a quantidade de ações. É quanto a bolsa diz que a empresa inteira vale hoje."],
  ma: ["Média de 200 dias", "A média dos preços dos últimos ~10 meses. Preço acima dela costuma indicar tendência de alta no longo prazo; abaixo, de baixa."],
  liq: ["Volume médio", "Quantas ações trocam de mão por dia, em média. Volume alto = fácil comprar e vender sem mexer no preço."],
}
function helpBtn(k) { return `<button class="help" type="button" data-help="${k}" aria-label="O que é isso?">?</button>` }
document.addEventListener("click", e => {
  const b = e.target.closest("[data-help]")
  if (!b) return
  const [t, body] = HELP[b.dataset.help]
  const d = document.createElement("dialog")
  d.innerHTML = `<h3>${esc(t)}</h3><p>${esc(body)}</p><button class="btn" autofocus>Entendi</button>`
  d.querySelector("button").onclick = () => d.close()
  d.addEventListener("close", () => d.remove())
  d.addEventListener("click", ev => ev.target === d && d.close())
  document.body.append(d)
  d.showModal()
})

// ---------- telas ----------

async function home() {
  view.innerHTML = `
    ${store("r8.hello") ? "" : `<section class="hello">
      <h1>Bem-vindo à bolsa 👋</h1>
      <p>Clica em qualquer empresa pra ver o raio-x dela explicado em português claro. Se nunca investiu, começa pela aba <b>Aprenda</b>; se quer ver quanto teria ganhado, vai no <b>E se?</b>.</p>
      <div class="row"><a class="btn primary" href="#/aprenda">Começar pelo básico</a><a class="btn" href="#/simular">E se eu tivesse investido?</a><button class="x-close" id="hide-hello">não mostrar mais</button></div>
    </section>`}
    <section><div class="section-title"><h2>Como está o mercado</h2><p id="when"></p></div><div class="indices">${'<div class="skeleton"></div>'.repeat(4)}</div></section>
    <div id="groups">${'<section><div class="tiles">' + '<div class="skeleton"></div>'.repeat(5) + "</div></section>"}</div>`
  $("#hide-hello")?.addEventListener("click", () => { store("r8.hello", "1"); $(".hello").remove() })
  let d
  try { d = await api("/api/home") } catch (e) { return toast(e.message) }
  if (!view.isConnected || location.hash.split("/")[1] !== "hoje" && location.hash) return
  $(".indices").innerHTML = d.indices.map(q => tile(q, true)).join("")
  const t = d.indices.find(q => q.time)?.time
  if (t) $("#when").textContent = "Atualizado " + new Date(t * 1000).toLocaleString("pt-BR", { dateStyle: "short", timeStyle: "short" })
  const groups = d.favs.length ? [{ name: "⭐ Seus favoritos", items: d.favs }, ...d.groups] : d.groups
  $("#groups").innerHTML = groups.map(g => `<section><div class="section-title"><h2>${esc(g.name)}</h2></div><div class="tiles">${g.items.map(q => tile(q)).join("")}</div></section>`).join("")
}

function plainTalk(a) {
  const out = [], t = a.ticker, idx = a.type === "INDEX", fx = a.type === "CURRENCY"
  const r1 = a.returns["1a"]
  if (r1 != null) {
    let s = `Em 12 meses, ${idx ? "o índice" : fx ? "a cotação" : t} ${r1 >= 0 ? "subiu" : "caiu"} <b class="${cls(r1)}">${pct(Math.abs(r1), 1, false)}</b>${idx || fx ? "" : " (já contando os dividendos)"}.`
    if (a.ibov1a != null && !fx) s += ` O Ibovespa ${a.ibov1a >= 0 ? "subiu" : "caiu"} ${pct(Math.abs(a.ibov1a), 1, false)} no mesmo período, então ${t} foi <b>${r1 > a.ibov1a ? "melhor" : "pior"}</b> que a média da bolsa.`
    out.push(s)
  }
  const r5 = a.returns["5a"]
  if (r5 != null) out.push(`Quem investiu R$ 1.000 há 5 anos teria hoje <b>${money(1000 * (1 + r5))}</b>.`)
  if (a.vol1a != null && !fx) {
    const v = a.vol1a, lvl = v < 0.25 ? "baixa pra uma ação: costuma ser mais tranquila" : v < 0.4 ? "média: oscila bastante, normal pra bolsa" : "alta: é montanha-russa, prepare o estômago"
    out.push(`Volatilidade de ${pct(v, 0, false)} ao ano, ${idx ? "" : "o que é "}${lvl}.`)
  }
  if (a.dd5a != null) out.push(`Nos últimos 5 anos, a maior queda do topo ao fundo foi de <b class="down">${pct(Math.abs(a.dd5a), 0, false)}</b>. ${Math.abs(a.dd5a) > 0.4 ? "Já deu muito susto em quem tinha." : "É um tombo razoável pra bolsa."}`)
  if (a.ma200) out.push(`O preço está ${a.price > a.ma200 ? "<b class=up>acima</b>" : "<b class=down>abaixo</b>"} da média dos últimos 200 dias: sinal de tendência de ${a.price > a.ma200 ? "alta" : "baixa"} no longo prazo.`)
  if (!idx && !fx) {
    if (a.dy > 0) out.push(`Pagou ${money(a.div12m, a.currency)} por ação em dividendos/JCP nos últimos 12 meses: um "aluguel" de <b>${pct(a.dy, 1, false)} ao ano</b> sobre o preço de hoje.`)
    else out.push("Não pagou dividendos nos últimos 12 meses.")
    if (a.pe > 0) out.push(`Pelo lucro atual, o preço equivale a <b>${num(a.pe, 0)} anos de lucro</b> (P/L). ${a.pe < 8 ? "É baixo: o mercado está pessimista ou a ação está barata." : a.pe > 25 ? "É alto: o mercado espera muito crescimento." : "É um nível comum."}`)
    else if (a.pe != null && a.pe < 0) out.push("A empresa teve <b class=down>prejuízo</b> nos últimos 12 meses (P/L negativo).")
  }
  return out
}

async function asset(t) {
  if (!t) {
    view.innerHTML = `<div class="empty"><h2>Qual ativo você quer ver?</h2><p>Busca lá em cima pelo nome ou código. Ou começa por um desses:</p>
      <div class="chips">${["PETR4", "VALE3", "ITUB4", "WEGE3", "BBAS3", "ABEV3", "BOVA11", "IVVB11", "^BVSP"].map(x => `<a class="chip" href="${href(x)}">${x === "^BVSP" ? "IBOV" : x}</a>`).join("")}</div></div>`
    return
  }
  view.innerHTML = `<div class="skeleton" style="min-height:80px"></div><div class="skeleton" style="min-height:420px"></div>`
  let a
  try { a = await api("/api/asset/" + encodeURIComponent(t)) } catch (e) {
    view.innerHTML = `<div class="empty"><h2>Não achei “${esc(t)}”</h2><p>${esc(e.message)} Confere o código (ex: PETR4, WEGE3) ou usa a busca.</p></div>`
    return
  }
  const idx = a.type === "INDEX", fx = a.type === "CURRENCY", stock = !idx && !fx
  const fmtP = v => idx ? num(v, 0) : fx ? money(v, "BRL", 4) : money(v, a.currency)
  const r = a.returns, pos52 = (a.price - a.low52) / (a.high52 - a.low52 || 1)
  const fav = favs.includes(a.ticker)
  const range = store("r8.range") || "1"
  view.innerHTML = `
    <section class="asset-head">
      ${a.logo ? `<img src="${esc(a.logo)}" alt="" onerror="this.remove()">` : ""}
      <div class="who"><div class="t">${esc(NAMES[a.ticker] ? NAMES[a.ticker] : a.ticker)}</div><div class="n">${esc(a.name)}</div></div>
      <div class="price"><div class="p num">${fmtP(a.price)}</div><div class="num ${cls(r["1m"])}">${pct(r["1m"], 2)} <span class="dim">no mês</span></div></div>
      <button class="star" aria-pressed="${fav}" title="Favoritar" aria-label="Favoritar"><svg width="20" height="20" viewBox="0 0 24 24" fill="${fav ? "currentColor" : "none"}" stroke="currentColor" stroke-width="2"><path d="m12 3 2.8 5.7 6.2.9-4.5 4.4 1 6.2L12 17.3 6.5 20.2l1-6.2L3 9.6l6.2-.9z"/></svg></button>
    </section>
    <section class="plain"><h3>Em português claro</h3><ul>${plainTalk(a).map(s => `<li>${s}</li>`).join("")}</ul></section>
    <section class="card chart-card">
      <div class="chart-tools">
        <div class="seg" id="ranges">${[["0.084", "1M"], ["0.5", "6M"], ["1", "1A"], ["5", "5A"], ["10", "10A"], ["0", "Tudo"]].map(([v, l]) => `<button data-y="${v}" aria-pressed="${v === range}">${l}</button>`).join("")}</div>
        <div class="seg" id="opts"><button data-o="candle" aria-pressed="${store("r8.candle") === "1"}">Velas</button><button data-o="ma50" aria-pressed="${store("r8.ma50") === "1"}">Média 50</button><button data-o="ma200" aria-pressed="${store("r8.ma200") !== "0"}">Média 200</button></div>
      </div>
      <div class="chart" id="chart"></div>
      <div class="legend"><span><i style="background:var(--accent)"></i>Preço</span><span id="lg50"><i style="background:var(--blue)"></i>Média 50 dias</span><span id="lg200"><i style="background:var(--violet)"></i>Média 200 dias</span><span><i style="background:#3A3D44"></i>Volume</span></div>
    </section>
    <section><div class="section-title"><h2>Raio-X</h2><p>Toca no ? pra entender cada número</p></div>
    <div class="metrics">
      <div class="metric"><div class="k">Retorno ${helpBtn("ret")}</div>
        <div class="rets">${[["1m", "1M"], ["6m", "6M"], ["1a", "1A"], ["5a", "5A"], ["10a", "10A"]].map(([k, l]) => `<div><span>${l}</span><b class="${cls(r[k])}">${pct(r[k], 0)}</b></div>`).join("")}</div></div>
      ${a.ibov1a != null && !fx ? `<div class="metric"><div class="k">Contra o Ibovespa (1 ano) ${helpBtn("ibov")}</div><div class="v ${cls(r["1a"] - a.ibov1a)}">${pct(r["1a"] - a.ibov1a, 1)}</div><div class="e">${esc(a.ticker)} ${pct(r["1a"])} vs Ibovespa ${pct(a.ibov1a)}</div></div>` : ""}
      <div class="metric"><div class="k">Faixa de 52 semanas ${helpBtn("range")}</div><div class="range"><b style="left:${Math.max(0, Math.min(1, pos52)) * 100}%"></b></div><div class="e num">${fmtP(a.low52)} a ${fmtP(a.high52)}</div><div class="e">${a.price >= a.high52 * 0.999 ? "Na máxima do ano" : pct(a.price / a.high52 - 1, 1) + " da máxima"}</div></div>
      <div class="metric"><div class="k">Volatilidade (1 ano) ${helpBtn("vol")}</div><div class="v">${pct(a.vol1a, 0, false)}</div><div class="e">${a.vol1a < 0.25 ? "Tranquila" : a.vol1a < 0.4 ? "Agitada" : "Montanha-russa"}</div></div>
      <div class="metric"><div class="k">Maior queda (5 anos) ${helpBtn("dd")}</div><div class="v down">${pct(a.dd5a, 0)}</div><div class="e">Desde ${a.first.slice(0, 4)}: ${pct(a.ddMax, 0)}</div></div>
      ${a.ma200 ? `<div class="metric"><div class="k">Média de 200 dias ${helpBtn("ma")}</div><div class="v num">${fmtP(a.ma200)}</div><div class="e">Preço ${pct(a.price / a.ma200 - 1, 1)} ${a.price > a.ma200 ? "acima" : "abaixo"} da média</div></div>` : ""}
      ${stock ? `
      <div class="metric"><div class="k">Dividend yield (12 meses) ${helpBtn("dy")}</div><div class="v">${pct(a.dy, 1, false)}</div><div class="e">${money(a.div12m, a.currency)} por ação</div></div>
      <div class="metric"><div class="k">P/L ${helpBtn("pe")}</div><div class="v ${a.pe < 0 ? "down" : ""}">${num(a.pe, 1)}</div><div class="e">${a.pe == null ? "Sem dado de lucro" : a.pe < 0 ? "Teve prejuízo" : `${num(a.pe, 0)} anos de lucro`}</div></div>
      <div class="metric"><div class="k">LPA ${helpBtn("eps")}</div><div class="v">${a.eps == null ? "—" : money(a.eps, a.currency)}</div><div class="e">Lucro por ação em 12 meses</div></div>
      <div class="metric"><div class="k">Valor de mercado ${helpBtn("cap")}</div><div class="v">${a.marketCap ? "R$ " + big(a.marketCap) : "—"}</div><div class="e">Quanto a bolsa diz que a empresa vale</div></div>
      <div class="metric"><div class="k">Volume médio ${helpBtn("liq")}</div><div class="v">${big(a.avgVolume)}</div><div class="e">ações por dia no último ano</div></div>` : ""}
    </div></section>
    ${a.dividends.length ? `<section class="card"><div class="section-title"><h2>Últimos proventos</h2><p>Dividendos e JCP, por ação, na data-com</p></div><div class="scroll-x"><table class="tbl"><thead><tr><th>Data</th><th>Valor por ação</th><th>Sobre o preço de hoje</th></tr></thead><tbody>
      ${a.dividends.map(d => `<tr><td>${br(d.date)}</td><td>${money(d.value, a.currency, 4)}</td><td>${pct(d.value / a.price, 2, false)}</td></tr>`).join("")}</tbody></table></div></section>` : ""}
    <section class="cta"><a class="btn primary" href="#/simular?t=${encodeURIComponent(a.ticker)}">E se eu tivesse investido?</a><a class="btn" href="#/lab?t=${encodeURIComponent(a.ticker)}">Testar estratégias com ML</a></section>`

  $(".star").onclick = async e => {
    const b = e.currentTarget
    try {
      const on = await toggleFav(a.ticker)
      b.setAttribute("aria-pressed", on); b.querySelector("svg").setAttribute("fill", on ? "currentColor" : "none")
      toast(on ? `${a.ticker} nos favoritos. Aparece na tela inicial.` : `${a.ticker} saiu dos favoritos.`)
    } catch (err) { toast(err.message) }
  }

  const chart = makeChart($("#chart"))
  const opt = k => $(`#opts [data-o=${k}]`).getAttribute("aria-pressed") === "true"
  let series = []
  async function draw(years) {
    let d
    try { d = await api(`/api/chart/${encodeURIComponent(t)}?years=${years}`) } catch (e) { return toast(e.message) }
    series.forEach(s => chart.removeSeries(s)); series = []
    const vol = chart.addSeries(LC.HistogramSeries, { priceScaleId: "vol", priceFormat: { type: "volume" }, color: "#2A2D33", lastValueVisible: false, priceLineVisible: false })
    chart.priceScale("vol").applyOptions({ scaleMargins: { top: 0.82, bottom: 0 }, visible: false })
    vol.setData(d.volume); series.push(vol)
    if (opt("candle")) {
      const c = chart.addSeries(LC.CandlestickSeries, { upColor: "#34D399", downColor: "#F87171", borderVisible: false, wickUpColor: "#34D399", wickDownColor: "#F87171" })
      c.setData(d.candles); series.push(c)
    } else {
      const l = chart.addSeries(LC.AreaSeries, { lineColor: "#FFB020", topColor: "rgba(255,176,32,.22)", bottomColor: "rgba(255,176,32,0)", lineWidth: 2 })
      l.setData(d.candles.map(c => ({ time: c.time, value: c.close }))); series.push(l)
    }
    for (const [k, color] of [["ma50", "#60A5FA"], ["ma200", "#A78BFA"]]) {
      $("#lg" + k.slice(2)).hidden = !opt(k)
      if (!opt(k) || !d[k].length) continue
      const m = chart.addSeries(LC.LineSeries, { color, lineWidth: 1.5, priceLineVisible: false, lastValueVisible: false, crosshairMarkerVisible: false })
      m.setData(d[k]); series.push(m)
    }
    chart.timeScale().fitContent()
  }
  const current = () => $("#ranges [aria-pressed=true]").dataset.y
  $("#ranges").onclick = e => {
    const b = e.target.closest("button"); if (!b) return
    $$("#ranges button").forEach(x => x.setAttribute("aria-pressed", x === b))
    store("r8.range", b.dataset.y); draw(b.dataset.y)
  }
  $("#opts").onclick = e => {
    const b = e.target.closest("button"); if (!b) return
    const on = b.getAttribute("aria-pressed") !== "true"
    b.setAttribute("aria-pressed", on); store("r8." + b.dataset.o, on ? "1" : "0"); draw(current())
  }
  draw(current())
}

// picker de vários ativos (chips + busca)
function picker(el, initial, max, onChange) {
  let list = [...initial]
  el.innerHTML = `<span class="chips-in"></span><input placeholder="Adicionar ativo…" aria-label="Adicionar ativo"><ul class="results" role="listbox" hidden></ul>`
  const paint = () => {
    $(".chips-in", el).innerHTML = list.map((t, i) => `<span class="chip" style="border-color:${COLORS[i % COLORS.length]}">${esc(t)}<button type="button" data-rm="${i}" aria-label="Tirar ${esc(t)}">×</button></span>`).join("")
    $("input", el).hidden = list.length >= max
    onChange?.(list)
  }
  el.addEventListener("click", e => { const b = e.target.closest("[data-rm]"); if (b) { list.splice(+b.dataset.rm, 1); paint() } })
  attachSearch($("input", el), $("ul", el), t => { if (!list.includes(t) && list.length < max) list.push(t); paint(); $("input", el).focus() })
  paint()
  return { get: () => list }
}

function params() { return new URLSearchParams(location.hash.split("?")[1] || "") }

function simulate() {
  const t = params().get("t")
  const initial = t ? [t, "IBOV"].filter((x, i, a) => a.indexOf(x) === i) : ["BOVA11", "IVVB11", "PETR4"]
  view.innerHTML = `
    <section><div class="section-title"><h2>E se eu tivesse investido?</h2></div>
    <p class="muted" style="max-width:70ch">Escolhe até 5 ativos, quanto e desde quando. O r8 calcula quanto você teria hoje, contando os dividendos reinvestidos. A linha de renda fixa é uma aplicação hipotética que rende a taxa que você escolher, pra comparar com o CDI de verdade.</p></section>
    <form class="card form" id="sim">
      <label class="field"><span>Ativos</span><div class="picker" id="pk"></div></label>
      <div class="row">
        <label class="field"><span>Investimento inicial (R$)</span><input class="input num" name="amount" type="number" min="0" step="100" value="1000"></label>
        <label class="field"><span>Aporte todo mês (R$)</span><input class="input num" name="monthly" type="number" min="0" step="50" value="0"><small>0 = só o inicial</small></label>
        <label class="field"><span>Começando em</span><input class="input num" name="start" type="date" value="${yearsAgo(5)}" min="2000-01-01" max="${new Date().toISOString().slice(0, 10)}"></label>
        <label class="field"><span>Renda fixa pra comparar (% a.a.)</span><input class="input num" name="rate" type="number" min="0" max="50" step="0.5" value="10"><small>0 = esconder</small></label>
      </div>
      <div class="cta"><button class="btn primary">Calcular</button>
        <span class="seg" id="presets">${[[1, "1 ano"], [3, "3 anos"], [5, "5 anos"], [10, "10 anos"], [20, "20 anos"]].map(([y, l]) => `<button type="button" data-y="${y}">${l}</button>`).join("")}</span></div>
    </form>
    <div id="out"></div>`
  const pk = picker($("#pk"), initial, 5)
  const form = $("#sim")
  $("#presets").onclick = e => { const b = e.target.closest("button"); if (b) { form.start.value = yearsAgo(+b.dataset.y); form.requestSubmit() } }
  form.onsubmit = async e => {
    e.preventDefault()
    const tickers = pk.get()
    if (!tickers.length) return toast("Adiciona pelo menos um ativo.")
    const btn = $("button.primary", form); btn.disabled = true; btn.innerHTML = `<span class="spin"></span> Calculando`
    try {
      const d = await api("/api/simulate", { tickers: tickers.map(x => x === "IBOV" ? "^BVSP" : x), amount: +form.amount.value, monthly: +form.monthly.value, start: form.start.value, rate: +form.rate.value })
      showSim(d)
    } catch (err) { toast(err.message) } finally { btn.disabled = false; btn.textContent = "Calcular" }
  }
  form.requestSubmit()
}

function showSim(d) {
  clearCharts()
  const names = Object.keys(d.lines), inv = d.invested.at(-1)
  const rows = names.map(n => ({ n, v: d.lines[n].at(-1) })).sort((a, b) => b.v - a.v)
  const best = rows[0]
  const years = ((new Date(d.days.at(-1)) - new Date(d.days[0])) / 3.156e10)
  $("#out").innerHTML = `
    <section class="plain"><h3>Resultado</h3><ul>
      <li>Você teria colocado <b>${money(inv)}</b> do bolso em ${num(years, 1)} anos.</li>
      <li>O melhor foi <b>${esc(best.n)}</b>: hoje valeria <b class="${cls(best.v - inv)}">${money(best.v)}</b> (${pct(best.v / inv - 1)}).</li>
      ${rows.length > 1 ? `<li>O pior foi <b>${esc(rows.at(-1).n)}</b>, com <b class="${cls(rows.at(-1).v - inv)}">${money(rows.at(-1).v)}</b>. Por isso diversificar importa: ninguém sabe de antemão qual vai ser qual.</li>` : ""}
    </ul></section>
    <section class="card chart-card"><div class="chart" id="simchart"></div>
      <div class="legend">${names.map((n, i) => `<span><i style="background:${COLORS[i % COLORS.length]}"></i>${esc(n)}</span>`).join("")}<span><i style="background:#6B6E76"></i>Dinheiro do bolso</span></div></section>
    <section class="card scroll-x"><table class="tbl"><thead><tr><th>Ativo</th><th>Do bolso</th><th>Valor final</th><th>Lucro</th><th>Retorno</th><th>Ao ano</th></tr></thead><tbody>
      ${rows.map(r => {
        const total = r.v / inv - 1
        // "ao ano" só é exato sem aportes; com aportes é uma aproximação
        const cagr = Math.pow(r.v / inv, 1 / Math.max(years, 0.01)) - 1
        return `<tr><td>${esc(r.n)}</td><td>${money(inv)}</td><td>${money(r.v)}</td><td class="${cls(r.v - inv)}">${money(r.v - inv)}</td><td class="${cls(total)}">${pct(total)}</td><td class="${cls(cagr)}">${+d.invested[0] === inv ? pct(cagr) : "—"}</td></tr>`
      }).join("")}</tbody></table></section>`
  const chart = makeChart($("#simchart"))
  names.forEach((n, i) => {
    const s = chart.addSeries(LC.LineSeries, { color: COLORS[i % COLORS.length], lineWidth: 2, priceLineVisible: false, title: "" })
    s.setData(d.days.map((t, j) => ({ time: t, value: d.lines[n][j] })))
  })
  const s = chart.addSeries(LC.LineSeries, { color: "#6B6E76", lineWidth: 1, lineStyle: LC.LineStyle.Dashed, priceLineVisible: false, lastValueVisible: false })
  s.setData(d.days.map((t, j) => ({ time: t, value: d.invested[j] })))
  chart.timeScale().fitContent()
}

let models
async function lab() {
  models = models || await api("/api/lab/models").catch(e => (toast(e.message), []))
  const t = params().get("t") || "PETR4"
  const chosen = store("r8.model") || "floresta"
  view.innerHTML = `
    <section><div class="section-title"><h2>Laboratório</h2></div>
    <div class="notice">🧪 Aqui a gente testa se dá pra ganhar do mercado com regras e modelos de machine learning. Cada modelo decide, todo dia no fechamento, se fica <b>comprado</b> ou <b>de fora</b> no dia seguinte. Ele treina só com o passado e é avaliado num período que nunca viu (e retreina a cada trimestre). Tudo é comparado com o simples <b>comprar e segurar</b>, já descontando um custo de 0,05% por operação. Spoiler: ganhar do mercado é difícil, e entender o porquê é a melhor lição.</div></section>
    <form class="card form" id="labf">
      <div class="row">
        <label class="field"><span>Ativo</span><div class="picker" id="pk"></div></label>
        <label class="field"><span>Testar nos últimos</span><select class="input" name="years">${[1, 2, 3, 5, 8, 10].map(y => `<option value="${y}"${y === 3 ? " selected" : ""}>${y} ano${y > 1 ? "s" : ""}</option>`).join("")}</select></label>
      </div>
      <div class="field"><span>Modelo</span><div class="models" id="models">${models.map(m => `<button type="button" class="model" data-m="${m.id}" aria-pressed="${m.id === chosen}"><span class="kind ${m.kind.split(" ")[0]}">${esc(m.kind)}</span><b>${esc(m.name)}</b><span>${esc(m.about)}</span></button>`).join("")}</div></div>
      <div class="row" id="mparams"></div>
      <div class="cta"><button class="btn primary" id="run">Rodar o modelo</button><button type="button" class="btn" id="all">Comparar todos</button></div>
    </form>
    <div id="out"></div>`
  const pk = picker($("#pk"), [t], 1)
  const form = $("#labf")
  const model = () => $("#models [aria-pressed=true]")?.dataset.m
  const paramFields = () => {
    const m = model()
    $("#mparams").innerHTML = m === "medias"
      ? `<label class="field"><span>Média curta (dias)</span><input class="input num" name="short" type="number" min="2" max="200" value="20"></label><label class="field"><span>Média longa (dias)</span><input class="input num" name="long" type="number" min="5" max="400" value="100"></label>`
      : m === "momentum" ? `<label class="field"><span>Olhar os últimos (dias)</span><input class="input num" name="days" type="number" min="5" max="400" value="120"></label>`
      : ["logistica", "knn", "floresta", "boosting", "rede"].includes(m) ? `<label class="field"><span>Só compra se a chance de subir for maior que</span><select class="input" name="threshold">${[0.5, 0.52, 0.55, 0.6].map(v => `<option value="${v}">${v * 100}%</option>`).join("")}</select><small>Mais alto = mais exigente, opera menos</small></label>` : ""
  }
  $("#models").onclick = e => {
    const b = e.target.closest(".model"); if (!b) return
    $$("#models .model").forEach(x => x.setAttribute("aria-pressed", x === b)); store("r8.model", b.dataset.m); paramFields()
  }
  paramFields()
  const ticker = () => { const x = pk.get()[0]; return x === "IBOV" ? "^BVSP" : x }
  const collect = () => Object.fromEntries($$("#mparams [name]").map(i => [i.name, +i.value]))
  form.onsubmit = async e => {
    e.preventDefault()
    if (!ticker()) return toast("Escolhe um ativo.")
    const btn = $("#run"); btn.disabled = true; btn.innerHTML = `<span class="spin"></span> Treinando…`
    try { showLab(await api("/api/lab/run", { ticker: ticker(), model: model(), years: +form.years.value, params: collect() }), ticker()) }
    catch (err) { toast(err.message) } finally { btn.disabled = false; btn.textContent = "Rodar o modelo" }
  }
  $("#all").onclick = async () => {
    if (!ticker()) return toast("Escolhe um ativo.")
    const btn = $("#all"); btn.disabled = true; $("#run").disabled = true
    clearCharts()
    const rows = []
    let hold
    for (const [i, m] of models.entries()) {
      btn.innerHTML = `<span class="spin"></span> ${i + 1}/${models.length}: ${esc(m.name)}`
      try {
        const d = await api("/api/lab/run", { ticker: ticker(), model: m.id, years: +form.years.value, params: {} })
        rows.push({ ...m, s: d.stats.strategy, acc: d.accuracy, base: d.baseline }); hold = d
      } catch (err) { toast(err.message); break }
      showBoard(rows, hold)
    }
    btn.disabled = false; $("#run").disabled = false; btn.textContent = "Comparar todos"
  }
}

function statRows(s, h) {
  const r = (label, k, f, better) => {
    const a = s[k], b = h?.[k]
    const win = b == null ? "" : (better === "high" ? a > b : a < b) ? "up" : "down"
    return `<tr><td>${label}</td><td class="${better ? win : ""}">${f(a)}</td>${h ? `<td>${f(b)}</td>` : ""}</tr>`
  }
  return [
    r("Retorno total", "total", v => pct(v), "high"),
    r("Retorno ao ano", "cagr", v => pct(v), "high"),
    r("Maior queda", "dd", v => pct(v, 0), "high"),
    r("Volatilidade", "vol", v => pct(v, 0, false), "low"),
    r("Sharpe (retorno ÷ risco)", "sharpe", v => num(v, 2), "high"),
    r("Tempo comprado", "exposure", v => pct(v, 0, false)),
    r("Operações", "trades", v => num(v, 0)),
  ].join("")
}

function showLab(d, t) {
  clearCharts()
  const s = d.stats.strategy, h = d.stats.hold
  const won = s.total > h.total, edge = d.accuracy - d.baseline
  $("#out").innerHTML = `
    <section class="verdict" style="border-left:3px solid ${won ? "var(--up)" : "var(--down)"}">
      <h3>${won ? "✅" : "❌"} ${esc(d.model)} ${won ? "ganhou" : "perdeu"} do comprar e segurar</h3>
      <p>De ${br(d.from)} a ${br(d.to)}, R$ 1.000 virariam <b class="${cls(s.total)}">${money(1000 * (1 + s.total))}</b> seguindo o modelo, contra <b class="${cls(h.total)}">${money(1000 * (1 + h.total))}</b> só segurando ${esc(t)}.</p>
      ${d.kind !== "Regra" ? `<p>O modelo acertou a direção do dia seguinte em <b>${pct(d.accuracy, 1, false)}</b> dos dias. Quem chutasse "sobe" todo dia acertaria <b>${pct(d.baseline, 1, false)}</b>. ${edge > 0.02 ? "Uma vantagem pequena, mas pode ser sorte: testa em outros ativos e períodos." : "Ou seja, o modelo não achou nada que um chute simples não ache. Isso é normal e é a lição mais importante daqui."}</p>` : ""}
      ${won && s.sharpe < h.sharpe ? "<p>Atenção: ganhou no retorno, mas com pior relação retorno/risco (Sharpe).</p>" : ""}
      ${!won && s.dd > h.dd ? `<p>Ponto a favor: a maior queda foi menor (${pct(s.dd, 0)} vs ${pct(h.dd, 0)}). Às vezes uma estratégia vale pra sofrer menos, não pra ganhar mais.</p>` : ""}
    </section>
    <section class="card chart-card"><div class="chart" id="labchart"></div>
      <div class="legend"><span><i style="background:#FFB020"></i>${esc(d.model)}</span><span><i style="background:#60A5FA"></i>Comprar e segurar</span><span><i style="background:rgba(52,211,153,.35)"></i>Dias comprado</span></div></section>
    <div class="grid2">
      <section class="card scroll-x"><table class="tbl"><thead><tr><th></th><th>Modelo</th><th>Segurar</th></tr></thead><tbody>${statRows(s, h)}</tbody></table></section>
      ${d.importance ? `<section class="card"><div class="section-title"><h2>No que o modelo mais prestou atenção</h2></div><div class="bars">${d.importance.map(f => `<div class="bar"><span>${esc(f.feature)}</span><div><i style="width:${f.value / d.importance[0].value * 100}%"></i></div><b>${pct(f.value, 0, false)}</b></div>`).join("")}</div></section>`
      : `<section class="card"><div class="section-title"><h2>Como funciona</h2></div><p class="muted">${esc(d.about)}</p></section>`}
    </div>`
  const chart = makeChart($("#labchart"))
  const pos = chart.addSeries(LC.HistogramSeries, { priceScaleId: "pos", color: "rgba(52,211,153,.07)", lastValueVisible: false, priceLineVisible: false })
  chart.priceScale("pos").applyOptions({ scaleMargins: { top: 0, bottom: 0 }, visible: false })
  pos.setData(d.days.map((t, i) => ({ time: t, value: d.position[i] })))
  for (const [k, color] of [["hold", "#60A5FA"], ["strategy", "#FFB020"]]) {
    const l = chart.addSeries(LC.LineSeries, { color, lineWidth: 2, priceLineVisible: false })
    l.setData(d.days.map((t, i) => ({ time: t, value: 1000 * d[k][i] })))
  }
  chart.timeScale().fitContent()
}

function showBoard(rows, hold) {
  const all = [...rows].sort((a, b) => b.s.total - a.s.total)
  const h = hold.stats.hold
  $("#out").innerHTML = `
    <section class="card scroll-x"><div class="section-title"><h2>Placar</h2><p>De ${br(hold.from)} a ${br(hold.to)}</p></div>
    <table class="tbl"><thead><tr><th>Modelo</th><th>Retorno</th><th>Ao ano</th><th>Maior queda</th><th>Sharpe</th><th>Acerto</th></tr></thead><tbody>
    ${all.map(r => `<tr><td>${esc(r.name)} <span class="kind ${r.kind.split(" ")[0]}">${esc(r.kind)}</span></td><td class="${r.s.total > h.total ? "up" : "down"}">${pct(r.s.total)}</td><td>${pct(r.s.cagr)}</td><td>${pct(r.s.dd, 0)}</td><td>${num(r.s.sharpe, 2)}</td><td>${r.kind === "Regra" ? "—" : pct(r.acc, 1, false)}</td></tr>`).join("")}
    <tr><td><b>Comprar e segurar</b></td><td><b>${pct(h.total)}</b></td><td>${pct(h.cagr)}</td><td>${pct(h.dd, 0)}</td><td>${num(h.sharpe, 2)}</td><td class="dim">chute "sobe": ${pct(rows[0].base, 1, false)}</td></tr>
    </tbody></table></section>
    <p class="muted">Verde = ganhou do comprar e segurar. Roda o mesmo placar em outros ativos e períodos: se o vencedor muda toda hora, provavelmente foi sorte.</p>`
}

function learn() {
  view.innerHTML = `
    <section class="hello"><h1>Aprenda o básico</h1><p>14 lições curtas, sem enrolação. Lê na ordem se está começando do zero; cada uma tem um atalho pra ver aquilo na prática aqui no r8.</p></section>
    <div class="lessons">${LESSONS.map((l, i) => `<details class="lesson"${i === 0 ? " open" : ""}><summary><span class="i">${i + 1}</span>${esc(l.title)}</summary><div class="body">${l.body}${l.link ? `<p><a class="btn" href="${l.link[0]}">${esc(l.link[1])}</a></p>` : ""}</div></details>`).join("")}</div>`
}

// ---------- rotas ----------

function route() {
  clearCharts()
  const [, tab = "hoje", arg] = location.hash.split("?")[0].split("/")
  $$(".tabs a").forEach(a => a.dataset.tab === tab ? a.setAttribute("aria-current", "page") : a.removeAttribute("aria-current"))
  window.scrollTo(0, 0)
  const fn = { hoje: home, ativo: () => asset(arg && decodeURIComponent(arg)), simular: simulate, lab, aprenda: learn }[tab] || home
  fn()
}
addEventListener("hashchange", route)
route()
