import type { Answers } from "./answers";
import { getDb } from "./db";
import { outboundClicks, quizRuns, recommendations } from "./db/schema";

/**
 * Every function here is best-effort: analytics must never turn a working
 * recommendation into a failed request. With no database configured they are
 * no-ops, and a write that throws is logged and swallowed.
 */

export interface QuizRunRecord {
  locale: string;
  mode: string;
  answers: Answers;
  /** Catalog size after the availability filter, before the prefilter. */
  poolSize: number;
  candidateCount: number;
  status: "ok" | "no_candidates" | "failed";
  errorKind?: string | null;
  model?: string | null;
  inputTokens?: number | null;
  outputTokens?: number | null;
  latencyMs?: number | null;
  picks?: { rank: number; racketId: string; justification: string }[];
}

export async function recordQuizRun(record: QuizRunRecord): Promise<void> {
  const db = getDb();
  if (!db) return;

  try {
    const [run] = await db
      .insert(quizRuns)
      .values({
        locale: record.locale,
        mode: record.mode,
        answers: record.answers,
        poolSize: record.poolSize,
        candidateCount: record.candidateCount,
        status: record.status,
        errorKind: record.errorKind ?? null,
        model: record.model ?? null,
        inputTokens: record.inputTokens ?? null,
        outputTokens: record.outputTokens ?? null,
        latencyMs: record.latencyMs ?? null,
      })
      .returning({ id: quizRuns.id });

    if (run && record.picks?.length) {
      await db.insert(recommendations).values(
        record.picks.map((pick) => ({
          quizRunId: run.id,
          rank: pick.rank,
          racketId: pick.racketId,
          justification: pick.justification,
        })),
      );
    }
  } catch (error) {
    console.error("failed to record quiz run:", error);
  }
}

export interface OutboundClickRecord {
  racketId: string;
  merchant: string;
  store?: string | null;
  linkKind?: string | null;
  source: string;
  locale?: string | null;
  affiliate: boolean;
}

export async function recordOutboundClick(
  record: OutboundClickRecord,
): Promise<void> {
  const db = getDb();
  if (!db) return;

  try {
    await db.insert(outboundClicks).values({
      racketId: record.racketId,
      merchant: record.merchant,
      store: record.store ?? null,
      linkKind: record.linkKind ?? null,
      source: record.source,
      locale: record.locale ?? null,
      affiliate: record.affiliate,
    });
  } catch (error) {
    console.error("failed to record outbound click:", error);
  }
}
