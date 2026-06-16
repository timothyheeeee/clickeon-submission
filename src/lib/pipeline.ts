import { extractJson } from "./extract-json";
import { mockStream, type MockBehavior, type MockState } from "./anthropic-mock";

export interface GenerateInput {
  /** Drives the mock streaming client (see anthropic-mock.ts). */
  behavior: MockBehavior;
  /** Hands the finished draft to the next pipeline stage. May reject. */
  advanceToNextStage: () => Promise<void>;
  /** Returns true once the draft passes review. Scripted by callers/tests. */
  reviewPasses: (attempt: number) => boolean;
}

export interface GenerateResult {
  status: "ok" | "error";
  attempts: number;
}

const MAX_REVISIONS = 3;
const MAX_FETCH_RETRIES = 5;

/**
 * Runs one content-generation pass: stream a draft, extract it, revise until it
 * passes review, then hand off to the next stage.
 */
export async function generate(input: GenerateInput): Promise<GenerateResult> {
  const state: MockState = { calls: 0 };
  let text = "";
  let fetchAttempts = 0;
  let fetchSuccess = false;

  // Phase 1: Robust Fetch & Parse Loop (Fixes Bug 2 & Bug 3 - Rate Limits / Truncation)
  while (!fetchSuccess && fetchAttempts < MAX_FETCH_RETRIES) {
    try {
      fetchAttempts += 1;
      text = await mockStream(input.behavior, state);
      
      // Ensure the text is valid JSON before moving forward
      extractJson(text);
      fetchSuccess = true;
    } catch {
      // If we run out of retries, fail gracefully instead of crashing the process
      if (fetchAttempts >= MAX_FETCH_RETRIES) {
        return { status: "error", attempts: 0 };
      }
      // Otherwise, catch the stream truncation or 429 and loop to retry
    }
  }

  // Phase 2: Bounded Revision Loop (Fixes Bug 3 - Circuit Breaker)
  let attempt = 0;
  while (!input.reviewPasses(attempt)) {
    attempt += 1;
    if (attempt >= MAX_REVISIONS) {
      return { status: "error", attempts: attempt };
    }
  }

  // Phase 3: Awaited Hand-off (Fixes Bug 1 - Silent Rejection)
  try {
    await input.advanceToNextStage();
  } catch {
    return { status: "error", attempts: attempt };
  }

  return { status: "ok", attempts: attempt };
}

export { MAX_REVISIONS };