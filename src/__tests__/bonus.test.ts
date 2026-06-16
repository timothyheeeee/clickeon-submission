import { describe, it, expect } from "vitest";
import { generate } from "../lib/pipeline";

describe("Bonus Edge Case — stream returns valid syntax but fails processing constraints", () => {
  it("fails cleanly if an unexpected runtime error occurs during processing", async () => {
    const res = await generate({
      behavior: "ok",
      advanceToNextStage: async () => {
        /* succeeds */
      },
      reviewPasses: () => {
        throw new Error("Unexpected schema mismatch or downstream validation crash");
      },
    });
    expect(res.status).toBe("error");
  });
});