import type { Answers } from "./answers";
import type { Racket } from "./catalog";
import { dimensionWeights, freeText, type Dimension, type Locale } from "./jev";
import { isDensePattern, isOpenPattern } from "./traits";
import { weightFor } from "./weight";

/**
 * Deterministic justifications: two or three sentences per pick, built from
 * the racquet's specs, the rules the prefilter already applies, and the
 * player's own answers.
 *
 * Same design bet as traits.ts and string-advice.ts: pure and testable, no
 * model call. Jev ranks but cannot write, and the text models cheap enough to
 * pair with it wrote poor Portuguese slowly — so the explanation is composed,
 * not generated. What that buys is a justification that can never contradict
 * the badges next to it: the weight is `weightFor`'s figure in the card's own
 * convention, a head-light frame is never called head-heavy, and a spec is
 * only ever cited when the racquet actually has it.
 *
 * Each pick gets a *lead* sentence (its strongest applicable reason, chosen so
 * that the three picks do not all open with the same argument), a second
 * reason from a different dimension when there is one, and a closing line:
 * a caveat when one is due, otherwise how the pick differs from the first.
 */

export interface PickToJustify {
  racket: Racket;
  /** Jev's per-dimension probabilities; absent on the prefilter fallback. */
  dims?: Partial<Record<Dimension, number>>;
}

interface Ctx {
  r: Racket;
  /** Weight phrase in the locale's convention, e.g. "≈ 300 g sem corda". */
  w: string;
  head: number;
  ra: number | null;
  sw: number | null;
  pattern: string;
  balance: string;
  open: boolean;
  dense: boolean;
}

interface Reason {
  /** Dedupe key across picks, so the same argument does not lead twice. */
  key: string;
  dim: Dimension;
  weight: number;
  text: string;
}

type ArmPhrase = "current" | "past" | "occasional" | "fatigue";
type PowerMode = "help" | "self" | "mixed";
type Diff =
  | "lighter"
  | "heavier"
  | "biggerHead"
  | "smallerHead"
  | "moreOpen"
  | "denser"
  | "softer"
  | "stiffer";

interface Copy {
  weight: (grams: number, exact: boolean) => string;
  list: (items: string[]) => string;
  control: Record<string, (c: Ctx) => string | null>;
  arm: (c: Ctx, phrase: ArmPhrase) => string | null;
  armCaveat: (c: Ctx) => string;
  power: (c: Ctx, mode: PowerMode) => string | null;
  style: (c: Ctx, style: string) => string | null;
  goals: (quote: string) => string;
  spec: (c: Ctx) => string;
  closingFirst: string;
  relative: (diffs: string[]) => string;
  diff: Record<Diff, string>;
}

const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

function listWith(and: string) {
  return (items: string[]) =>
    items.length <= 1
      ? items.join("")
      : `${items.slice(0, -1).join(", ")} ${and} ${items[items.length - 1]}`;
}

