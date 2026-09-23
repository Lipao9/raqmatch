# RaqMatch

Quiz bilíngue (pt-BR/en) para tenistas: responda 12 perguntas e receba 3 raquetes escolhidas para o seu jogo, com justificativas no seu idioma.

## Como funciona

1. O quiz codifica suas respostas na URL (`/results?skill=...`) — o link do resultado é compartilhável, nada é persistido.
2. `src/lib/prefilter.ts` reduz o catálogo (`data/rackets.json`) a ~25 candidatas por regras (orçamento, nível, peso, lesão no braço).
3. `/api/recommend` envia perfil + candidatas para o **Jev** (TypeSafe AI, via Vercel AI Gateway), um modelo de avaliação que não gera texto: para cada candidata responde, com probabilidade, uma pergunta por dimensão (potência, controle, braço, estilo, o que o jogador escreveu). `src/lib/jev.ts` combina as notas com pesos derivados das respostas, `src/lib/recommend.ts` escolhe 3 sem repetir versões da mesma raquete e `src/lib/justify.ts` monta a justificativa determinística a partir das specs e das regras — por isso ela nunca contradiz os badges do card. Se o gateway falhar, a ordem do prefilter decide e `quiz_runs.model` registra `prefilter-order`.

## Páginas de raquete (SEO)

Cada raquete do catálogo vira uma página estática em `/[locale]/racquets/[slug]` (o
`id` da raquete é o slug), pré-renderizada no build nos dois idiomas:

- `generateMetadata` com canonical + `hreflang` (incluindo `x-default`) via `src/lib/urls.ts`;
- JSON-LD `Product` + `BreadcrumbList` — sem `offers`, porque o preço é um valor
  scrapeado sem cadência de re-scrape e anunciar preço defasado em structured data
  é risco de mismatch;
- OG image dinâmica (`opengraph-image.tsx`, `next/og`);
- `/[locale]/racquets` lista tudo por marca; `sitemap.xml` e `robots.txt` são gerados
  a partir do catálogo. `/results` é `noindex` (página fina e por-visitante), mas
  segue crawlable para os previews de link funcionarem.

## Links de afiliado

`src/lib/affiliate.ts` centraliza o link de saída. Sem env var configurada, o link é
a URL crua da loja e o aviso de afiliado no rodapé fica escondido. Configure **um** dos dois:

```bash
AFFILIATE_PARAM=ctc AFFILIATE_ID=seu-id            # param anexado à URL da loja
AFFILIATE_URL_TEMPLATE='https://rede/click?url={url}'  # wrapper da rede; {url} recebe a URL encodada
```

Quando ativo, os links saem com `rel="sponsored nofollow noopener noreferrer"`. O
`buyUrl` das recomendações é montado no servidor (`/api/recommend`) para a config
não chegar ao bundle do cliente.

## Anúncios (Google AdSense)

`src/lib/ads.ts` é a única fonte de verdade. **Sem `NEXT_PUBLIC_ADSENSE_CLIENT_ID`
nada acontece**: o script não carrega, nenhum slot renderiza, `/ads.txt` dá 404, a
meta tag de propriedade some do `<head>` e o banner de consentimento não aparece.

```bash
NEXT_PUBLIC_ADSENSE_CLIENT_ID=ca-pub-...   # habilita o loader, /ads.txt e o banner
NEXT_PUBLIC_ADSENSE_SLOT_HOME=...          # um id por posição; sem id, a posição não renderiza
NEXT_PUBLIC_ADSENSE_SLOT_CATALOG=...
NEXT_PUBLIC_ADSENSE_SLOT_RACQUET=...
NEXT_PUBLIC_ADSENSE_SLOT_RESULTS=...
```

Como são `NEXT_PUBLIC_*`, os valores são **embutidos no build**. Trocar um id no
painel da Vercel não tem efeito até um novo build (`vercel redeploy`) — mesma
pegadinha do `NEXT_PUBLIC_SITE_URL`.

### Onde o anúncio pode aparecer

| Rota | Posição | Por quê |
| --- | --- | --- |
| `/` | abaixo do hero | fora da primeira dobra, não disputa com o CTA do quiz |
| `/racquets` | in-feed, após a 1ª marca | um só, para não virar parede de anúncio |
| `/racquets/[slug]` | após a tabela de specs | bem abaixo do botão de compra |
| `/results` | após as 3 recomendações | depois de todos os CTAs de afiliado |
| `/quiz`, `/privacy` | **nunca** | ver `AD_FREE_PREFIXES` |

