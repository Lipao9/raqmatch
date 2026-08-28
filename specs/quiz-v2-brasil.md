# Spec: Quiz v2 + disponibilidade Brasil

Data: 2026-08-28 · Status: proposta para revisão

Duas mudanças em uma spec, porque se tocam no mesmo pipeline
(`questions.ts → answers.ts → prefilter.ts → prompt.ts → recommend`):

- **Parte A — Quiz v2**: novos formatos de pergunta (múltipla seleção e escala de
  intensidade), conjunto de perguntas redesenhado com base em pesquisa profunda
  (concorrentes, UX de quizzes de recomendação e fitting de raquetes), e o
  scoring do prefilter atualizado para os novos formatos.
- **Parte B — Disponibilidade Brasil**: visitante `pt-BR` só recebe recomendações
  de raquetes que realmente se compram no Brasil (oferta mapeada no Mercado
  Livre em `data/offers.json`).

---

## 0. Resumo da pesquisa (o que muda de opinião)

Três pesquisas alimentaram esta spec (concorrentes, UX de guided selling, e um
dossiê de fitting de raquetes). Fontes completas no Apêndice. Os achados que
mudam decisões:

1. **Escala de intensidade: 5 pontos tocáveis, não slider 1–10.** A literatura é
   inequívoca: sliders arrastáveis derrubam taxa de resposta no mobile e pioram a
   distribuição dos dados (Funke 2018; NN/g; MeasuringU); acima de 7 pontos a
   confiabilidade cai (Preston & Colman). O pedido original era "intensidade de
   1 a 10" — a intenção (resposta graduada, não binária) é atendida por uma
   **escala de 5 segmentos com âncoras verbais nas pontas**, que captura o mesmo
   sinal com melhor UX e scoring mais estável. Ponto médio (3) = neutro, sem
   pré-seleção.
2. **Multi-select precisa de semântica declarada.** Cada pergunta multi declara
   `any` (união — preferências) ou `all` (interseção — requisitos), e a
   contribuição no score é **normalizada** (peso × acertos/selecionados) para
   quem marca 4 caixas não pesar 4× mais que quem marca 1 (padrão
   Octane/Cartful).
3. **Perguntar "prefere raquete leve?" é uma armadilha.** Usuário se
   auto-seleciona para leve; leve + rígida + head-heavy é a receita clássica de
   tennis elbow (racquetresearch.info, Hennig 2007). O peso certo se **infere**
   de nível + swing + força, não se pergunta como preferência.
4. **A pergunta de maior sinal depois do nível é o swing** (comprimento/
   velocidade), e a melhor forma de perguntar é comportamental: "de onde vem a
   potência da sua bola — de você ou da raquete?" (padrão Tennis Express,
   Racqix, ProSpin). Swingweight prediz mais que peso estático.
5. **"O que te incomoda hoje" vale mais que "o que você quer".** Perguntas de
   problema ("bola sai fraca / sai longa / erro fora do centro / braço cansa")
   mapeiam direto para deltas de spec e são o diferencial dos melhores quizzes
   (Head "common errors", Racqix, ProSpin "o que falta no seu jogo"). É a
   multi-select natural do quiz.
6. **Lesão de braço deve ser graduada, não binária** (Racqix usa 4 níveis;
   Tennis-Point pergunta local + severidade). Sintoma ativo → filtro duro
   RA ≤ 63–64 e piso de peso; histórico → penalidade branda.
7. **Piso de quadra quase não importa** para a escolha do quadro — os pros jogam
   o mesmo quadro o ano todo e só mudam tensão de corda. Vira tiebreaker mínimo
   (saibro → leve empurrão para padrão aberto), nunca dimensão principal.
8. **Comprimento do quiz**: quick ideal em 5–8 perguntas (dados Interact/80M
   quizzes: queda de completude após a Q3–Q6); o detalhado se sustenta mais
   longo porque é auto-selecionado, mas ganha com **gating condicional**
   (iniciante nunca vê pergunta de spec — padrão Tennis-Point e ProSpin).