const PT: Copy = {
  weight: (g, exact) => `${exact ? "" : "≈ "}${g} g sem corda`,
  list: listWith("e"),
  control: {
    "flies-long": (c) => {
      if (c.dense) {
        return `O padrão fechado ${c.pattern}${c.head <= 100 ? ` numa cabeça de ${c.head} in²` : ""} segura a bola: resposta direta para quem sente a bola saindo longa.`;
      }
      if (c.head <= 100 && c.ra !== null && c.ra <= 65) {
        return `Cabeça de ${c.head} in² e RA ${c.ra} dão controle sem rigidez, para a bola parar de sair longa.`;
      }
      // 100 in² with an open pattern and a stiff layup is not a control
      // answer, whatever the prefilter's +1 says; only a genuinely smaller
      // head earns the claim on its own.
      if (c.head <= 98) {
        return `A cabeça de ${c.head} in² pede precisão e devolve controle, justamente o que falta quando a bola sai longa.`;
      }
      return null;
    },
    "low-power": (c) => {
      const parts: string[] = [];
      if (c.head >= 100) parts.push(`a cabeça de ${c.head} in²`);
      if (c.open) parts.push(`o padrão aberto ${c.pattern}`);
      if (c.ra !== null && c.ra >= 67) parts.push(`o RA ${c.ra}`);
      if (parts.length === 0) return null;
      return `${cap(PT.list(parts))} ${parts.length > 1 ? "devolvem" : "devolve"} potência de graça, o que falta quando a bola sai curta.`;
    },
    "off-center": (c) =>
      c.head >= 102
        ? `Os ${c.head} in² de cabeça ampliam o ponto doce: errar o centro custa menos.`
        : null,
    "low-spin": (c) =>
      c.open
        ? `O padrão aberto ${c.pattern} deixa a corda morder mais a bola: mais spin sem mudar o swing.`
        : null,
    "arm-fatigue": (c) => {
      const parts: string[] = [];
      if (c.r.weightGrams <= 295) parts.push(c.w);
      if (c.sw !== null && c.sw <= 315) parts.push(`swingweight ${c.sw}`);
      if (c.ra !== null && c.ra <= 65) parts.push(`RA ${c.ra}`);
      if (parts.length === 0) return null;
      return `${cap(PT.list(parts))} ${parts.length > 1 ? "pesam" : "pesa"} pouco no braço no fim do jogo.`;
    },
    unstable: (c) =>
      c.r.weightGrams >= 300 || (c.sw !== null && c.sw >= 320)
        ? `Com ${c.w}${c.sw !== null && c.sw >= 320 ? ` e swingweight ${c.sw}` : ""}, não tremula contra bola pesada.`
        : null,
  },
  arm: (c, phrase) => {
    if (c.ra === null) return null;
    const who = {
      current: "tem dor ativa no braço",
      past: "já teve lesão e não quer voltar a ter",
      occasional: "sente o braço reclamar depois de jogar",
      fatigue: "sente o braço cansar",
    }[phrase];
    if (c.ra <= 64) {
      return `RA ${c.ra} coloca a raquete entre as mais flexíveis do conjunto, o que importa para quem ${who}.`;
    }
    if (c.ra <= 66) {
      return `RA ${c.ra} fica no meio da tabela de rigidez: conforto razoável para quem ${who}.`;
    }
    return null;
  },
  armCaveat: (c) =>
    `RA ${c.ra} é firme para o seu histórico de braço: vale encordoar com multifilamento ou tensão mais baixa.`,
  power: (c, mode) => {
    if (mode === "help") {
      if (c.r.weightGrams > 295 && c.head < 100) return null;
      const bigHead = c.head >= 100;
      return `${cap(c.w)}${bigHead ? ` e cabeça de ${c.head} in²` : ""} ${bigHead ? "fazem" : "faz"} o trabalho pesado quando o swing é curto.`;
    }
    if (mode === "self") {
      if (c.r.weightGrams < 305 && (c.sw === null || c.sw < 320)) return null;
      return `${cap(c.w)}${c.sw !== null ? ` e swingweight ${c.sw}` : ""} ${c.sw !== null ? "dão" : "dá"} a estabilidade que um swing longo exige: a bola não foge quando você acelera.`;
    }
    if (c.r.weightGrams < 295 || c.r.weightGrams > 315) return null;
    return `Peso médio (${c.w}) e ${c.head} in²: equilíbrio entre ajuda no golpe e controle para um swing médio.`;
  },
  style: (c, style) => {
    switch (style) {
      case "serve-volley":
        return c.r.balancePoints !== null && c.r.balancePoints <= -4 && c.balance
          ? `Balanço ${c.balance} deixa a cabeça leve na mão: troca de pegada rápida e voleio sem atraso.`
          : null;
      case "baseline":
        return c.sw !== null && c.sw >= 320
          ? `Swingweight ${c.sw} põe peso na bola nas trocas de fundo.`
          : null;
      case "counterpuncher":
        return c.r.weightGrams <= 315
          ? `Ágil (${c.w}) para chegar em tudo e devolver com margem.`
          : null;
      case "all-court":
        return c.head >= 98 && c.head <= 100
          ? `Cabeça de ${c.head} in²${c.sw !== null ? ` e swingweight ${c.sw}` : ""}: specs de meio de tabela para quem varia o jogo.`
          : null;
      default:
        return null;
    }
  },
  goals: (quote) =>
    `Entre as candidatas, é a que mais conversa com o que você escreveu: "${quote}".`,
  spec: (c) =>
    `${c.head} in², ${c.w}, padrão ${c.pattern}${c.ra !== null ? `, RA ${c.ra}` : ""}${c.sw !== null ? `, swingweight ${c.sw}` : ""}: dentro do que as suas respostas pedem.`,
  closingFirst:
    "Pelo conjunto das suas respostas, é a combinação mais completa da lista.",
  relative: (diffs) => `Em relação à primeira opção, é ${PT.list(diffs)}.`,
  diff: {
    lighter: "mais leve",
    heavier: "mais pesada",
    biggerHead: "de cabeça maior",
    smallerHead: "de cabeça menor",
    moreOpen: "de padrão mais aberto",
    denser: "de padrão mais fechado",
    softer: "mais flexível",
    stiffer: "mais firme",
  },
};

