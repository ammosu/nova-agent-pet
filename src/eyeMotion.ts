import type { PetState } from "./petMachine";

export type EyeExpression =
  | "open"
  | "blink"
  | "half"
  | "squint"
  | "wink-left"
  | "wink-right";

export const expressiveEyeStates: readonly PetState[] = [
  "idle",
  "listening",
  "thinking",
  "working",
  "speaking",
];

type EyeMoment = {
  expression: Exclude<EyeExpression, "open">;
  delay: number;
  duration: number;
};

const expressionDurations: Record<EyeMoment["expression"], number> = {
  blink: 140,
  half: 680,
  squint: 1_050,
  "wink-left": 520,
  "wink-right": 520,
};

export const pickEyeMoment = (random: () => number = Math.random): EyeMoment => {
  const expressionRoll = random();
  let expression: EyeMoment["expression"];
  if (expressionRoll < 0.42) expression = "blink";
  else if (expressionRoll < 0.68) expression = "half";
  else if (expressionRoll < 0.82) expression = "squint";
  else if (expressionRoll < 0.91) expression = "wink-left";
  else expression = "wink-right";

  return {
    expression,
    delay: Math.round(2_800 + random() * 4_400),
    duration: expressionDurations[expression],
  };
};