9. **"Não sei / tanto faz" em toda pergunta de preferência**, com semântica de
   score zero (nunca voto fraco nos dois lados).
10. **Formato dominante nos concorrentes**: cards de escolha única com descrição
    de uma linha; ninguém usa slider fora de ferramentas de filtro para experts
    (TWU). Auto-advance no toque em escolha única; botão "Continuar" explícito
    em multi e escala.

Conflito registrado: a pesquisa recomenda perguntar orçamento (essencial para
comparadores afiliados), mas o `PRODUCT.md` trava **"nunca pergunta orçamento e
o modelo nunca vê preço"** — decisão de produto deliberada (recomendação
incorruptível). Esta spec respeita a trava e não adiciona pergunta de orçamento.

---

## Parte A — Quiz v2

### A1. Novos formatos de pergunta

`src/lib/questions.ts` ganha dois `kind` novos. O tipo `Answers` muda de
`Partial<Record<QuestionId, string>>` para:

```ts
export type AnswerValue = string | string[] | number;
export type Answers = Partial<Record<QuestionId, AnswerValue>>;
```

```ts
export interface Question {
  id: QuestionId;
  kind: "choice" | "multi" | "scale" | "text" | "longtext";
  options: string[];            // choice/multi: valores estáveis; vazio nos demais
  optional?: boolean;
  modes: QuizMode[];
  // multi
  multiMode?: "any" | "all";    // semântica de scoring (default "any")
  maxSelections?: number;       // opcional; ex.: 3 em struggles
  exclusiveOption?: string;     // ex.: "nada" — desmarca as demais ao ser marcada
  // scale
  scalePoints?: 5;              // fixo em 5; existe para validação explícita
  // gating condicional
  showIf?: (answers: Answers) => boolean;
}
```

- **`multi`**: renderiza checkboxes-card (mesmo visual dos cards atuais, com
  checkbox em vez de radio). `exclusiveOption` cobre opções tipo "nada disso":
  marcar limpa as demais e vice-versa.
- **`scale`**: 5 segmentos tocáveis lado a lado (alvo de toque ≥ 44px), âncora
  verbal em cada ponta (i18n: `questions.<id>.anchors.low` / `.high`), **sem
  valor pré-selecionado**. Valor armazenado: `1..5`. `3` = neutro no scoring.
  Não é um slider arrastável — é um grupo de botões (radiogroup na semântica
  de acessibilidade).
- **`showIf`**: avaliado no cliente pelo `QuizWizard` para pular perguntas, e o
  progresso é calculado sobre o caminho máximo restante para a barra nunca
  regredir. No servidor, pergunta oculta não respondida é simplesmente ausente
  (todas as `showIf` são `optional` ou validadas condicionalmente — ver A4).

### A2. Novo conjunto de perguntas

Racional por pergunta na tabela; labels finais ficam em `messages/*.json`
(pt-BR primeiro, en espelhado). Convenção mantida:
`quiz.questions.<id>.title|description|options.<valor>`.

#### Quick — 7 perguntas (~2 min; hoje são 12)