const EN: Copy = {
  weight: (g) => `${g} g strung`,
  list: listWith("and"),
  control: {
    "flies-long": (c) => {
      if (c.dense) {
        return `The dense ${c.pattern} pattern${c.head <= 100 ? ` on a ${c.head} in² head` : ""} keeps the ball in: the direct answer for shots that fly long.`;
      }
      if (c.head <= 100 && c.ra !== null && c.ra <= 65) {
        return `A ${c.head} in² head and RA ${c.ra} give control without stiffness, so the ball stops flying long.`;
      }
      if (c.head <= 98) {
        return `The ${c.head} in² head asks for precision and gives control back, exactly what is missing when shots fly long.`;
      }
      return null;
    },
    "low-power": (c) => {
      const parts: string[] = [];
      if (c.head >= 100) parts.push(`the ${c.head} in² head`);
      if (c.open) parts.push(`the open ${c.pattern} pattern`);
      if (c.ra !== null && c.ra >= 67) parts.push(`RA ${c.ra}`);
      if (parts.length === 0) return null;
      return `${cap(EN.list(parts))} ${parts.length > 1 ? "give" : "gives"} free power, what is missing when shots land short.`;
    },
    "off-center": (c) =>
      c.head >= 102
        ? `The ${c.head} in² head widens the sweet spot: missing the centre costs less.`
        : null,
    "low-spin": (c) =>
      c.open
        ? `The open ${c.pattern} pattern lets the strings bite the ball: more spin without changing your swing.`
        : null,
    "arm-fatigue": (c) => {
      const parts: string[] = [];
      if (c.r.weightGrams <= 295) parts.push(c.w);
      if (c.sw !== null && c.sw <= 315) parts.push(`a ${c.sw} swingweight`);
      if (c.ra !== null && c.ra <= 65) parts.push(`RA ${c.ra}`);
      if (parts.length === 0) return null;
      return `${cap(EN.list(parts))} ${parts.length > 1 ? "stay" : "stays"} easy on the arm late in a session.`;
    },
    unstable: (c) =>
      c.r.weightGrams >= 300 || (c.sw !== null && c.sw >= 320)
        ? `At ${c.w}${c.sw !== null && c.sw >= 320 ? ` with a ${c.sw} swingweight` : ""}, it does not twist against heavy balls.`
        : null,
  },
  arm: (c, phrase) => {
    if (c.ra === null) return null;
    const who = {
      current: "playing with arm pain right now",
      past: "who has had an arm injury and wants to keep it in the past",
      occasional: "whose arm complains after playing",
      fatigue: "whose arm tires late in a session",
    }[phrase];
    if (c.ra <= 64) {
      return `RA ${c.ra} puts it among the most flexible frames in the set, which matters for someone ${who}.`;
    }
    if (c.ra <= 66) {
      return `RA ${c.ra} sits mid-table for stiffness: reasonable comfort for someone ${who}.`;
    }
    return null;
  },
  armCaveat: (c) =>
    `RA ${c.ra} is on the firm side for your arm history: worth stringing with a multifilament or at a lower tension.`,
  power: (c, mode) => {
    if (mode === "help") {
      if (c.r.weightGrams > 295 && c.head < 100) return null;
      const bigHead = c.head >= 100;
      return `${cap(c.w)}${bigHead ? ` and a ${c.head} in² head` : ""} ${bigHead ? "do" : "does"} the heavy lifting when the swing is short.`;
    }
    if (mode === "self") {
      if (c.r.weightGrams < 305 && (c.sw === null || c.sw < 320)) return null;
      return `${cap(c.w)}${c.sw !== null ? ` and a ${c.sw} swingweight` : ""} ${c.sw !== null ? "give" : "gives"} the stability a long swing demands: the ball stays on target when you accelerate.`;
    }
    if (c.r.weightGrams < 295 || c.r.weightGrams > 315) return null;
    return `Medium weight (${c.w}) and ${c.head} in²: a balance of help and control for a medium swing.`;
  },
  style: (c, style) => {
    switch (style) {
      case "serve-volley":
        return c.r.balancePoints !== null && c.r.balancePoints <= -4 && c.balance
          ? `A ${c.balance} balance keeps the head light in hand: quick grip changes and no lag at the net.`
          : null;
      case "baseline":
        return c.sw !== null && c.sw >= 320
          ? `A ${c.sw} swingweight puts weight behind the ball in baseline exchanges.`
          : null;
      case "counterpuncher":
        return c.r.weightGrams <= 315
          ? `Quick (${c.w}) to get to everything and send it back with margin.`
          : null;
      case "all-court":
        return c.head >= 98 && c.head <= 100
          ? `A ${c.head} in² head${c.sw !== null ? ` and a ${c.sw} swingweight` : ""}: mid-table specs for a game that varies.`
          : null;
      default:
        return null;
    }
  },
  goals: (quote) =>
    `Of the candidates, it is the one that speaks most to what you wrote: "${quote}".`,
  spec: (c) =>
    `${c.head} in², ${c.w}, ${c.pattern} pattern${c.ra !== null ? `, RA ${c.ra}` : ""}${c.sw !== null ? `, swingweight ${c.sw}` : ""}: inside what your answers call for.`,
  closingFirst:
    "Across all your answers, it is the most complete match in the list.",
  relative: (diffs) => `Compared with the first pick, it is ${EN.list(diffs)}.`,
  diff: {
    lighter: "lighter",
    heavier: "heavier",
    biggerHead: "bigger in the head",
    smallerHead: "smaller in the head",
    moreOpen: "more open in the pattern",
    denser: "denser in the pattern",
    softer: "more flexible",
    stiffer: "firmer",
  },
};

