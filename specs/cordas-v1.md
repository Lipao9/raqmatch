# Spec: Cordas recomendadas v1

Data: 2026-09-03 · Status: implementada

Cordas recomendadas por raquete, com faixa de tensão sugerida e link de
afiliado do Mercado Livre. Duas superfícies: a página estática da raquete
(`/racquets/[slug]`, SEO — "melhor corda para X" é query real) e o card de
resultado do quiz (personalizado pelo perfil do jogador).

---

## Decisões

1. **Híbrido com catálogo curado, sem LLM.** ~15 cordas escolhidas à mão
   (`data/strings.json`), cobrindo os perfis que o quiz distingue: multi de
   conforto (braço sensível, iniciante), poli macio (transição), poli de spin,
   poli de controle/durabilidade (competitivo), custo-benefício e tripa natural
   premium. O motor (`src/lib/string-advice.ts`) é uma tabela de pontuação
   determinística no espírito de `traits.ts`: pura, testável, roda em página
   estática. O LLM nunca vê cordas — 15 produtos não justificam custo nem
   não-determinismo de um modelo.

2. **Tensão em faixa, nunca número fixo.** Formato `48–54 lbs` / `22–24 kg`
   (pt-BR mostra kg primeiro — convenção dos encordoadores brasileiros; `/en`
   mostra lbs primeiro). Base pelo tamanho da cabeça (cabeça maior → mais
   tensa), poli ~4 lbs abaixo de multi/tripa, braço sensível −2, controle +2 /
   potência −2 pela escala do quiz. Número fixo seria falsa precisão: máquina,
   clima e sensação do jogador mandam no ajuste final — a faixa é a parte
   honesta.

3. **Curadoria a partir da disponibilidade real.** O catálogo foi montado
   consultando a API de catálogo do ML (domínio `MLB-RACKET_STRINGS`, mesma
   infra de `scripts/lib/ml.ts`): só entrou corda com anúncio ativo em **set
   individual** (12m — o que o consumidor compra; rolo de 200m é produto de
   encordoador). Descartadas por falta de oferta: Wilson Revolve, Head Velocity
   MLT, Volkl Cyclone, Tecnifibre X-One, Prince/Babolat Synthetic Gut.

4. **Links mintados manualmente, dois arquivos.** Mesmo padrão das raquetes:
   `data/strings.json` (produto, rot lento) separado de
   `data/string-offers.json` (listagem + preço + `affiliateUrl` opaco
   `meli.la/...`, rot semanal). Degradação em uma direção só:
   afiliado mintado → listagem decorada → busca decorada → busca crua.

5. **Clique registrado com `product_kind`.** Rota irmã
   `/api/go/string/[stringId]` (segmento literal, não param de query — o
   invariante da rota de raquete fica intacto). Coluna aditiva
   `outbound_clicks.product_kind` (`'string'`; null = raquete, linhas antigas
   genuinamente não sabiam). `racket_id` guarda o id da corda nessas linhas —
   rename para `product_id` custaria uma migration por ganho zero.

6. **Perfil do jogador entra quando existe.** No quiz, `/api/recommend` deriva
   `StringProfile` das respostas (armInjury/struggles → conforto; skill →
   categoria; spinStyle → spin; powerControl → tensão) e anexa **um** pick por
   raquete ao payload (o card já é denso; a lista completa vive na página da
   raquete). Na página estática não há perfil: o frame representa seu comprador
   típico. Lesão ativa **exclui** poli rígido em vez de só pontuar contra —
   mesma postura do prefilter com `armInjury === "current"`.

7. **Botão de compra só em pt-BR.** Oferta de corda só existe no ML; para o
   leitor `/en` a página mostra o conselho (pick + tensão, que é o valor SEO)
   sem botão — link de marketplace brasileiro é peso morto para quem ele não
   entrega.

## Fora do escopo (v1)

- Pergunta nova no quiz sobre corda atual/tensão atual.
- Híbridos (poli × multi) como recomendação composta.
- Re-check automático de preço/estoque das ofertas de corda (o de raquetes é
  semanal via workflow; cordas ficam manuais até provarem clique).
- Prospin como loja (paga em crédito, não dinheiro — parceiro de conversão,
  não fonte de receita).

## Métricas de sucesso

- `outbound_clicks` com `product_kind = 'string'` > 0 (alguém clica?).
- Conversão no painel de afiliados do ML atribuída às etiquetas de corda.
- Impressões/cliques de busca nas páginas de raquete para queries com "corda".
