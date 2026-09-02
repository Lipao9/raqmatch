import Anthropic from "@anthropic-ai/sdk";
import { z } from "zod";
import type { Answers } from "./answers";
import type { Racket } from "./catalog";
import {
  buildSystemPrompt,
  buildUserMessage,
  RECOMMEND_MODEL,
  recommendTool,
  USE_GATEWAY,
} from "./prompt";

export class RecommendationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "RecommendationError";
  }
}

export interface Pick {
  racketId: string;
  justification: string;
}

export interface RecommendResult {
  picks: Pick[];
  model: string;
  /** Summed across the corrective retry, so cost per quiz is the real cost. */
  inputTokens: number;
  outputTokens: number;
  /** Time spent in the model call(s) only, not the whole request. */
  latencyMs: number;
}

const toolOutputSchema = z.object({
  recommendations: z
    .array(
      z.object({
        racket_id: z.string(),
        justification: z.string().min(1),
      }),
    )
    .min(3),
});

let client: Anthropic | null = null;

function getClient(): Anthropic {
  if (client) return client;
  if (USE_GATEWAY) {
    const apiKey = process.env.AI_GATEWAY_API_KEY;
    if (!apiKey) {
      // Without this guard the SDK would fall back to ANTHROPIC_API_KEY and
      // send the wrong key to the gateway, failing with an opaque 401.
      throw new Error("AI_PROVIDER=gateway requires AI_GATEWAY_API_KEY");
    }
    client = new Anthropic({
      apiKey,
      baseURL: "https://ai-gateway.vercel.sh",
    });
  } else {
    client = new Anthropic(); // reads ANTHROPIC_API_KEY; throws if missing
  }
  return client;
}

interface ModelCall {
  picks: Pick[];
  inputTokens: number;
  outputTokens: number;
}

async function callModel(
  messages: Anthropic.MessageParam[],
  locale: "pt-BR" | "en",
): Promise<ModelCall> {
  const response = await getClient().messages.create({
    model: RECOMMEND_MODEL,
    max_tokens: 2048,
    system: buildSystemPrompt(locale),
    tools: [recommendTool],
    tool_choice: { type: "tool", name: "recommend_rackets" },
    messages,
  });

  const usage = {
    inputTokens: response.usage.input_tokens,
    outputTokens: response.usage.output_tokens,
  };

  const toolUse = response.content.find(
    (b): b is Anthropic.ToolUseBlock => b.type === "tool_use",
  );
  if (!toolUse) {
    throw new RecommendationError("Model returned no tool_use block");
  }

  const parsed = toolOutputSchema.safeParse(toolUse.input);
  if (!parsed.success) {
    throw new RecommendationError(
      `Tool output failed validation: ${parsed.error.message}`,
    );
  }
  return {
    ...usage,
    picks: parsed.data.recommendations.map((r) => ({
      racketId: r.racket_id,
      justification: r.justification,
    })),
  };
}

function validatePicks(picks: Pick[], validIds: Set<string>): string[] {
  const seen = new Set<string>();
  const invalid: string[] = [];
  for (const p of picks.slice(0, 3)) {
    if (!validIds.has(p.racketId) || seen.has(p.racketId)) {
      invalid.push(p.racketId);
    }
    seen.add(p.racketId);
  }
  return invalid;
}

export async function recommend(
  candidates: Racket[],
  answers: Answers,
  locale: "pt-BR" | "en",
): Promise<RecommendResult> {
  const validIds = new Set(candidates.map((r) => r.id));
  const userMessage = buildUserMessage(candidates, answers);
  const messages: Anthropic.MessageParam[] = [
    { role: "user", content: userMessage },
  ];

  const startedAt = Date.now();
  let inputTokens = 0;
  let outputTokens = 0;
  const result = (picks: Pick[]): RecommendResult => ({
    picks,
    model: RECOMMEND_MODEL,
    inputTokens,
    outputTokens,
    latencyMs: Date.now() - startedAt,
  });

  let call = await callModel(messages, locale);
  inputTokens += call.inputTokens;
  outputTokens += call.outputTokens;

  let picks = call.picks;
  let invalid = validatePicks(picks, validIds);
  if (invalid.length > 0) {
    // One corrective retry: restate the valid ids and ask again.
    messages.push(
      {
        role: "assistant",
        content: `Previous attempt used invalid or duplicate racket_id values: ${invalid.join(", ")}.`,
      },
      {
        role: "user",
        content: `Some racket_id values were not in the candidate list. Pick again using ONLY these exact ids, no duplicates: ${[...validIds].join(", ")}`,
      },
    );
    call = await callModel(messages, locale);
    inputTokens += call.inputTokens;
    outputTokens += call.outputTokens;

    picks = call.picks;
    invalid = validatePicks(picks, validIds);
    if (invalid.length > 0) {
      throw new RecommendationError(
        `Model returned invalid ids after retry: ${invalid.join(", ")}`,
      );
    }
  }

  return result(picks.slice(0, 3));
}