| # | id | kind | Opções (valores) | O que resolve |
|---|----|------|------------------|---------------|
| 1 | `skill` | choice | `beginner` / `intermediate` / `advanced` / `competitive` (mantidas, com descrições de uma linha já existentes) | Prior mestre de peso/head/SW |
| 2 | `swing` | choice | `racquet-power` ("Preciso que a raquete gere potência — swing curto") / `mixed` ("Um pouco de cada") / `self-power` ("Eu gero minha própria potência — swing longo e rápido") | Eixo potência: head size, RA, peso, SW. Substitui `swingSpeed` (detailed-only) com framing comportamental |
| 3 | `style` | choice | `baseline` / `serve-volley` / `all-court` / `counterpuncher` / **`not-sure`** (novo escape) | Categoria dentro do nível |
| 4 | `powerControl` | **scale** | 1 = "Controle total" ↔ 5 = "Potência total" | Função-objetivo principal; era choice de 3, vira graduada |
| 5 | `struggles` | **multi** (`any`, max 3, exclusiva: `nothing`) | `low-power` ("Minha bola sai fraca/curta") / `flies-long` ("Minha bola sai longa, falta controle") / `off-center` ("Erro fora do centro da raquete") / `low-spin` ("Falta efeito/spin") / `arm-fatigue` ("Braço cansa ou dói no fim do jogo") / `unstable` ("A raquete 'tremula' contra bola pesada") / `nothing` ("Nada, meu jogo está equilibrado") | A pergunta de problema — mapeia direto para deltas de spec; nova |
| 6 | `armInjury` | choice | `none` / `occasional` ("Dói às vezes depois de jogar") / `past` ("Já tive, recuperado") / `current` ("Dor atual") | Segurança; graduada (era 3 níveis, vira 4) |
| 7 | `currentRacquet` | text, optional | — | Âncora de calibração para o LLM |

Saem do quick (justificativa): `frequency` (proxy de fadiga, sinal médio → só
detailed), `weightPref` (**removida do produto** — achado nº 3), `headSizePref`
e `stringPattern` (jargão — vão para o detailed atrás de gate de conhecimento),
`gripSize` (não influencia prefilter nem escolha de quadro; só detailed,
opcional), `courtType` (sinal quase nulo — achado nº 7; vira multi no detailed).

#### Detailed — 15 perguntas fixas + até 3 condicionais (~6 min; hoje são 18)

Ordem pensada: identidade → jogo → problemas → segurança → specs (gated) →
texto livre por último (padrão de menor abandono).

| # | id | kind | Opções / âncoras | Notas |
|---|----|------|------------------|-------|
| 1 | `skill` | choice | = quick | |
| 2 | `frequency` | choice | `occasional` / `weekly` / `several-times` / `daily` (mantidas) | Teto de fadiga p/ peso e SW |
| 3 | `swing` | choice | = quick | |
| 4 | `style` | choice | = quick | |
| 5 | `spinStyle` | choice | `heavy-topspin` / `moderate-spin` / `flat` / `slice` / **`not-sure`** | Padrão de cordas |
| 6 | `powerControl` | scale | = quick | |
| 7 | `aggression` | **scale** | 1 = "Consistência, jogo seguro" ↔ 5 = "Ataco tudo, bola vencedora" | SW/peso/padrão; nova (padrão Racqix) |
| 8 | `fitness` | **scale** | 1 = "Força/preparo abaixo da média" ↔ 5 = "Muito forte, aguento raquete pesada" | Teto de peso independente de nível; substitui o longtext `physicalProfile` |
| 9 | `struggles` | multi | = quick | |
| 10 | `armInjury` | choice | = quick | |
| 11 | `courtType` | **multi** (`any`, exclusiva: nenhuma) | `clay` / `hard` / `grass` / `indoor` | Rebaixada a tiebreaker; multi porque a realidade é plural |
| 12 | `specKnowledge` | choice | `yes` ("Entendo de specs — quero opinar em peso/cabeça/padrão") / `no` ("Prefiro que vocês decidam pelas minhas respostas") | Gate (padrão ProSpin/Wilson) |
| 13 | `headSizePref` | choice, `showIf: specKnowledge === "yes"` | `midsize` / `midplus` / `oversize` / `no-preference` | Só para quem entende |
| 14 | `stringPattern` | choice, `showIf: specKnowledge === "yes"` | `open` / `dense` / `no-preference` | Idem |
| 15 | `weightSpec` | choice, `showIf: specKnowledge === "yes"` | `under-285` / `285-300` / `300-315` / `over-315` / `no-preference` (gramas **sem corda**, convenção BR) | Preferência de peso volta SÓ como pergunta de spec para quem declarou conhecimento — aí não é armadilha, é informação |
| 16 | `gripSize` | choice, optional | `1`–`5` / `unknown` (mantida) | |
| 17 | `currentRacquet` | text, optional | — | |
| 18 | `racquetFeel` | longtext, `showIf: currentRacquet respondida`, optional | — | Só faz sentido com raquete atual |
| 19 | `strengths` | longtext | — | Mantida — diferencial do produto (LLM lê as palavras do jogador) |
| 20 | `improveGoals` | longtext | — | Mantida |
| 21 | `anythingElse` | longtext, optional | placeholder ganha dica: "altura, idade, mão dominante, backhand de uma ou duas mãos…" | Absorve o que `physicalProfile` pedia |