const COPY: Record<Locale, Copy> = { "pt-BR": PT, en: EN };

/** Dimension probability assumed when Jev did not run: reasons then order by weight alone. */
const NEUTRAL_PROBABILITY = 0.6;
/** Below this Jev did not really see the pick serving the player's words; do not claim it. */
const MIN_GOALS_PROBABILITY = 0.55;
const MAX_QUOTE_CHARS = 80;
const MAX_DIFFS = 2;

function str(a: Answers, id: keyof Answers): string | undefined {
  const v = a[id];
  return typeof v === "string" ? v : undefined;
}
function arr(a: Answers, id: keyof Answers): string[] {
  const v = a[id];
  return Array.isArray(v) ? v : [];
}

function ctxFor(r: Racket, locale: Locale): Ctx {
  const w = weightFor(r, locale);
  return {
    r,
    w: COPY[locale].weight(w.grams, w.exact),
    head: r.headSizeIn2,
    ra: r.stiffnessRA,
    sw: r.swingweight,
    pattern: r.stringPattern,
    balance: r.balance,
    open: isOpenPattern(r.stringPattern),
    dense: isDensePattern(r.stringPattern),
  };
}

function powerMode(answers: Answers): PowerMode {
  const swing = str(answers, "swing");
  if (swing === "racquet-power") return "help";
  if (swing === "self-power") return "self";
  const skill = str(answers, "skill");
  if (skill === "beginner") return "help";
  if (skill === "advanced" || skill === "competitive") return "self";
  return "mixed";
}

function armPhrase(answers: Answers): ArmPhrase | null {
  const injury = str(answers, "armInjury");
  if (injury === "current" || injury === "past" || injury === "occasional") {
    return injury;
  }
  return arr(answers, "struggles").includes("arm-fatigue") ? "fatigue" : null;
}

