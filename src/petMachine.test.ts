import { describe, expect, it } from "vitest";
import { transitionPet } from "./petMachine";

describe("transitionPet", () => {
  it("maps the Agent lifecycle to visible pet states", () => {
    expect(transitionPet("idle", { type: "AGENT_STARTED" })).toBe("thinking");
    expect(transitionPet("thinking", { type: "TOOL_STARTED" })).toBe("working");
    expect(transitionPet("working", { type: "MESSAGE_READY" })).toBe("happy");
  });

  it("returns to idle after speech ends", () => {
    expect(transitionPet("happy", { type: "VOICE_STARTED" })).toBe("speaking");
    expect(transitionPet("speaking", { type: "VOICE_ENDED" })).toBe("idle");
  });

  it("shows a recoverable error state", () => {
    expect(transitionPet("working", { type: "AGENT_FAILED" })).toBe("error");
    expect(transitionPet("error", { type: "RESET" })).toBe("idle");
  });
});