Removidas do produto: `weightPref` (choice aberta a todos), `physicalProfile`
(longtext → escala `fitness` + dica no `anythingElse`), `swingSpeed`
(substituída por `swing` comportamental).

`QuestionId` novo completo: `skill, frequency, swing, style, spinStyle,
powerControl, aggression, fitness, struggles, armInjury, courtType,
specKnowledge, headSizePref, stringPattern, weightSpec, gripSize,
currentRacquet, racquetFeel, strengths, improveGoals, anythingElse`.

### A3. UI (`QuestionCard` / `QuizWizard`)

- `QuestionCard` ganha os ramos `multi` (cards com checkbox, contador
  "até N" quando `maxSelections`) e `scale` (5 segmentos + âncoras). Estilo
  segue os cards atuais (border/hover/selected já definidos).
- **Auto-advance** em `choice`: ao tocar uma opção, avança após ~250 ms (com a
  animação de saída já existente). `multi`, `scale`, `text` e `longtext` mantêm
  o botão "Continuar" — não há sinal natural de "terminei".
- Perguntas com `showIf` falso são puladas; a barra de progresso usa
  `perguntas visíveis restantes` para nunca andar para trás.
- Toda pergunta de preferência tem escape neutro (`not-sure`,
  `no-preference`, opção exclusiva `nothing`); `optional` continua permitindo
  pular texto livre.
- Textos de modo em `quiz.modes.*` atualizados: quick "7 perguntas, ~2 min";
  detailed "~16 perguntas, ~6 min".

### A4. Validação, encoding e persistência

- **Zod (`answers.ts`)**: `choice` = enum (como hoje); `multi` =
  `z.array(enum).min(1).max(maxSelections ?? options.length)`; `scale` =
  `z.number().int().min(1).max(5)`; textos inalterados. Perguntas com `showIf`
  são sempre `optional` no schema do servidor (a obrigatoriedade condicional é
  responsabilidade do wizard; o servidor só não pode rejeitar um payload em que
  a condição escondeu a pergunta).
- **URL (`encodeAnswers`/`decodeAnswers`)**: multi vira um único param com
  valores separados por vírgula (`struggles=low-power,arm-fatigue`) — os
  valores são slugs sem vírgula, e um teste garante isso. Scale vira o número
  como string (`powerControl=4`). O decode converte por `kind`. Resultados
  continuam compartilháveis por URL.
- **Banco**: `quiz_runs.answers` é `jsonb` — arrays e números entram sem
  migração. Só o tipo TS `Answers` muda.
- **Compatibilidade**: URLs antigas de resultado (`weightPref=light` etc.)
  deixam de validar → `decodeAnswers` retorna `null` → redirect para `/quiz`
  (comportamento já existente). Aceitável: resultados são `noindex` e
  per-visitor; não vale manter dois formatos.

### A5. Scoring no prefilter

Princípio mantido: **filtros duros → score brando → cap de marca** (o mesmo
pipeline de guided selling da indústria). Mudanças:

**Filtros duros (`HARD_FILTERS`):**