`AD_FREE_PREFIXES` não é documentação, é regra: o `AdSlot` consulta a lista e se
recusa a renderizar (com aviso no console em dev), e o loader nem é baixado nessas
rotas. Isso importa porque o **Auto Ads do Google injeta unidades próprias em
qualquer página que carregue a biblioteca** — bloquear o script é a única garantia
que não depende de configuração no painel. **Desligue o Auto Ads no AdSense**, ou
ele sobrepõe as escolhas da tabela acima em todas as outras rotas.

O motivo econômico da política: um clique de afiliado numa raquete de R$ 1.500 a 16%
no Mercado Livre vale da ordem de mil impressões de AdSense neste nicho. Por isso
anúncio nenhum entra antes de um CTA de afiliado.

### Consentimento (LGPD)

`src/lib/consent.ts` guarda a escolha em `localStorage` (não cookie — não fragmenta
o cache das páginas estáticas). Três estados: aceitou → anúncios personalizados;
recusou ou ainda não escolheu → `requestNonPersonalizedAds = 1`, ou seja, anúncio
contextual sem perfilamento. Recusar não remove o anúncio, então o banner não
bloqueia a página e os dois botões têm o mesmo peso.

**Isto não é uma CMP certificada do IAB TCF**, e o Google exige uma para servir
anúncios a visitantes do EEE/Reino Unido. Quando `/en` começar a receber tráfego
europeu de verdade, `src/lib/consent.ts` é o ponto de troca — os componentes só
pedem um tri-state a ele.

### Propriedade do site e `/ads.txt`

Duas coisas distintas, fáceis de confundir quando o painel reclama:

| O quê | Onde mora | Para quê serve |
| --- | --- | --- |
| `<meta name="google-adsense-account">` | `generateMetadata` do layout de locale | diz ao Google que **este domínio é desta conta** |
| `/ads.txt` | `src/app/ads.txt/route.ts` | diz aos compradores que **o Google pode vender** este inventário |

A meta tag é renderizada **no servidor**, e isso é o ponto: o `AdsenseLoader` só
injeta a biblioteca depois da hidratação *e* depois que o efeito de consentimento
lê o `localStorage`, então o HTML cru não carrega publisher id nenhum. Um crawler
que não executa JS não via a conta em lugar algum do documento.

Ela vale em **toda** rota, inclusive nas de `AD_FREE_PREFIXES` — a tag não exibe
anúncio, só assina a propriedade. `/privacy` e `/contact` são livres de anúncio,
não deserdadas.

O status "ads.txt: não encontrado" no painel do AdSense **não prova que o arquivo
caiu**. Confira você mesmo antes de mexer em qualquer coisa:

```bash
curl -s https://raqmatch.com/ads.txt   # google.com, pub-…, DIRECT, f08c47fec0942fa0
```

Se isso responde 200 com o publisher id certo, o arquivo está bom e o status é só
o Google ainda não ter recrawleado: ele leva de dias a algumas semanas, e enquanto
o site está em "Preparando" (em revisão, sem servir anúncio) o Google não tem
motivo para voltar. `f08c47fec0942fa0` é o id da autoridade de certificação TAG do
Google, constante para todo publisher do AdSense — não é um valor a customizar.

### Antes de pedir aprovação no AdSense

- `/privacy` existe, está no sitemap e é linkada do rodapé de toda página (requisito).
- `NEXT_PUBLIC_CONTACT_EMAIL` precisa ser um endereço que **realmente receba**
  e-mail; o default é `contato@raqmatch.com`.
- `/ads.txt` responde com o publisher id (confira depois do primeiro deploy).
- `curl -s https://raqmatch.com/pt-BR | grep google-adsense-account` acha a meta tag.
- Considere adicionar páginas "Sobre" e "Contato" — não são obrigatórias como a de
  privacidade, mas ajudam na revisão.

## Banco de dados (opcional)

Postgres via Drizzle, usado só para medição — **sem `DATABASE_URL` o app roda
igual**: as gravações viram no-op e o rate limit cai para um contador em memória.