/** The player's words, shortest useful field first, trimmed to fit one sentence. */
export function quoteFor(answers: Answers): string | null {
  const words = freeText(answers);
  const raw =
    words.improveGoals ?? words.racquetFeel ?? words.strengths ?? words.anythingElse;
  if (!raw) return null;
  let q = raw.replace(/^["'“”«»`]+|["'“”«»`.!?]+$/g, "").trim();
  if (q.length > MAX_QUOTE_CHARS) {
    const cut = q.lastIndexOf(" ", MAX_QUOTE_CHARS);
    q = `${q.slice(0, cut > 40 ? cut : MAX_QUOTE_CHARS).trimEnd()}…`;
  }
  return q;
}

function reasonsFor(
  pick: PickToJustify,
  c: Ctx,
  answers: Answers,
  copy: Copy,
  weights: Partial<Record<Dimension, number>>,
  quote: string | null,
): Reason[] {
  const p = (dim: Dimension) => pick.dims?.[dim] ?? NEUTRAL_PROBABILITY;
  const reasons: Reason[] = [];
  const push = (dim: Dimension, key: string, text: string | null, bonus = 1) => {
    const w = weights[dim];
    if (text && w !== undefined) {
      reasons.push({ key, dim, weight: w * p(dim) * bonus, text });
    }
  };

  // Struggles in the order the player ticked them: the first one named is
  // usually the one that hurts most, so it edges out the others as a lead.
  arr(answers, "struggles").forEach((s, i) => {
    const gen = copy.control[s];
    if (gen) push("control", `control:${s}`, gen(c), 1 - i * 0.05);
  });

  const phrase = armPhrase(answers);
  if (phrase) push("arm", "arm", copy.arm(c, phrase));

  push("power", "power", copy.power(c, powerMode(answers)));

  const style = str(answers, "style");
  if (style) push("style", `style:${style}`, copy.style(c, style));

  if (quote) push("goals", "goals", copy.goals(quote));

  return reasons.sort((a, b) => b.weight - a.weight);
}

function diffsFrom(first: Racket, r: Racket, copy: Copy): string[] {
  const diffs: Diff[] = [];
  const dw = r.weightGrams - first.weightGrams;
  if (Math.abs(dw) >= 8) diffs.push(dw < 0 ? "lighter" : "heavier");
  const dh = r.headSizeIn2 - first.headSizeIn2;
  if (Math.abs(dh) >= 2) diffs.push(dh > 0 ? "biggerHead" : "smallerHead");
  const firstOpen = isOpenPattern(first.stringPattern);
  const firstDense = isDensePattern(first.stringPattern);
  if (firstDense && isOpenPattern(r.stringPattern)) diffs.push("moreOpen");
  if (firstOpen && isDensePattern(r.stringPattern)) diffs.push("denser");
  if (first.stiffnessRA !== null && r.stiffnessRA !== null) {
    const dra = r.stiffnessRA - first.stiffnessRA;
    if (Math.abs(dra) >= 4) diffs.push(dra < 0 ? "softer" : "stiffer");
  }
  return diffs.slice(0, MAX_DIFFS).map((d) => copy.diff[d]);
}

export function justifyPicks(
  picks: PickToJustify[],
  answers: Answers,
  locale: Locale,
): string[] {
  const copy = COPY[locale];
  const weights = dimensionWeights(answers);
  const quote = quoteFor(answers);
  const phrase = armPhrase(answers);

  // Only the pick Jev rated highest on the player's own words gets to claim
  // them, and only when it actually rated it — a template cannot read intent.
  let goalsIndex = -1;
  if (quote) {
    let best = MIN_GOALS_PROBABILITY;
    picks.forEach((pick, i) => {
      const g = pick.dims?.goals;
      if (g !== undefined && g >= best) {
        best = g;
        goalsIndex = i;
      }
    });
  }

  const usedLeads = new Set<string>();
  return picks.map((pick, i) => {
    const c = ctxFor(pick.racket, locale);
    const reasons = reasonsFor(
      pick,
      c,
      answers,
      copy,
      weights,
      i === goalsIndex ? quote : null,
    );

    const lead =
      reasons.find((r) => !usedLeads.has(r.key)) ?? reasons[0] ?? null;
    if (lead) usedLeads.add(lead.key);
    const second =
      reasons.find((r) => r !== lead && r.dim !== lead?.dim) ??
      reasons.find((r) => r !== lead && r.key !== lead?.key) ??
      null;

    const caveat =
      phrase && c.ra !== null && c.ra >= 67 ? copy.armCaveat(c) : null;
    const closing =
      caveat ??
      (i === 0
        ? copy.closingFirst
        : (() => {
            const diffs = diffsFrom(picks[0].racket, pick.racket, copy);
            return diffs.length > 0 ? copy.relative(diffs) : null;
          })());

    const sentences = [lead?.text ?? copy.spec(c), second?.text, closing];
    return sentences.filter((s): s is string => Boolean(s)).join(" ");
  });
}