| Filtro | Regra nova | Relaxável |
|--------|-----------|-----------|
| `armInjury` | `current` → `stiffnessRA ≤ 64` **e** `weightGrams ≥ 295` (com corda; leve demais transmite choque) | não (mantido) |
| `beginnerHeadSize` | mantido: `beginner` → `headSizeIn2 ≥ 100` | sim |
| `skillSwingWeight` | banda de peso por **nível ajustada pelo swing**: parte das `SKILL_BANDS` atuais e desloca −10 g (min e max) se `swing = racquet-power`, +5 g se `self-power` | sim |
| `weightSpec` | só quando respondida (gate de specs): banda correspondente convertida para strung (+16 g) | sim |
| `fitnessCap` | `fitness ≤ 2` → `weightGrams ≤ 305` | sim |

**Score brando — regras novas/alteradas:**

- **Scale (`powerControl`, `aggression`)**: magnitude = `|valor − 3|`
  (0 = neutro, 1 = brando, 2 = forte). Direção mantém a lógica atual de
  power/control, multiplicada pela magnitude. Ex.: `powerControl = 5` →
  `headSize ≥ 102` +2·2, padrão aberto +1·2, `RA ≥ 67` +1·2; `powerControl = 4`
  → metade. `aggression ≥ 4` → `swingweight ≥ 320` +1·mag, `weight ≥ 300`
  +1·mag; `aggression ≤ 2` → `weight ≤ 305` +1·mag, `swingweight ≤ 315` +1·mag.
- **Multi (`struggles`)**: cada seleção tem sua tabela de pontos e o total da
  pergunta é multiplicado por `1 / nº de seleções` (normalização):
  - `low-power` → `headSize ≥ 100` +2, `RA ≥ 67` +1, padrão aberto +1
  - `flies-long` → padrão denso +2, `headSize ≤ 100` +1, `RA ≤ 65` +1
  - `off-center` → `headSize ≥ 102` +2 (tolerância/twistweight por proxy)
  - `low-spin` → padrão aberto +2
  - `arm-fatigue` → `weight ≤ 295` +1, `swingweight ≤ 315` +1, `RA ≤ 65` +1
  - `unstable` → `weight ≥ 300` +1, `swingweight ≥ 320` +1
  - `nothing` → contribuição zero
- **`courtType` multi**: contém `clay` → padrão aberto +0.5. Só isso — achado nº 7.
- **`armInjury` graduada**: `past`/`occasional` → `RA ≤ 66` +2 (hoje só `past`).
- **`swing`**: `racquet-power` → `weight ≤ 295` +2, `headSize ≥ 102` +1;
  `self-power` → `weight ≥ 300` +1, `headSize ≤ 100` +1 (substitui os pontos de
  `swingSpeed`).
- Removidos: pontos de `weightPref` (pergunta extinta — a banda `weightSpec`
  gated entra como filtro duro relaxável e ganha os +3 de "banda respeitada"
  que `weightPref` tinha).
- Mantidos: `headSizePref`, `stringPattern`, `style`, `spinStyle` como hoje.

**Constantes**: `MAX_CANDIDATES = 25`, `MIN_BEFORE_RELAX = 10`,
`MAX_PER_BRAND = 2` inalterados.

### A6. Prompt do LLM (`prompt.ts`)

- `buildUserMessage` formata os novos tipos: array → labels separados por
  vírgula; scale → `"4/5 (leaning power)"` com os extremos nomeados por
  pergunta (tabela `SCALE_ANCHORS` no próprio arquivo). O modelo continua sem
  ver preço.
- `ANSWER_LABELS` atualizado para os ids novos (`swing`, `struggles`,
  `aggression`, `fitness`, `specKnowledge`, `weightSpec`, `courtType` plural).
- System prompt ganha uma frase: *"Answers on 1–5 scales use 3 as neutral;
  treat distance from 3 as intensity. `struggles` lists the player's stated
  problems — address them explicitly in the justifications."*

