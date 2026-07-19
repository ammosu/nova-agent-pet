import { describe, expect, it } from "vitest";
import {
  expressiveEyeStates,
  pickEyeMoment,
  type EyeExpression,
} from "./eyeMotion";

describe("eye micro-expression scheduler", () => {
  it("enables micro-expressions in every non-terminal agent state", () => {
    expect([...expressiveEyeStates]).toEqual([
      "idle",
      "listening",
      "thinking",
      "working",
      "speaking",
    ]);
  });

  it.each<[number, EyeExpression]>([
    [0.1, "blink"],
    [0.55, "half"],
    [0.75, "squint"],
    [0.86, "wink-left"],
    [0.95, "wink-right"],
  ])("maps a random roll of %s to %s", (roll, expression) => {
    const randomValues = [roll, 0.5];
    const moment = pickEyeMoment(() => randomValues.shift() ?? 0);

    expect(moment.expression).toBe(expression);
  });

  it("keeps random eye moments occasional and brief", () => {
    const earliest = pickEyeMoment(() => 0);
    const latest = pickEyeMoment(() => 0.999);

    expect(earliest.delay).toBeGreaterThanOrEqual(2_800);
    expect(latest.delay).toBeLessThanOrEqual(7_200);
    expect(earliest.duration).toBeGreaterThanOrEqual(140);
    expect(latest.duration).toBeLessThanOrEqual(1_050);
  });
});
