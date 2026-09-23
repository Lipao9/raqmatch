/**
 * Offline eval of the ranker against real quiz runs.
 *
 * Replays the most recent successful runs from the production database
 * through the current prefilter → Jev → justify pipeline and prints, per run,
 * what was recommended then versus what the current code picks now, with
 * Jev's per-dimension probabilities and the generated justifications.
 *
 * The stored picks are not ground truth — most of them came from the Haiku
 * era — so overlap is a sanity signal, not a score. What the eval is for:
 * reading twenty rankings with the profile next to them and judging whether
 * the picks make tennis sense, and reading the justifications for tone before
 * a change to the templates ships.
 *
 *   npm run eval:picks            # last 20 runs
 *   npm run eval:picks -- 40 5    # last 40 runs, print justifications for 5
 *
 * Needs DATABASE_URL (production, read-only queries) and AI_GATEWAY_API_KEY.
 */
import postgres from "postgres";
import type { Answers } from "../src/lib/answers";
import { loadCatalog, type Racket } from "../src/lib/catalog";
import { rankCandidates, type Locale } from "../src/lib/jev";
import { justifyPicks } from "../src/lib/justify";
import { availableRacketIds } from "../src/lib/offers";
import { prefilter } from "../src/lib/prefilter";
import { pickDistinct } from "../src/lib/recommend";

const LIMIT = Number(process.argv[2] ?? 20);
const SHOW_TEXT = Number(process.argv[3] ?? 3);

interface Run {
  id: string;
  created_at: Date;
  locale: Locale;
  mode: string;
  answers: Answers;
  model: string | null;
  latency_ms: number | null;
  picks: string[] | null;
}

async function loadRuns(): Promise<Run[]> {
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error("DATABASE_URL is not set");
  const sql = postgres(url, { ssl: "require", max: 1 });
  try {
    return await sql<Run[]>`
      select r.id, r.created_at, r.locale, r.mode, r.answers, r.model, r.latency_ms,
        (select json_agg(x.racket_id order by x.rank)
           from recommendations x where x.quiz_run_id = r.id) as picks
      from quiz_runs r
      where r.status = 'ok'
      order by r.created_at desc
      limit ${LIMIT}`;
  } finally {
    await sql.end();
  }
}

const overlap = (a: string[], b: string[]) => a.filter((x) => b.includes(x)).length;

async function main() {
  const runs = await loadRuns();
  const catalog = loadCatalog();
  const brazil = availableRacketIds("mercadolivre");

  let n = 0;
  let overlapSum = 0;
  let top1 = 0;
  let latencySum = 0;
  let tokenSum = 0;
  let fallbacks = 0;

  for (const run of runs) {
    const pool = run.locale === "pt-BR" ? catalog.filter((r) => brazil.has(r.id)) : catalog;
    let candidates: Racket[];
    try {
      candidates = prefilter(run.answers, pool);
    } catch (error) {
      console.log(`\nskip ${run.id}: ${(error as Error).message}`);
      continue;
    }

    const t0 = Date.now();
    let result;
    try {
      result = await rankCandidates(candidates, run.answers, run.locale);
    } catch (error) {
      fallbacks++;
      console.log(`\n=== ${run.created_at.toISOString().slice(0, 10)} ${run.locale} ${run.mode} | JEV FAILED: ${(error as Error).message}`);
      continue;
    }
    const ms = Date.now() - t0;
    const chosen = pickDistinct(result.ranked);
    const now = chosen.map((c) => c.racket.id);
    const then = run.picks ?? [];

    n++;
    overlapSum += overlap(now, then);
    top1 += Number(now[0] === then[0]);
    latencySum += ms;
    tokenSum += result.inputTokens;

    const a = run.answers as Record<string, unknown>;
    const words = ["improveGoals", "racquetFeel", "strengths", "anythingElse"]
      .map((k) => a[k])
      .filter((v): v is string => typeof v === "string" && v.trim() !== "")
      .map((v) => `"${v.slice(0, 70)}"`)
      .join(" / ");
    console.log(
      `\n=== ${run.created_at.toISOString().slice(0, 10)} ${run.locale} ${run.mode} | ${candidates.length} cands | ${result.inputTokens} tok ${ms}ms` +
        `\nprofile: skill=${a.skill} swing=${a.swing} style=${a.style} arm=${a.armInjury} struggles=${(a.struggles as string[] | undefined)?.join("/") ?? "-"} pc=${a.powerControl}${words ? `\nwords: ${words}` : ""}` +
        `\nthen (${run.model ?? "?"}, ${run.latency_ms ?? "?"}ms): ${then.join(", ")}` +
        `\nnow: ${now.join(", ")}  (overlap ${overlap(now, then)}/3)`,
    );
    for (const c of result.ranked.slice(0, 6)) {
      const dims = Object.entries(c.dims)
        .map(([k, v]) => `${k[0]}${v.toFixed(2)}`)
        .join(" ");
      const wasRank = then.indexOf(c.racket.id);
      console.log(
        `  ${c.racket.id.padEnd(40)} score=${c.score.toFixed(3)} [${dims}]${wasRank >= 0 ? ` <- then #${wasRank + 1}` : ""}`,
      );
    }
    if (n <= SHOW_TEXT) {
      const texts = justifyPicks(
        chosen.map((c) => ({ racket: c.racket, dims: c.dims })),
        run.answers,
        run.locale,
      );
      texts.forEach((t, i) => console.log(`  ${i + 1}. ${chosen[i].racket.brand} ${chosen[i].racket.model}: ${t}`));
    }
  }

  if (n === 0) {
    console.log("\nno runs evaluated");
    return;
  }
  console.log(
    `\n##### ${n} runs | overlap with stored picks ${(overlapSum / n).toFixed(2)}/3 | same #1 ${top1}/${n} | avg ${(latencySum / n).toFixed(0)}ms | avg ${(tokenSum / n).toFixed(0)} input tokens | jev failures ${fallbacks}`,
  );
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