### A7. i18n

- `messages/pt-BR.json` e `messages/en.json`: chaves novas para as perguntas
  novas (`swing`, `struggles`, `aggression`, `fitness`, `specKnowledge`,
  `weightSpec`), âncoras de escala (`anchors.low/high`), hint de multi
  ("Selecione até {max}"), e remoção das chaves de `weightPref`,
  `physicalProfile`, `swingSpeed`. pt-BR é a cópia de referência; en espelha.
- Microcopy educativa de uma linha nas descrições (padrão ProSpin/Wilson), ex.
  em `armInjury`: "Raquete leve e rígida demais é a receita clássica de dor no
  cotovelo — leva a sério esta pergunta."

---

## Parte B — Disponibilidade Brasil

### B1. Regra

Visitante com `locale === "pt-BR"` só pode receber recomendações de raquetes
com **oferta mapeada no Mercado Livre** em `data/offers.json`, com
`matchKind !== "variant_spec"` (uma Team/Lite/Tour irmã nunca representa o
quadro recomendado — regra já documentada em `offers.ts`). `/en` continua com o
catálogo completo (Tennis Warehouse atende esse leitor).

Oferta *de busca* não conta — o critério é oferta mapeada (`getOffer` retorna
linha), o mesmo bar que `primaryStore` já usa para eleger o Mercado Livre.

### B2. Implementação

Filtrar o catálogo **antes** do prefilter, na rota — não dentro dos
`HARD_FILTERS` — porque disponibilidade é propriedade do mercado, não do
jogador, e não pode ser relaxada pelo loop de relaxamento:

```ts
// src/lib/offers.ts
export function availableRacketIds(store: StoreKey): Set<string>; // exclui variant_spec

// src/app/api/recommend/route.ts
const pool =
  body.locale === "pt-BR"
    ? loadCatalog().filter((r) => brIds.has(r.id))
    : loadCatalog();
const candidates = prefilter(body.answers, pool);
```

- `availableRacketIds` itera o índice de ofertas já parseado (cache module-level
  como o existente).
- `recordQuizRun` ganha o campo `poolSize` (tamanho do catálogo pós-filtro de
  disponibilidade, antes do prefilter) para medir o efeito do filtro nos dados.
- Erro `no_candidates` (422) e a tela correspondente já existem e cobrem o
  caso-limite.

### B3. Viabilidade com a cobertura atual (medida em 2026-08-28)

- Catálogo: 272 raquetes; **69 com oferta ML** (0 `variant_spec`, então o pool
  pt-BR é 69). Por marca: Head 26/57, Wilson 18/55, Babolat 14/35, Yonex 7/25,
  Tecnifibre 3/22, Prince 1/29, **Dunlop 0/22, Volkl 0/27**.
- Piores combinações contra os filtros duros: iniciante (head ≥ 100 e
  peso ≤ 300) → 14 raquetes; `fitness` baixo/leve → 8–15; lesão ativa
  (RA ≤ 64) → ~40. Tudo acima do mínimo de 3; o loop de relaxamento
  (`MIN_BEFORE_RELAX = 10`) vai disparar com mais frequência no pt-BR, o que é
  o comportamento desejado.
- **Viés conhecido do pool ML: pesado.** 49/69 têm ≥ 305 g com corda e só 8 são
  ≤ 290 g. Iniciantes e jogadores de menor força — justamente o público
  majoritário — têm o menor cardápio. Mitigação fora desta spec, mas registrada:
  a próxima leva de curadoria de ofertas ML deve priorizar quadros leves e
  arm-friendly (Team/Lite/L das linhas já mapeadas, Clash, Ezone 100L…).
- `MAX_PER_BRAND = 2` sobre 6 marcas com oferta → teto prático de ~12
  candidatos para o LLM no pt-BR (vs 25 no /en). Aceitável; melhora sozinho
  conforme a cobertura cresce.

