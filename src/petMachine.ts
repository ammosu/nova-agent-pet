export type PetState =
  | "idle"
  | "listening"
  | "thinking"
  | "working"
  | "speaking"
  | "happy"
  | "error";

export type PetEvent =
  | { type: "USER_INPUT_STARTED" }
  | { type: "AGENT_STARTED" }
  | { type: "TOOL_STARTED" }
  | { type: "MESSAGE_READY" }
  | { type: "VOICE_STARTED" }
  | { type: "VOICE_ENDED" }
  | { type: "AGENT_FAILED" }
  | { type: "TASK_CANCELLED" }
  | { type: "PET_TAPPED" }
  | { type: "RESET" };

export const transitionPet = (_state: PetState, event: PetEvent): PetState => {
  switch (event.type) {
    case "USER_INPUT_STARTED":
      return "listening";
    case "AGENT_STARTED":
      return "thinking";
    case "TOOL_STARTED":
      return "working";
    case "MESSAGE_READY":
    case "PET_TAPPED":
      return "happy";
    case "VOICE_STARTED":
      return "speaking";
    case "AGENT_FAILED":
      return "error";
    case "TASK_CANCELLED":
    case "VOICE_ENDED":
    case "RESET":
      return "idle";
  }
};

export const petStatus: Record<PetState, { label: string; detail: string }> = {
  idle: { label: "待機中", detail: "Nova 正在觀察星圖" },
  listening: { label: "聽你說", detail: "訊號清楚，繼續吧" },
  thinking: { label: "思考中", detail: "正在整理線索" },
  working: { label: "執行中", detail: "正在呼叫 Agent 工具" },
  speaking: { label: "說話中", detail: "正在產生語音回覆" },
  happy: { label: "完成了", detail: "任務順利抵達終點" },
  error: { label: "遇到問題", detail: "再試一次就能繼續" },
};
