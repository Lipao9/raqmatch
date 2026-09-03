import { after, NextResponse } from "next/server";
import { z } from "zod";
import {
  PLAIN_REL,
  relForKind,
  trackedStringUrl,
  trackedUrl,
} from "@/lib/affiliate";
import { resolveStringLink } from "@/lib/strings";
import {
  stringAdviceFor,
  stringProfileFromAnswers,
} from "@/lib/string-advice";
import { availableRacketIds, storefrontFor } from "@/lib/offers";
import { recordQuizRun } from "@/lib/analytics";
import { answersSchemaFor, quizModeSchema, type Answers } from "@/lib/answers";
import { loadCatalog } from "@/lib/catalog";
import { InsufficientCandidatesError, prefilter } from "@/lib/prefilter";
import { checkRateLimit, clientIp, RECOMMEND_LIMITS } from "@/lib/rate-limit";
import { recommend, RecommendationError } from "@/lib/recommend";

export const maxDuration = 30;

const baseSchema = z.object({
  mode: quizModeSchema.default("quick"),
  locale: z.enum(["pt-BR", "en"]),
});

function tooManyRequests(retryAfterSeconds: number) {
  return NextResponse.json(
    { error: "rate_limited" },
    {
      status: 429,
      headers: { "Retry-After": String(Math.max(1, retryAfterSeconds)) },
    },
  );
}

export async function POST(req: Request) {
  // Rate limiting runs before parsing: this endpoint spends money per call, so
  // load is shed as cheaply as possible. The global window is checked first
  // because it is the one that bounds the worst-case bill.
  const global = await checkRateLimit(
    "recommend:global",
    RECOMMEND_LIMITS.global.limit,
    RECOMMEND_LIMITS.global.windowSeconds,
  );
  if (!global.ok) return tooManyRequests(global.retryAfterSeconds);

  const perIp = await checkRateLimit(
    `recommend:ip:${clientIp(req)}`,
    RECOMMEND_LIMITS.perIp.limit,
    RECOMMEND_LIMITS.perIp.windowSeconds,
  );
  if (!perIp.ok) return tooManyRequests(perIp.retryAfterSeconds);

  let body: z.infer<typeof baseSchema> & { answers: Answers };
  try {
    const json = await req.json();
    const base = baseSchema.parse(json);
    const answers = answersSchemaFor(base.mode).parse(json.answers);
    body = { ...base, answers };
  } catch (error) {
    const details = error instanceof z.ZodError ? error.issues : undefined;
    return NextResponse.json(
      { error: "invalid_request", details },
      { status: 400 },
    );
  }

  // Availability is a property of the market, not the player, so it narrows
  // the pool before the prefilter rather than joining its relaxable filters: a
  // pt-BR visitor is never recommended a racquet they cannot buy in Brazil,
  // no matter how few candidates remain. /en keeps the full catalog — Tennis
  // Warehouse can ship to that reader.
  const pool =
    body.locale === "pt-BR"
      ? (() => {
          const available = availableRacketIds("mercadolivre");
          return loadCatalog().filter((r) => available.has(r.id));
        })()
      : loadCatalog();

  let candidates;
  try {
    candidates = prefilter(body.answers, pool);
  } catch (error) {
    if (error instanceof InsufficientCandidatesError) {
      after(() =>
        recordQuizRun({
          locale: body.locale,
          mode: body.mode,
          answers: body.answers,
          poolSize: pool.length,
          candidateCount: 0,
          status: "no_candidates",
        }),
      );
      return NextResponse.json({ error: "no_candidates" }, { status: 422 });
    }
    throw error;
  }

  try {
    const result = await recommend(candidates, body.answers, body.locale);
    const byId = new Map(candidates.map((r) => [r.id, r]));

    // after() keeps the write off the response path: a slow insert must not add
    // latency to a request that already waited on the model.
    after(() =>
      recordQuizRun({
        locale: body.locale,
        mode: body.mode,
        answers: body.answers,
        poolSize: pool.length,
        candidateCount: candidates.length,
        status: "ok",
        model: result.model,
        inputTokens: result.inputTokens,
        outputTokens: result.outputTokens,
        latencyMs: result.latencyMs,
        picks: result.picks.map((pick, i) => ({
          rank: i + 1,
          racketId: pick.racketId,
          justification: pick.justification,
        })),
      }),
    );

    // Derived once — the profile is a property of the answers, not of a pick.
    const stringProfile = stringProfileFromAnswers(body.answers);

    return NextResponse.json({
      recommendations: result.picks.map((pick) => {
        const racket = byId.get(pick.racketId)!;
        // Locale-aware: a Brazilian with a mapped Mercado Livre offer is sent
        // there, not to a US store that cannot ship to them.
        const storefront = storefrontFor(racket, body.locale);
        // Deterministic, so it rides along free on a request that already paid
        // for a model call. Only the top pick: the results card is dense
        // already, and the racquet page carries the full list.
        const stringPick = stringAdviceFor(racket, stringProfile).picks[0];
        return {
          racket,
          justification: pick.justification,
          // Points at our own click-tracking redirect, not the store: the
          // affiliate configuration stays server-side and the click is counted.
          buyUrl: trackedUrl(pick.racketId, "results", storefront?.store),
          // Per link, not global: with several stores one can be monetised
          // while another is still a plain listing.
          rel: storefront ? relForKind(storefront.kind) : PLAIN_REL,
          stringPick: stringPick
            ? {
                name: `${stringPick.string.brand} ${stringPick.string.model}`,
                gaugeMm: stringPick.string.gaugeMm,
                reason: stringPick.reason,
                tension: stringPick.tension,
                // String offers only exist for Mercado Livre, so an /en reader
                // gets the advice without a buy link — a Brazilian marketplace
                // page is dead weight for someone it will not ship to.
                buyUrl:
                  body.locale === "pt-BR"
                    ? trackedStringUrl(stringPick.string.id, "results")
                    : null,
                rel: relForKind(resolveStringLink(stringPick.string).kind),
              }
            : null,
        };
      }),
    });
  } catch (error) {
    console.error("recommendation failed:", error);
    after(() =>
      recordQuizRun({
        locale: body.locale,
        mode: body.mode,
        answers: body.answers,
        poolSize: pool.length,
        candidateCount: candidates.length,
        status: "failed",
        errorKind:
          error instanceof RecommendationError ? error.name : "unknown_error",
      }),
    );
    if (error instanceof RecommendationError || error instanceof Error) {
      return NextResponse.json(
        { error: "recommendation_failed" },
        { status: 502 },
      );
    }
    throw error;
  }
}
