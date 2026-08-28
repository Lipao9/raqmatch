import {
  boolean,
  index,
  integer,
  jsonb,
  pgTable,
  text,
  timestamp,
  uuid,
} from "drizzle-orm/pg-core";
import type { Answers } from "@/lib/answers";

/**
 * One row per completed call to /api/recommend. Stores the profile that was
 * asked about plus what the model cost, so "which answers lead to which
 * racquets" and "what is a quiz worth in tokens" are both answerable without
 * adding more instrumentation later.
 */
export const quizRuns = pgTable(
  "quiz_runs",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    createdAt: timestamp("created_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
    locale: text("locale").notNull(),
    mode: text("mode").notNull(),
    answers: jsonb("answers").$type<Answers>().notNull(),
    /**
     * Catalog size after the locale availability filter, before the prefilter.
     * Nullable because rows written before the pt-BR availability filter
     * existed genuinely do not know it.
     */
    poolSize: integer("pool_size"),
    candidateCount: integer("candidate_count").notNull(),
    /** ok | no_candidates | failed */
    status: text("status").notNull(),
    errorKind: text("error_kind"),
    model: text("model"),
    inputTokens: integer("input_tokens"),
    outputTokens: integer("output_tokens"),
    /** Wall-clock time of the model call(s), not of the whole request. */
    latencyMs: integer("latency_ms"),
  },
  (t) => [index("quiz_runs_created_at_idx").on(t.createdAt)],
);

export const recommendations = pgTable(
  "recommendations",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    quizRunId: uuid("quiz_run_id")
      .notNull()
      .references(() => quizRuns.id, { onDelete: "cascade" }),
    /** 1-3, best first. */
    rank: integer("rank").notNull(),
    /** Catalog id, not a foreign key: the catalog is a versioned JSON file. */
    racketId: text("racket_id").notNull(),
    justification: text("justification").notNull(),
  },
  (t) => [index("recommendations_racket_id_idx").on(t.racketId)],
);

/**
 * Outbound clicks to a store. `merchant` exists from day one so a second store
 * (Prospin, Amazon BR) can be added without a migration — the whole point of
 * measuring is to compare which store actually converts.
 */
export const outboundClicks = pgTable(
  "outbound_clicks",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    createdAt: timestamp("created_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
    racketId: text("racket_id").notNull(),
    /** Hostname of the destination store, e.g. tennis-warehouse.com. */
    merchant: text("merchant").notNull(),
    /**
     * Affiliate program key (mercadolivre | amazon | shopee | tennis-warehouse).
     * Distinct from `merchant`: one program can send clicks to more than one
     * hostname — a Mercado Livre link lands on `mercadolivre.com.br` when it is
     * a plain listing and on `meli.la` when it is a minted affiliate link.
     * Nullable because rows written before multi-store support genuinely do not
     * know, and backfilling a guess would be worse than a null.
     */
    store: text("store"),
    /**
     * affiliate_deep | plain_deep | affiliate_search | plain_search — how the
     * destination was arrived at. This is what makes "is hand-curating a deep
     * link worth the effort, versus just linking to a search?" a measurable
     * question instead of an argument.
     */
    linkKind: text("link_kind"),
    /** results | racquet_page — where the click came from. */
    source: text("source").notNull(),
    locale: text("locale"),
    /** Whether the link carried affiliate tracking at click time. */
    affiliate: boolean("affiliate").notNull(),
  },
  (t) => [
    index("outbound_clicks_created_at_idx").on(t.createdAt),
    index("outbound_clicks_racket_id_idx").on(t.racketId),
  ],
);

/**
 * Fixed-window counters. Postgres rather than Redis because the traffic is tiny
 * and one datastore beats two; revisit if quiz volume ever makes the write
 * contention matter.
 */
export const rateLimits = pgTable("rate_limits", {
  key: text("key").primaryKey(),
  windowStart: timestamp("window_start", { withTimezone: true }).notNull(),
  count: integer("count").notNull(),
});
