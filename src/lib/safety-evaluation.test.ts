import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { dishHitsTerm } from "./matching";

type SafetyCase = {
  name: string;
  tags: string[];
  restriction: string;
  expected: boolean;
};

const cases = JSON.parse(
  readFileSync(join(process.cwd(), "evals/safety_cases.json"), "utf8")
) as SafetyCase[];

describe("deterministic restriction benchmark", () => {
  it("preserves recall while publishing conservative matcher precision", () => {
    let truePositive = 0;
    let falsePositive = 0;
    let falseNegative = 0;

    for (const testCase of cases) {
      const predicted = dishHitsTerm(testCase.name, testCase.tags, testCase.restriction);
      if (predicted && testCase.expected) truePositive += 1;
      if (predicted && !testCase.expected) falsePositive += 1;
      if (!predicted && testCase.expected) falseNegative += 1;
    }

    const precision = truePositive / (truePositive + falsePositive);
    const recall = truePositive / (truePositive + falseNegative);

    expect(cases).toHaveLength(36);
    expect(recall).toBe(1);
    expect(precision).toBeGreaterThanOrEqual(0.7);
  });
});
