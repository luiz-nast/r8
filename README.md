<div align="center">

# 🏁 r8

**Um laboratório de bolsa de valores pra quem está começando.**

Cotações reais da B3, raio-x de cada empresa explicado em português claro, simulador de "e se eu tivesse investido?" e um laboratório pra testar estratégias e modelos de machine learning no histórico de verdade.

![Python](https://img.shields.io/badge/Python-3.13-3776AB?logo=python&logoColor=white)
![FastAPI](https://img.shields.io/badge/FastAPI-009688?logo=fastapi&logoColor=white)
![scikit-learn](https://img.shields.io/badge/scikit--learn-ML-F7931E?logo=scikitlearn&logoColor=white)
![Lightweight Charts](https://img.shields.io/badge/Lightweight_Charts-v5-131722)
![Docker](https://img.shields.io/badge/Docker-compose-2496ED?logo=docker&logoColor=white)

</div>

---

## ✨ O que tem

App web de **um usuário só**, protegido por senha, funciona no celular e no computador.

| Aba | O que faz |
|---|---|
| **Hoje** | Ibovespa, dólar, euro e S&P 500, mais as ~30 ações e fundos mais negociados da B3 por setor, cada um com mini gráfico do mês. Seus favoritos aparecem em cima |
| **Ativo** | raio-x de qualquer ação, FII, ETF, índice ou moeda: resumo **"em português claro"**, gráfico (linha ou velas, médias de 50 e 200 dias, volume, de 1 mês até desde 2000), retorno em vários prazos, comparação com o Ibovespa, volatilidade, maior queda, dividend yield, P/L, LPA e os últimos proventos. Cada número tem um **?** que explica o que ele é |
| **E se?** | "se eu tivesse colocado R$ X em tal data, com R$ Y por mês…" para até 5 ativos ao mesmo tempo, com dividendos reinvestidos, contra uma renda fixa hipotética na taxa que você escolher |
| **Laboratório** | testa regras e modelos de ML no histórico real (detalhes abaixo) |
| **Aprenda** | 14 lições curtas, do "o que é uma ação" até "como começar de verdade", cada uma com atalho pra ver aquilo na prática |

Busca em qualquer tela (atalho `/`): digita o nome ou o código (WEG, PETR4, Itaú, BOVA11...).

## 🧪 Laboratório

Todo modelo joga o mesmo jogo: a cada pregão, no fechamento, decide se fica **comprado** ou **de fora** no dia seguinte. O teste é **walk-forward**: treina só com o passado, opera o trimestre seguinte, retreina com esse trimestre incluído e segue. Cada compra ou venda paga 0,05% de custo. O resultado sempre é comparado com o simples **comprar e segurar** e com o acerto de quem chuta "sobe" todo dia.

| Modelo | Tipo |
|---|---|
| Cruzamento de médias (20 × 100 dias, ajustável) | regra |
| Momentum (subiu nos últimos N dias?) | regra |
| Regressão logística | ML |
| KNN (50 vizinhos) | ML |
| Random Forest (200 árvores) | ML |
| Gradient Boosting | ML |
| Rede neural MLP (32 → 16) | deep learning (pequeno) |

Os indicadores que os modelos de ML recebem (retornos de 1/5/20/60 dias, distância das médias de 10/50/200, volatilidade, RSI, volume e o Ibovespa) estão em [`lab.py`](lab.py). O botão **Comparar todos** roda tudo e monta um placar.

Pra criar um modelo novo, escreve a função e registra em `MODELS` no `lab.py`.

## 📡 De onde vêm os dados

Só dado real, nada simulado:

| Fonte | O quê | Chave |
|---|---|---|
| Yahoo Finance (`query1.finance.yahoo.com`) | cotação, histórico diário desde 2000, dividendos, busca | não precisa. Não é API oficial, então pode mudar sem aviso |
| [brapi.dev](https://brapi.dev) | P/L, LPA, valor de mercado, logo | não precisa até 15 mil chamadas/mês. Se acabar, cria um token grátis e põe em `BRAPI_TOKEN` |

A API do Banco Central (Selic/CDI) barra o IP do servidor, por isso a renda fixa do simulador é uma taxa que você digita.

## 🪶 Leve de propósito

O servidor tem 1 vCPU e 4 GB de RAM pra tudo, então:

- o container tem limite de **640 MB** (usa ~180 MB) e numpy/scikit-learn rodam com 1 thread;
- na memória só ficam os 48 itens mais recentes. O histórico de cada ativo vai pra **`data/cache/`** em disco (~100 KB por ativo, comprimido) e some depois de 3 dias sem uso;
- um treino de modelo por vez; o mais pesado (Random Forest, 3 anos) leva uns 4 s.

## 📁 Estrutura

```
r8/
├── app.py            # rotas, login e favoritos
├── market.py         # Yahoo + brapi, cache em disco, raio-x e simulador
├── lab.py            # indicadores, modelos e backtest walk-forward
├── static/
│   ├── index.html, app.js, app.css
│   ├── lessons.js    # texto da aba Aprenda
│   ├── login.html
│   ├── fonts/        # Archivo e JetBrains Mono (OFL)
│   └── vendor/       # TradingView Lightweight Charts (Apache 2.0)
├── data/             # favoritos.json e cache/ (fora do git)
├── Dockerfile, compose.yaml, pyproject.toml, uv.lock
└── .env              # PASSWORD, SECRET e BRAPI_TOKEN (fora do git; ver .env.example)
```

## 🚀 Subir

```sh
git clone https://github.com/luiz-nast/r8.git /root/opala/project/r8
cd /root/opala/project/r8
cp .env.example .env     # defina PASSWORD e um SECRET aleatório
docker compose up -d --build
```

Escuta só em `127.0.0.1:8085`. No Caddy do host:

```caddy
r8.premiumlts.com.br {
reverse_proxy 127.0.0.1:8085
}
```

| Situação | Comando |
|---|---|
| mudou o código | `docker compose up -d --build` |
| mudou o `.env` | `docker compose up -d` (o `restart` não relê o `.env`) |
| trocou a senha | todo mundo é deslogado (o cookie é derivado dela) |
| limpar o cache | `rm -rf data/cache` |

Login: 5 senhas erradas em 15 minutos bloqueiam aquele IP por 15 minutos.

## ⚠️ Aviso

Isto é pra aprender. Nada aqui é recomendação de investimento, e desempenho passado não garante nada no futuro.

## 📄 Licenças

Fontes Archivo e JetBrains Mono: SIL Open Font License (arquivos em `static/fonts/`). [TradingView Lightweight Charts™](https://www.tradingview.com/lightweight-charts/): Apache 2.0 (`static/vendor/`), com o logo da TradingView no gráfico como pede a licença.
