// Conteúdo da aba "Aprenda". Cada lição pode apontar pra uma tela onde dá pra ver aquilo na prática.
const LESSONS = [
  {
    title: "O que é uma ação, afinal?",
    body: `<p>Uma <b>ação</b> é um pedacinho de uma empresa. Quando você compra uma ação da WEG, vira sócio da WEG, bem pequeninho mas sócio.</p>
<p>Você ganha dinheiro de dois jeitos:</p>
<ul><li><b>Valorização:</b> a empresa cresce, mais gente quer o pedaço dela, o preço sobe e você vende mais caro do que comprou.</li>
<li><b>Dividendos:</b> a empresa dá lucro e divide uma parte com os sócios, caindo direto na sua conta da corretora.</li></ul>
<p>E perde quando o preço cai. Ação não tem garantia nenhuma: é risco em troca de um retorno que, <i>no longo prazo</i>, costuma ser maior que o da renda fixa.</p>`,
    link: ["#/ativo/WEGE3", "Ver a WEG"],
  },
  {
    title: "Ticker: o que é PETR4, VALE3, BOVA11?",
    body: `<p>Cada ativo da bolsa tem um código, o <b>ticker</b>: 4 letras da empresa + um número.</p>
<ul><li><b>3</b> = ação <b>ordinária (ON)</b>: dá direito a voto nas assembleias. Ex: VALE3.</li>
<li><b>4</b> (ou 5, 6) = ação <b>preferencial (PN)</b>: não vota, mas tem preferência no recebimento de dividendos. Ex: PETR4, ITUB4.</li>
<li><b>11</b> = <b>units</b> (pacotes de ON+PN, ex: SANB11), <b>ETFs</b> (BOVA11) ou <b>fundos imobiliários</b> (HGLG11).</li></ul>
<div class="ex">PETR3 e PETR4 são a mesma empresa (Petrobras), só tipos diferentes de ação. Por isso o preço é parecido, mas não igual.</div>`,
  },
  {
    title: "Ibovespa: o termômetro da bolsa",
    body: `<p>O <b>Ibovespa</b> (IBOV) é uma média das ~85 ações mais negociadas da B3, com peso maior pras maiores. Quando o jornal diz "a bolsa subiu 1%", é o Ibovespa.</p>
<p>Ele serve de <b>régua</b>: se sua ação subiu 10% num ano em que o Ibovespa subiu 20%, você foi pior do que se tivesse comprado "a bolsa inteira". Na tela de cada ativo o r8 já faz essa comparação.</p>`,
    link: ["#/ativo/%5EBVSP", "Ver o Ibovespa"],
  },
  {
    title: "Dividendos, JCP e dividend yield",
    body: `<p><b>Dividendos</b> e <b>JCP</b> (juros sobre capital próprio) são a parte do lucro que a empresa reparte com os acionistas. Pra você, na prática, os dois são dinheiro na conta. A diferença está no imposto: o JCP já vem com imposto retido na fonte, e o dividendo é isento pra quase todo mundo (desde 2026 só é tributado acima de R$ 50 mil por mês vindos de uma mesma empresa).</p>
<p><b>Dividend yield (DY)</b> = quanto a ação pagou nos últimos 12 meses ÷ preço dela. É o "aluguel" da ação.</p>
<div class="ex">Ação a R$ 50 que pagou R$ 4 em 12 meses: DY de 8% ao ano.</div>
<p>Cuidado: DY altíssimo às vezes é porque o preço despencou (a empresa tá mal), ou foi um pagamento extraordinário que não se repete.</p>`,
    link: ["#/ativo/TAEE11", "Ver uma pagadora de dividendos"],
  },
  {
    title: "P/L e LPA: a ação está cara ou barata?",
    body: `<p><b>LPA</b> (lucro por ação) = lucro da empresa em 12 meses ÷ número de ações.</p>
<p><b>P/L</b> (preço/lucro) = preço da ação ÷ LPA. Uma leitura: <i>quantos anos de lucro</i> você está pagando.</p>
<div class="ex">Ação a R$ 48 com LPA de R$ 4: P/L 12. Você paga 12 anos do lucro atual.</div>
<ul><li>P/L baixo pode ser barganha... ou o mercado esperando que o lucro vá cair.</li>
<li>P/L alto pode ser bolha... ou uma empresa que cresce rápido (ex: WEG costuma ter P/L alto).</li>
<li>P/L negativo = a empresa teve prejuízo.</li></ul>
<p>Só faz sentido comparar P/L entre empresas parecidas (banco com banco, varejo com varejo).</p>`,
  },
  {
    title: "Volatilidade: o tamanho do chacoalhão",
    body: `<p><b>Volatilidade</b> mede o quanto o preço sobe e desce. É calculada pelo desvio padrão dos retornos diários, "anualizado".</p>
<ul><li>~15–25% ao ano: tranquila pra ação (bancões, elétricas).</li>
<li>~30–45%: agitada (petróleo, mineração).</li>
<li>50%+: montanha-russa (varejo em crise, small caps).</li></ul>
<p>Volatilidade é o preço que você paga pelo retorno maior. A pergunta é: você dorme tranquilo vendo sua ação cair 20% num mês?</p>`,
  },
  {
    title: "Maior queda (drawdown)",
    body: `<p>O <b>drawdown</b> é quanto o ativo caiu do topo até o fundo. É a medida mais honesta de risco: mostra a pior dor que um investidor sentiu.</p>
<div class="ex">Uma queda de 50% precisa de uma alta de <b>100%</b> só pra voltar ao zero a zero. Perder é mais "caro" que ganhar.</div>
<p>Em 2020, na pandemia, o Ibovespa caiu ~47% em um mês e levou quase um ano pra recuperar.</p>`,
  },
  {
    title: "Médias móveis",
    body: `<p>Uma <b>média móvel de 200 dias</b> é a média dos preços de fechamento dos últimos 200 pregões (~10 meses), recalculada todo dia. Ela "alisa" o gráfico e mostra a tendência.</p>
<ul><li>Preço <b>acima</b> da média de 200: tendência de alta no longo prazo.</li>
<li>Preço <b>abaixo</b>: tendência de baixa.</li>
<li>Quando a média curta cruza a longa pra cima, é o famoso "cruzamento dourado".</li></ul>
<p>Liga as médias no gráfico de qualquer ativo, e no Laboratório dá pra testar se operar esse cruzamento teria dado dinheiro.</p>`,
    link: ["#/lab", "Testar no laboratório"],
  },
  {
    title: "ETFs e fundos imobiliários (FIIs)",
    body: `<p><b>ETF</b> é um fundo negociado na bolsa que copia um índice. Comprando uma cota de <b>BOVA11</b>, você tem um pedacinho de todas as ações do Ibovespa de uma vez. <b>IVVB11</b> copia o S&P 500 (as 500 maiores dos EUA). <b>SMAL11</b>, as empresas menores do Brasil.</p>
<p><b>FII</b> (fundo imobiliário) junta dinheiro de muita gente pra ter galpões, shoppings, lajes corporativas ou títulos de dívida imobiliária, e repassa os aluguéis todo mês. Ex: HGLG11 (galpões logísticos), MXRF11 (papel).</p>
<p>Pra quem está começando, ETF é o jeito mais simples de diversificar.</p>`,
    link: ["#/simular", "Simular BOVA11 vs IVVB11"],
  },
  {
    title: "Diversificação: não pôr todos os ovos na mesma cesta",
    body: `<p>Uma empresa sozinha pode quebrar (lembra de Americanas, Oi). Dez empresas de setores diferentes dificilmente quebram juntas.</p>
<p>Diversificar reduz o risco <i>sem</i> reduzir muito o retorno esperado. É o único "almoço grátis" do mercado.</p>
<ul><li>Entre setores (banco, energia, consumo, commodities).</li>
<li>Entre classes (ações, FIIs, renda fixa).</li>
<li>Entre países (IVVB11, por exemplo).</li></ul>`,
  },
  {
    title: "Renda fixa, Selic e CDI: a régua de tudo",
    body: `<p>A <b>Selic</b> é a taxa básica de juros, definida pelo Banco Central. O <b>CDI</b> anda praticamente colado nela. Um CDB que paga "100% do CDI" rende quase a Selic, com risco baixíssimo (e garantia do FGC até R$ 250 mil).</p>
<p>Por isso, toda ação precisa responder: <b>"vale mais a pena do que deixar no CDI?"</b> Com Selic alta, a renda fixa fica muito competitiva, e é por isso que a bolsa costuma sofrer quando os juros sobem.</p>
<p>No simulador "E se?", a linha de renda fixa serve exatamente pra essa comparação.</p>`,
    link: ["#/simular", "Comparar com a renda fixa"],
  },
  {
    title: "Juros compostos e aporte mensal",
    body: `<p>O segredo de quase todo mundo que enriqueceu investindo é chato: <b>tempo + aporte constante</b>. O rendimento de um mês passa a render no mês seguinte (juros sobre juros).</p>
<div class="ex">R$ 500 por mês a 10% ao ano por 20 anos: você coloca R$ 120 mil e termina com uns R$ 360 mil. Dois terços vieram dos juros.</div>
<p>No simulador, coloca um aporte mensal e vê a diferença entre "dinheiro investido" e "valor final".</p>`,
    link: ["#/simular", "Abrir o simulador"],
  },
  {
    title: "Por que prever a bolsa é tão difícil (e o que o ML ensina)",
    body: `<p>Se o preço de amanhã fosse fácil de prever, todo mundo compraria hoje e o preço subiria hoje mesmo. Essa é a ideia do <b>mercado eficiente</b>: a informação já está no preço.</p>
<p>Na prática, modelos de ML acertam a direção do dia seguinte uns 50–53% das vezes, quase um cara ou coroa. E depois dos custos, muita "estratégia vencedora" vira perdedora.</p>
<p>O valor do Laboratório é aprender a <b>testar ideias honestamente</b>: treinar só com o passado, testar num período que o modelo nunca viu, e comparar sempre com o simples "comprar e segurar".</p>
<ul><li><b>Overfitting:</b> o modelo decora o passado em vez de aprender um padrão. Vai lindo no treino e mal no mundo real.</li>
<li><b>Acurácia engana:</b> se a ação sobe em 53% dos dias, chutar "sobe" sempre já acerta 53%.</li></ul>`,
    link: ["#/lab", "Ir pro laboratório"],
  },
  {
    title: "Como começar de verdade",
    body: `<ul><li><b>Reserva de emergência primeiro:</b> uns 6 meses de gastos em renda fixa com liquidez diária (Tesouro Selic ou CDB 100% CDI). Só depois bolsa.</li>
<li><b>Abra conta numa corretora</b> (a maioria cobra corretagem zero pra ações). Você compra pelo app ou home broker.</li>
<li><b>Lote fracionário:</b> dá pra comprar 1 ação só, usando o ticker com F no final (ex: PETR4F).</li>
<li><b>Comece com ETF</b> (BOVA11, IVVB11) se não quiser escolher empresa.</li>
<li><b>Imposto de renda:</b> pela regra atual, vendas de ações até R$ 20 mil no mês são isentas de IR sobre o lucro; acima disso, 15% via DARF. ETFs e FIIs têm regras diferentes. Essas regras mudam de vez em quando, então confere antes de vender.</li>
<li><b>Fuja de promessa de ganho fácil</b>, curso de day trade milagroso e "sinal" de grupo de WhatsApp.</li></ul>`,
  },
]
