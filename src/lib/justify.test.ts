import assert from "node:assert/strict";
import { test } from "node:test";
import type { Answers } from "./answers";
import type { Racket } from "./catalog";
import { justifyPicks, quoteFor } from "./justify";

let seq = 0;
function racket(overrides: Partial<Racket> = {}): Racket {
  seq += 1;
  return {
    id: `test-racket-${seq}`,
    brand: `Brand${seq}`,
    model: `Model ${seq}`,
    headSizeIn2: 100,
    weightGrams: 300,
    balance: "4 pts HL",
    balancePoints: -4,
    stiffnessRA: 65,
    stringPattern: "16x19",
    swingweight: 320,
    priceUSD: 200,
    imageUrl: "https://example.com/r.png",
    productUrl: "https://example.com/r",
    ...overrides,
  };
}

const sentences = (s: string) => s.split(/(?<=[.!?])\s+(?=[A-ZÀ-Ú≈0-9"])/).length;

const dense98 = () =>
  racket({ headSizeIn2: 98, stringPattern: "18x20", stiffnessRA: 61, swingweight: 325, weightGrams: 323, balance: "4 pts HL", balancePoints: -4 });
const open100 = () =>
  racket({ headSizeIn2: 100, stringPattern: "16x19", stiffnessRA: 70, swingweight: 315, weightGrams: 300, balance: "6 pts HL", balancePoints: -6 });
const big107 = () =>
  racket({ headSizeIn2: 107, stringPattern: "16x18", stiffnessRA: 56, swingweight: 312, weightGrams: 295, balance: "", balancePoints: null });

test("flies-long leads with the dense pattern; the weight follows the card's convention", () => {
  // Control outweighs power, so the dense pattern leads and the self-power
  // sentence (which carries the weight) comes second.
  const answers: Answers = { skill: "competitive", swing: "self-power", struggles: ["flies-long"], armInjury: "none" };
  const [pt] = justifyPicks([{ racket: dense98() }], answers, "pt-BR");
  assert.match(pt, /^O padrão fechado 18x20 numa cabeça de 98 in² segura a bola/);
  assert.match(pt, /≈ 305 g sem corda e swingweight 325/);
  assert.doesNotMatch(pt, /strung|323/);
  const [en] = justifyPicks([{ racket: dense98() }], answers, "en");
  assert.match(en, /^The dense 18x20 pattern on a 98 in² head keeps the ball in/);
  assert.match(en, /323 g strung and a 325 swingweight/);
  assert.doesNotMatch(en, /305/);
});

test("a spec is only cited when the racquet actually has it", () => {
  const answers: Answers = { skill: "beginner", swing: "mixed", struggles: ["flies-long", "low-power"], armInjury: "none" };
  const [text] = justifyPicks([{ racket: open100() }], answers, "pt-BR");
  // open100 has nothing honest to say about flies-long (100 in², open, RA 70),
  // so low-power leads instead.
  assert.doesNotMatch(text, /fechado|sai longa|sair longa/);
  assert.match(text, /potência de graça/);
  assert.match(text, /RA 70/);
});

test("three picks never open with the same argument", () => {
  const answers: Answers = { skill: "intermediate", swing: "mixed", style: "baseline", struggles: ["flies-long"], armInjury: "past" };
  const picks = [dense98(), racket({ headSizeIn2: 98, stringPattern: "18x20", stiffnessRA: 63, swingweight: 322, weightGrams: 320 }), racket({ headSizeIn2: 98, stringPattern: "16x20", stiffnessRA: 64, swingweight: 321, weightGrams: 318 })];
  const texts = justifyPicks(picks.map((r) => ({ racket: r })), answers, "pt-BR");
  const leads = texts.map((t) => t.split(/(?<=[.!?])\s/)[0].split(" ").slice(0, 3).join(" "));
  assert.equal(new Set(leads).size, 3, JSON.stringify(leads));
});

test("the first pick closes as the best match; later picks close by how they differ from it", () => {
  const answers: Answers = { skill: "advanced", swing: "self-power", style: "all-court", struggles: ["nothing"], armInjury: "none" };
  const [first, second, third] = justifyPicks(
    [{ racket: dense98() }, { racket: open100() }, { racket: racket({ headSizeIn2: 98, stringPattern: "18x20", stiffnessRA: 61, weightGrams: 323, swingweight: 325 }) }],
    answers,
    "pt-BR",
  );
  assert.match(first, /combinação mais completa da lista\.$/);
  assert.match(second, /Em relação à primeira opção, é mais leve e de cabeça maior\.$/);
  // Same specs as the first: nothing honest to say about the difference, so no closing.
  assert.doesNotMatch(third, /primeira opção/);
});

test("a firm frame for an injured arm gets the stringing caveat instead of a closing", () => {
  const answers: Answers = { skill: "intermediate", swing: "mixed", style: "baseline", struggles: ["low-power"], armInjury: "past" };
  const [pt] = justifyPicks([{ racket: open100() }], answers, "pt-BR");
  assert.match(pt, /RA 70 é firme para o seu histórico de braço/);
  assert.doesNotMatch(pt, /combinação mais completa/);
  const [en] = justifyPicks([{ racket: open100() }], answers, "en");
  assert.match(en, /RA 70 is on the firm side/);
});

test("the player's words are quoted only on the pick Jev rated for them, trimmed to one line", () => {
  const long = "Quero trocar no fundo com mais consistência e ser agressivo para ganhar os pontos principalmente na rede, sem perder o braço";
  const answers: Answers = { skill: "advanced", swing: "self-power", style: "serve-volley", struggles: ["nothing"], armInjury: "none", improveGoals: long };
  const quote = quoteFor(answers);
  assert.ok(quote && quote.length <= 81 && quote.endsWith("…"), quote ?? "");

  const texts = justifyPicks(
    [
      { racket: dense98(), dims: { goals: 0.4 } },
      { racket: open100(), dims: { goals: 0.72 } },
      { racket: big107(), dims: { goals: 0.71 } },
    ],
    answers,
    "pt-BR",
  );
  assert.doesNotMatch(texts[0], /você escreveu/);
  assert.match(texts[1], /o que você escreveu: "Quero trocar no fundo/);
  assert.doesNotMatch(texts[2], /você escreveu/);

  // Without Jev figures nobody gets to claim the player's words.
  const fallback = justifyPicks([{ racket: dense98() }, { racket: open100() }], answers, "pt-BR");
  assert.ok(fallback.every((t) => !/você escreveu/.test(t)));
});

test("a racquet with empty balance and no arm reason still gets a full justification", () => {
  const answers: Answers = { skill: "beginner", swing: "racquet-power", style: "serve-volley", struggles: ["off-center"], armInjury: "current" };
  const [text] = justifyPicks([{ racket: big107() }], answers, "pt-BR");
  assert.match(text, /^Os 107 in² de cabeça ampliam o ponto doce/);
  assert.match(text, /RA 56/);
  assert.doesNotMatch(text, /Balanço/);
});

test("every locale, profile and frame combination reads clean", () => {
  const profiles: Answers[] = [
    {},
    { skill: "beginner", swing: "racquet-power", style: "not-sure", struggles: ["low-spin", "off-center", "flies-long"], armInjury: "current", powerControl: 5 },
    { skill: "competitive", swing: "self-power", style: "counterpuncher", struggles: ["unstable", "arm-fatigue"], armInjury: "occasional", strengths: "Consistência e paciência nas trocas longas" },
    { skill: "intermediate", style: "all-court", struggles: ["nothing"], armInjury: "none", racquetFeel: "Gosto da potência, mas ela tremula" },
  ];
  const frames = [dense98(), open100(), big107(), racket({ swingweight: null, stiffnessRA: null, balance: "", balancePoints: null })];
  for (const locale of ["pt-BR", "en"] as const) {
    for (const answers of profiles) {
      const texts = justifyPicks(frames.map((r) => ({ racket: r, dims: { power: 0.7, goals: 0.8 } })), answers, locale);
      for (const t of texts) {
        assert.doesNotMatch(t, /undefined|null|NaN|\[object/, t);
        assert.doesNotMatch(t, /\s{2,}|\s[.,:]/, t);
        assert.ok(t.endsWith(".") || t.endsWith('".'), t);
        const n = sentences(t);
        assert.ok(n >= 1 && n <= 3, `${n} sentences: ${t}`);
        assert.ok(t.length <= 420, `${t.length} chars: ${t}`);
      }
    }
  }
});