### B4. Fora do escopo (registrado como follow-up)

- Filtrar/rotular o índice `/racquets` e páginas de raquete para pt-BR
  (SEO é a porta de entrada; esconder 203 páginas seria um tiro no pé — o
  follow-up certo é um selo "disponível no Brasil" e/ou ordenação, não filtro).
- `findRelated` (raquetes relacionadas) considerar disponibilidade no pt-BR.

---

## Plano de implementação

Dois PRs independentes (fluxo do projeto: PR para tudo):

**PR 1 — Disponibilidade Brasil** (pequeno, sem dependência da Parte A):
`availableRacketIds` + filtro na rota + `poolSize` no analytics + testes
(pool pt-BR = 69, `variant_spec` excluída, /en intacto, iniciante+lesão ainda
≥ 3 candidatos).

**PR 2 — Quiz v2** (grande; se ficar pesado, dividir em 2a motor / 2b conteúdo):
1. Motor: tipos `multi`/`scale`/`showIf` em `questions.ts`, `answers.ts`
   (Zod + encode/decode), `QuestionCard` + `QuizWizard` (auto-advance,
   progresso condicional).
2. Conteúdo: novo conjunto de perguntas + i18n pt-BR/en.
3. Scoring: `prefilter.ts` (filtros e score da seção A5) + `prompt.ts`.
4. Testes: roundtrip encode/decode (incl. multi com N valores e scale),
   validação Zod por kind, `showIf` (racquetFeel some sem currentRacquet;
   specs somem com `specKnowledge = no`), prefilter (normalização multi,
   magnitude scale, novos filtros duros, pool pt-BR × quick respondido só com
   neutros ainda produz ≥ 3).

Verificação manual antes do merge do PR 2: quiz completo nos dois modos e nos
dois locales via `npm run dev` (lembrete: saída do dev server via `rtk proxy`).

## Métricas de sucesso

Já coletamos `quiz_runs` com respostas, candidatos, custo e picks. Adicionar
`poolSize` (PR 1). Depois do PR 2, olhar: taxa de conclusão por modo (runs
gravados ÷ inícios — inícios hoje não são gravados; se quisermos funil por
pergunta, é follow-up de analytics client-side), distribuição das escalas
(se 3 dominar, a pergunta não discrimina e sai), frequência de `no_candidates`
no pt-BR, e % de picks pt-BR com link afiliado (deve ir a ~100% por construção).

## Apêndice — fontes principais

- UX de escalas/sliders: Funke 2018 (ResearchGate); NN/g "Slider Design: Rules
  of Thumb"; MeasuringU (sliders vs botões); Preston & Colman 2000 (nº ótimo de
  categorias).
- Guided selling / scoring: Cartful (union vs intersection, hard filter + soft
  score); Octane AI Quiz/Points Logic; Pu & Chen (elicitação com pesos).
- Comprimento/completude: dados Interact (80M quizzes) via Kinetic; Jebbit
  (85% / 2 min); Typeform/Formstack (uma pergunta por tela).
- Concorrentes (fluxos extraídos dos bundles JS): Tennis Express Racquet Quiz;
  Tennis-Point Racket Advisor; Wilson Racket Finder; Racqix (14 perguntas);
  ProSpin "Qual Raquete Comprar?" (fork por conhecimento, perguntas
  comportamentais em pt-BR); Head Racquet Finder (top-3 com match %); TWU
  Recommender (âncora na raquete atual).
- Fitting: Tennis Warehouse University (specs × potência; peso/balance/SW);
  tennisnerd.net (guias de RA, SW, balance, head size); TennisCompanion;
  racquetresearch.info (critérios de cotovelo: pesada+HL melhor,
  leve+HH pior); Hennig 2007 (vibração 80–200 Hz e epicondilite); Mohandhas
  2016 (tensão de corda × aceleração no cotovelo).
