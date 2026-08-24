import { after, NextResponse } from "next/server";
import { z } from "zod";
import { DEFAULT_STORE, PLAIN_REL, relForKind, trackedUrl } from "@/lib/affiliate";
import { resolveStore } from "@/lib/offers";
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

  let candidates;
  try {
    candidates = prefilter(body.answers, loadCatalog());
  } catch (error) {
    if (error instanceof InsufficientCandidatesError) {
      after(() =>
        recordQuizRun({
          locale: body.locale,
          mode: body.mode,
          answers: body.answers,
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

    return NextResponse.json({
      recommendations: result.picks.map((pick) => {
        const racket = byId.get(pick.racketId)!;
        const link = resolveStore(racket, DEFAULT_STORE);
        return {
          racket,
          justification: pick.justification,
          // Points at our own click-tracking redirect, not the store: the
          // affiliate configuration stays server-side and the click is counted.
          buyUrl: trackedUrl(pick.racketId, "results"),
          // Per link, not global: with several stores one can be monetised
          // while another is still a plain listing.
          rel: link ? relForKind(link.kind) : PLAIN_REL,
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