Tabelas: `quiz_runs` (perfil, status, modelo, tokens, latência), `recommendations`
(as 3 escolhas), `outbound_clicks` (raquete, loja, origem) e `rate_limits`.
A coluna `merchant` existe desde o início para uma segunda loja não exigir migração.

### Dois bancos, dois arquivos

Desenvolvimento **nunca** deve escrever no banco de produção — dados de teste
misturados com uso real tornam a medição inútil. Por isso a connection string
vive em dois arquivos, ambos gitignored:

| Arquivo | Aponta para | Quem usa |
| --- | --- | --- |
| `.env.local` | Postgres local (docker) | `next dev`, `db:migrate`, `db:studio` |
| `.env.production.local` | Neon, string **direct** | só `db:migrate:prod` |

O nome do script é a proteção: não existe jeito de tocar produção sem digitar
`prod`.

```bash
npm run db:up         # sobe/religa o Postgres local (volume nomeado, dados persistem)
npm run db:migrate    # aplica drizzle/*.sql no LOCAL
npm run db:generate   # gera migração nova depois de mexer no schema
npm run db:studio     # UI para inspecionar o banco local

npm run db:migrate:prod   # aplica na Neon — falha se .env.production.local não existir
```

`db:migrate:prod` usa `--env-file` (não `--if-exists`) de propósito: sem o
arquivo, ele quebra em vez de silenciosamente migrar o banco errado.

### Pooled vs direct

A Neon dá duas connection strings e usar a errada é um erro difícil de achar,
porque só aparece sob carga:

- **pooled** (host com `-pooler`) → é a que vai no `DATABASE_URL` da Vercel.
  Cada invocação serverless abre sua própria conexão e o endpoint direto esgota.
- **direct** → migrações, e nada mais.

Configure `DATABASE_URL` na Vercel **só em Production**. Sem ela nos previews, os
deploys de PR rodam no caminho degradado e não sujam os dados reais.

## Rate limiting

`/api/recommend` gasta uma chamada paga ao AI Gateway por request, então tem duas
janelas: por IP (padrão 10/hora) e global (padrão 500/dia). A global é a que
limita o prejuízo máximo. Responde `429` com `Retry-After`. Configurável por
`RATE_LIMIT_*` no `.env`.

## Rastreamento de cliques

Todo link de saída passa por `/api/go/[racketId]`, que grava o clique e devolve
`302` para a loja. O destino vem só do catálogo — nunca de query param — então
não é um open redirect. `/api/` está bloqueado no robots.txt, então crawler
nenhum segue esses links.

## Rodando

```bash
npm install
cp .env.example .env.local   # preencha AI_GATEWAY_API_KEY
npm run dev                  # http://localhost:3000
```

Sem `AI_GATEWAY_API_KEY`, a recomendação cai na ordem do prefilter: a UI funciona
normalmente e `quiz_runs.model` registra `prefilter-order`.

## Eval das escolhas

```bash
npm run eval:picks            # replays os últimos 20 quiz runs de produção
npm run eval:picks -- 40 5    # 40 runs, imprime as justificativas de 5
```

Lê `DATABASE_URL` de `.env.production.local` (só SELECT) e imprime, por run, o que
foi recomendado na época versus o que o código atual escolhe, com as
probabilidades por dimensão e as justificativas geradas. Sobreposição com as
escolhas antigas é sinal de sanidade, não nota: o que vale é ler os rankings com
o perfil ao lado e julgar se fazem sentido tenístico.

## Catálogo / Scraper

`data/rackets.json` é versionado no git. Para atualizá-lo a partir do Tennis Warehouse:

```bash
npm run scrape -- --limit 5   # teste: imprime sem escrever
npm run scrape                # run completo: substitui o arquivo atomicamente (mínimo 40 raquetes)
```

Playwright é devDependency — não entra no bundle da Vercel. Seletores/URLs do site ficam no const `SELECTORS` em `scripts/scrape.ts`.

## Deploy (Vercel)

1. Importe o repo na Vercel.
2. Configure `AI_GATEWAY_API_KEY` nas env vars do projeto.
3. `git push` — build automático.

## Stack

Next.js (App Router) + TypeScript · Tailwind + shadcn/ui (Base UI) · next-intl (`/[locale]/`, pt-BR default) · zod · Jev via Vercel AI Gateway (fetch, sem SDK) · Playwright (scraper offline)
