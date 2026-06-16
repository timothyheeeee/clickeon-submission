import { extractJson } from "./extract-json";
import { mockStream, type MockBehavior, type MockState } from "./anthropic-mock";

export interface GenerateInput {
  behavior: MockBehavior;
  advanceToNextStage: () => Promise<void>;
  reviewPasses: (attempt: number) => boolean;
}

export interface GenerateResult {
  status: "ok" | "error";
  attempts: number;
}

const MAX_REVISIONS = 3;
const MAX_FETCH_RETRIES = 5;

export async function generate(input: GenerateInput): Promise<GenerateResult> {
  const state: MockState = { calls: 0 };
  let text = "";
  let fetchAttempts = 0;
  let fetchSuccess = false;

  // Phase 1: Robust Fetch & Parse Loop
  while (!fetchSuccess && fetchAttempts < MAX_FETCH_RETRIES) {
    try {
      fetchAttempts += 1;
      text = await mockStream(input.behavior, state);
      extractJson(text);
      fetchSuccess = true;
    } catch {
      if (fetchAttempts >= MAX_FETCH_RETRIES) {
        return { status: "error", attempts: 0 };
      }
    }
  }

  // Phase 2: Bounded Revision Loop (Now with structural crash protection!)
  let attempt = 0;
  try {
    while (!input.reviewPasses(attempt)) {
      attempt += 1;
      if (attempt >= MAX_REVISIONS) {
        return { status: "error", attempts: attempt };
      }
    }
  } catch {
    // If the validation callback hard-crashes, fail cleanly instead of dying
    return { status: "error", attempts: attempt };
  }

  // Phase 3: Awaited Hand-off
  try {
    await input.advanceToNextStage();
  } catch {
    return { status: "error", attempts: attempt };
  }

  return { status: "ok", attempts: attempt };
}

export { MAX_REVISIONS };