import {
  FormEvent,
  PointerEvent as ReactPointerEvent,
  useEffect,
  useRef,
  useState,
} from "react";
import {
  expressiveEyeStates,
  pickEyeMoment,
  type EyeExpression,
} from "./eyeMotion";
import { petStatus, PetState, transitionPet } from "./petMachine";
import { speak, stopSpeaking, VoiceProvider } from "./voice";

type Message = {
  id: number;
  role: "user" | "assistant";
  text: string;
  time: string;
};

type Facing = "left" | "center" | "right";
type PetAction = "wave" | "stretch" | "dance" | "doze";
type ActiveAction = { name: PetAction; run: number };

const sleep = (duration: number, signal: AbortSignal) =>
  new Promise<void>((resolve, reject) => {
    const timer = window.setTimeout(() => {
      signal.removeEventListener("abort", handleAbort);
      resolve();
    }, duration);
    const handleAbort = () => {
      window.clearTimeout(timer);
      reject(new DOMException("Task cancelled", "AbortError"));
    };

    signal.addEventListener("abort", handleAbort, { once: true });
  });

const isAbortError = (error: unknown) =>
  error instanceof DOMException && error.name === "AbortError";

const createReply = (input: string) => {
  if (/天氣|下雨/.test(input)) {
    return "我可以替你接上天氣工具。基礎版先示範工具執行狀態：我會在查詢時切換成工作動畫，拿到結果後再用語音告訴你。";
  }
  if (/語音|說話|聲音/.test(input)) {
    return "語音層已經獨立出來了。現在會優先使用台灣中文雲端語音，沒有設定金鑰時，就自動改用瀏覽器內建聲音。";
  }
  if (/功能|可以做什麼/.test(input)) {
    return "我會跟著 Agent 一起思考、工作和說話。下一步還能加入親密度、主動提醒、換裝，以及真正的即時語音對話。";
  }
  return `收到「${input}」。這次是基礎 Agent 模擬；接到你的正式後端後，我會把同一套狀態與語音反應套在真實回覆上。`;
};

const stateOrder: PetState[] = [
  "idle",
  "listening",
  "thinking",
  "working",
  "speaking",
  "happy",
  "error",
];

const actionOrder: PetAction[] = ["wave", "stretch", "dance", "doze"];

const actionStatus: Record<
  PetAction,
  { label: string; buttonLabel: string; detail: string; duration: number }
> = {
  wave: {
    label: "向你招手",
    buttonLabel: "招手",
    detail: "收到你的觀測訊號",
    duration: 2_400,
  },
  stretch: {
    label: "伸展中",
    buttonLabel: "伸展",
    detail: "舒展一下星際斗篷",
    duration: 2_500,
  },
  dance: {
    label: "星光舞",
    buttonLabel: "星光舞",
    detail: "跟著軌道節拍轉動",
    duration: 3_200,
  },
  doze: {
    label: "打瞌睡",
    buttonLabel: "瞌睡",
    detail: "進入短暫星眠模式",
    duration: 3_600,
  },
};

const facingOrder: Facing[] = ["left", "center", "right"];

const stateFacing: Record<Exclude<PetState, "idle">, Facing> = {
  listening: "left",
  thinking: "right",
  working: "right",
  speaking: "center",
  happy: "center",
  error: "left",
};

function App() {
  const [messages, setMessages] = useState<Message[]>([
    {
      id: 1,
      role: "assistant",
      text: "嗨，我是 Nova。問我一個問題，看看我在 Agent 工作時會有什麼反應。",
      time: "剛剛",
    },
  ]);
  const [input, setInput] = useState("");
  const [petState, setPetState] = useState<PetState>("idle");
  const [isBusy, setIsBusy] = useState(false);
  const [muted, setMuted] = useState(() => localStorage.getItem("nova-muted") === "true");
  const [voiceProvider, setVoiceProvider] = useState<VoiceProvider>("browser");
  const [cloudReady, setCloudReady] = useState(false);
  const [voiceNotice, setVoiceNotice] = useState("");
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [facing, setFacing] = useState<Facing>("right");
  const [lastFailedInput, setLastFailedInput] = useState("");
  const [activeAction, setActiveAction] = useState<ActiveAction | null>(null);
  const [eyeExpression, setEyeExpression] = useState<EyeExpression>("open");
  const transcriptRef = useRef<HTMLDivElement>(null);
  const previewTimerRef = useRef<number | null>(null);
  const actionTimerRef = useRef<number | null>(null);
  const actionRunRef = useRef(0);
  const activeTaskRef = useRef<AbortController | null>(null);
  const demoFailuresRef = useRef(new Set<string>());
  const eyeMotionEnabled =
    !activeAction && expressiveEyeStates.includes(petState);

  useEffect(() => {
    fetch("/api/voice-status")
      .then((response) => response.json())
      .then((status) => {
        setCloudReady(Boolean(status.cloudReady));
        setVoiceProvider(status.cloudReady ? "azure" : "browser");
      })
      .catch(() => setVoiceProvider("browser"));
  }, []);

  useEffect(() => {
    transcriptRef.current?.scrollTo({
      top: transcriptRef.current.scrollHeight,
      behavior: "smooth",
    });
  }, [messages]);

  useEffect(() => {
    localStorage.setItem("nova-muted", String(muted));
    if (muted) {
      stopSpeaking();
      setPetState("idle");
    }
  }, [muted]);

  useEffect(() => {
    if (activeAction) return;

    if (petState !== "idle") {
      setFacing(stateFacing[petState]);
      return;
    }

    const directionTimer = window.setTimeout(() => {
      setFacing((current) => {
        const nextDirections = facingOrder.filter((direction) => direction !== current);
        return nextDirections[Math.floor(Math.random() * nextDirections.length)];
      });
    }, 3_200 + Math.random() * 3_400);

    return () => window.clearTimeout(directionTimer);
  }, [activeAction, petState, facing]);

  useEffect(() => {
    setEyeExpression("open");

    if (!eyeMotionEnabled) return;

    const motionPreference = window.matchMedia("(prefers-reduced-motion: reduce)");
    let expressionTimer: number | null = null;
    let resetTimer: number | null = null;

    const clearTimers = () => {
      if (expressionTimer !== null) window.clearTimeout(expressionTimer);
      if (resetTimer !== null) window.clearTimeout(resetTimer);
      expressionTimer = null;
      resetTimer = null;
    };

    const scheduleExpression = () => {
      const moment = pickEyeMoment();
      expressionTimer = window.setTimeout(() => {
        setEyeExpression(moment.expression);
        resetTimer = window.setTimeout(() => {
          setEyeExpression("open");
          scheduleExpression();
        }, moment.duration);
      }, moment.delay);
    };

    const handleMotionPreference = () => {
      clearTimers();
      setEyeExpression("open");
      if (!motionPreference.matches) scheduleExpression();
    };

    if (!motionPreference.matches) scheduleExpression();
    motionPreference.addEventListener("change", handleMotionPreference);

    return () => {
      motionPreference.removeEventListener("change", handleMotionPreference);
      clearTimers();
    };
  }, [eyeMotionEnabled]);

  useEffect(
    () => () => {
      activeTaskRef.current?.abort();
      stopSpeaking();
      if (previewTimerRef.current) window.clearTimeout(previewTimerRef.current);
      if (actionTimerRef.current) window.clearTimeout(actionTimerRef.current);
    },
    [],
  );

  const clearVisualPreview = () => {
    if (previewTimerRef.current) {
      window.clearTimeout(previewTimerRef.current);
      previewTimerRef.current = null;
    }
    if (actionTimerRef.current) {
      window.clearTimeout(actionTimerRef.current);
      actionTimerRef.current = null;
    }
    setActiveAction(null);
  };

  const previewMotion = (state: PetState) => {
    if (isBusy) return;
    stopSpeaking();
    clearVisualPreview();
    setPetState(state);

    if (state !== "idle") {
      const duration = state === "speaking" ? 3_600 : 2_500;
      previewTimerRef.current = window.setTimeout(() => {
        setPetState("idle");
        previewTimerRef.current = null;
      }, duration);
    }
  };

  const previewAction = (action: PetAction) => {
    if (isBusy) return;
    stopSpeaking();
    clearVisualPreview();
    setPetState("idle");
    setFacing("center");

    const nextAction = { name: action, run: actionRunRef.current + 1 };
    actionRunRef.current = nextAction.run;
    setActiveAction(nextAction);
    actionTimerRef.current = window.setTimeout(() => {
      setActiveAction(null);
      actionTimerRef.current = null;
    }, actionStatus[action].duration);
  };

  const runAgentTask = async (cleanInput: string) => {
    if (!cleanInput || activeTaskRef.current) return;

    const controller = new AbortController();
    activeTaskRef.current = controller;
    clearVisualPreview();
    setIsBusy(true);
    setLastFailedInput("");
    setVoiceNotice("");
    stopSpeaking();
    setMessages((current) => [
      ...current,
      { id: Date.now(), role: "user", text: cleanInput, time: "現在" },
    ]);
    setPetState((state) => transitionPet(state, { type: "AGENT_STARTED" }));

    try {
      await sleep(650, controller.signal);
      setPetState((state) => transitionPet(state, { type: "TOOL_STARTED" }));
      await sleep(900, controller.signal);

      if (cleanInput === "測試錯誤" && !demoFailuresRef.current.has(cleanInput)) {
        demoFailuresRef.current.add(cleanInput);
        throw new Error("Demo error");
      }

      const reply = createReply(cleanInput);
      setMessages((current) => [
        ...current,
        { id: Date.now() + 1, role: "assistant", text: reply, time: "現在" },
      ]);
      setPetState((state) => transitionPet(state, { type: "MESSAGE_READY" }));
      setIsBusy(false);
      activeTaskRef.current = null;

      if (!muted) {
        await speak({
          text: reply,
          provider: voiceProvider,
          azureVoice: "zh-TW-HsiaoChenNeural",
          onStart: () =>
            setPetState((state) => transitionPet(state, { type: "VOICE_STARTED" })),
          onEnd: () =>
            setPetState((state) => transitionPet(state, { type: "VOICE_ENDED" })),
          onFallback: () => {
            setVoiceProvider("browser");
            setVoiceNotice("雲端語音無法使用，已切換為裝置語音。 ");
          },
        });
      } else {
        window.setTimeout(
          () => setPetState((state) => transitionPet(state, { type: "RESET" })),
          1_200,
        );
      }
    } catch (error) {
      if (isAbortError(error)) return;

      setMessages((current) => [
        ...current,
        {
          id: Date.now() + 1,
          role: "assistant",
          text: "這次示範遇到錯誤了。可以按「再試一次」，或輸入其他內容繼續。",
          time: "現在",
        },
      ]);
      setLastFailedInput(cleanInput);
      setPetState((state) => transitionPet(state, { type: "AGENT_FAILED" }));
      setIsBusy(false);
      activeTaskRef.current = null;
    }
  };

  const sendMessage = (event: FormEvent) => {
    event.preventDefault();
    const cleanInput = input.trim();
    if (!cleanInput || isBusy) return;

    setInput("");
    void runAgentTask(cleanInput);
  };

  const cancelTask = () => {
    const activeTask = activeTaskRef.current;
    if (!activeTask) return;

    activeTaskRef.current = null;
    activeTask.abort();
    stopSpeaking();
    setIsBusy(false);
    setMessages((current) => [
      ...current,
      {
        id: Date.now() + 1,
        role: "assistant",
        text: "已停止這次任務。準備好時，我們可以換個方向再試。",
        time: "現在",
      },
    ]);
    setPetState((state) => transitionPet(state, { type: "TASK_CANCELLED" }));
  };

  const tapPet = () => {
    if (isBusy || petState === "speaking") return;
    previewMotion("happy");
  };

  const moveHabitat = (event: ReactPointerEvent<HTMLElement>) => {
    if (
      event.pointerType === "touch" ||
      window.matchMedia("(prefers-reduced-motion: reduce)").matches
    ) {
      return;
    }

    const bounds = event.currentTarget.getBoundingClientRect();
    const horizontal = (event.clientX - bounds.left) / bounds.width - 0.5;
    const vertical = (event.clientY - bounds.top) / bounds.height - 0.5;

    event.currentTarget.style.setProperty("--pet-x", `${horizontal * 10}px`);
    event.currentTarget.style.setProperty("--pet-y", `${vertical * 7}px`);
    event.currentTarget.style.setProperty("--orbit-x", `${horizontal * -15}px`);
    event.currentTarget.style.setProperty("--orbit-y", `${vertical * -11}px`);
    event.currentTarget.style.setProperty("--drift-x", `${horizontal * 22}px`);
    event.currentTarget.style.setProperty("--drift-y", `${vertical * 16}px`);
    event.currentTarget.style.setProperty("--eye-focus-x", `${horizontal * 4.2}px`);
    event.currentTarget.style.setProperty("--eye-focus-y", `${vertical * 2.8}px`);
  };

  const resetHabitat = (event: ReactPointerEvent<HTMLElement>) => {
    event.currentTarget.style.setProperty("--pet-x", "0px");
    event.currentTarget.style.setProperty("--pet-y", "0px");
    event.currentTarget.style.setProperty("--orbit-x", "0px");
    event.currentTarget.style.setProperty("--orbit-y", "0px");
    event.currentTarget.style.setProperty("--drift-x", "0px");
    event.currentTarget.style.setProperty("--drift-y", "0px");
    event.currentTarget.style.setProperty("--eye-focus-x", "0px");
    event.currentTarget.style.setProperty("--eye-focus-y", "0px");
  };

  const displayedStatus = activeAction
    ? actionStatus[activeAction.name]
    : petStatus[petState];
  const displayedIndex = activeAction
    ? `A${actionOrder.indexOf(activeAction.name) + 1}`
    : String(stateOrder.indexOf(petState) + 1).padStart(2, "0");

  return (
    <main className="app-shell">
      <header className="topbar">
        <div className="brand-lockup">
          <div className="brand-mark" aria-hidden="true">✦</div>
          <div>
            <p className="eyebrow">Agent companion / prototype 0.8</p>
            <h1>Nova 的觀測站</h1>
          </div>
        </div>
        <div className="header-actions">
          <span className={`voice-badge ${cloudReady ? "is-cloud" : ""}`}>
            <span className="status-dot" />
            {cloudReady ? "Azure 台灣中文" : "裝置語音"}
          </span>
          <button
            className="icon-button"
            type="button"
            aria-label={muted ? "開啟語音" : "關閉語音"}
            onClick={() => setMuted((value) => !value)}
          >
            {muted ? "靜音" : "有聲"}
          </button>
          <button
            className="icon-button"
            type="button"
            aria-expanded={settingsOpen}
            onClick={() => setSettingsOpen((value) => !value)}
          >
            設定
          </button>
        </div>
      </header>

      <section className="workspace">
        <section className="conversation-panel" aria-label="Agent 對話">
          <div className="panel-heading">
            <div>
              <p className="eyebrow">Live channel</p>
              <h2>和 Agent 一起工作</h2>
            </div>
            <span className={`connection-label ${isBusy ? "is-active" : ""}`}>
              <span />{isBusy ? petStatus[petState].label : "原型模式"}
            </span>
          </div>

          <div className="transcript" ref={transcriptRef} aria-live="polite">
            {messages.map((message) => (
              <article className={`message ${message.role}`} key={message.id}>
                <div className="message-meta">
                  <span>{message.role === "assistant" ? "Nova" : "你"}</span>
                  <time>{message.time}</time>
                </div>
                <p>{message.text}</p>
              </article>
            ))}
            {isBusy && (
              <article className="message assistant is-pending">
                <div className="message-meta">
                  <span>Nova</span><span>{petStatus[petState].label}</span>
                </div>
                <div className="typing-dots" aria-label="Nova 正在輸入">
                  <span /><span /><span />
                </div>
              </article>
            )}
          </div>

          <div className="quick-prompts" aria-label="建議問題">
            {["你可以做什麼？", "語音怎麼運作？", "幫我查天氣"].map((prompt) => (
              <button key={prompt} type="button" onClick={() => setInput(prompt)}>
                {prompt}
              </button>
            ))}
          </div>

          <form className="composer" onSubmit={sendMessage}>
            <label className="sr-only" htmlFor="agent-input">輸入給 Agent 的訊息</label>
            <textarea
              id="agent-input"
              rows={1}
              placeholder="交給 Nova 一件事…"
              value={input}
              disabled={isBusy}
              onFocus={() => {
                if (isBusy) return;
                clearVisualPreview();
                setPetState("listening");
              }}
              onBlur={() => !input && petState === "listening" && setPetState("idle")}
              onChange={(event) => setInput(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === "Enter" && !event.shiftKey) {
                  event.preventDefault();
                  event.currentTarget.form?.requestSubmit();
                }
              }}
            />
            {isBusy ? (
              <button
                className="send-button cancel-button"
                type="button"
                aria-label="停止目前任務"
                onClick={cancelTask}
              >
                <span>停止</span><span aria-hidden="true">■</span>
              </button>
            ) : (
              <button
                className="send-button"
                type="submit"
                aria-label="送出訊息"
                disabled={!input.trim()}
              >
                <span>送出</span><span aria-hidden="true">↗</span>
              </button>
            )}
          </form>
          {lastFailedInput && !isBusy && (
            <div className="recovery-banner" role="status">
              <span>上次任務沒有完成</span>
              <button type="button" onClick={() => void runAgentTask(lastFailedInput)}>
                再試一次
              </button>
            </div>
          )}
          {voiceNotice && <p className="voice-notice">{voiceNotice}</p>}
        </section>

        <aside
          className={`habitat state-${petState}${activeAction ? ` action-${activeAction.name}` : ""}`}
          aria-label="Nova 寵物狀態"
          onPointerMove={moveHabitat}
          onPointerLeave={resetHabitat}
        >
          <div className="habitat-grid" aria-hidden="true" />
          <div className="cosmic-drift" aria-hidden="true">
            <i /><i /><i /><i /><i /><i /><i /><i /><i /><i />
          </div>
          <div className="orbit orbit-one" aria-hidden="true" />
          <div className="orbit orbit-two" aria-hidden="true" />
          <div className="state-readout">
            <span className="state-index">{displayedIndex}</span>
            <div>
              <p>{displayedStatus.label}</p>
              <span>{displayedStatus.detail}</span>
            </div>
          </div>

          <button className="pet-stage" type="button" onClick={tapPet} aria-label="摸摸 Nova">
            <span className="pet-shadow" aria-hidden="true" />
            <span
              className="state-pulse"
              aria-hidden="true"
              key={activeAction ? `action-${activeAction.run}` : petState}
            />
            <span className="pet-glow" aria-hidden="true" />
            <span className="thought-dots" aria-hidden="true"><i /><i /><i /></span>
            <span className="signal-ring signal-left" aria-hidden="true" />
            <span className="signal-ring signal-right" aria-hidden="true" />
            <span className="scan-beam" aria-hidden="true" />
            <span className="spark-field" aria-hidden="true">
              <i /><i /><i /><i /><i /><i />
            </span>
            <span className="sleep-notes" aria-hidden="true">
              <i>Z</i><i>Z</i><i>Z</i>
            </span>
            <span className={`pet-direction facing-${facing}`}>
              <span
                className="pet-sprite-stack"
                key={activeAction ? `action-${activeAction.run}` : "state"}
              >
                <img
                  className="pet-sprite rig-tail"
                  src="/assets/nova-pet-tail.png"
                  alt=""
                  aria-hidden="true"
                />
                <img
                  className="pet-sprite rig-ear rig-ear-left"
                  src="/assets/nova-pet-ear-left.png"
                  alt=""
                  aria-hidden="true"
                />
                <img
                  className="pet-sprite rig-ear rig-ear-right"
                  src="/assets/nova-pet-ear-right.png"
                  alt=""
                  aria-hidden="true"
                />
                <img
                  className="pet-sprite rig-cloth rig-cloak rig-cloak-left"
                  src="/assets/nova-pet-cloak-back-left.png"
                  alt=""
                  aria-hidden="true"
                />
                <img
                  className="pet-sprite rig-cloth rig-cloak rig-cloak-right"
                  src="/assets/nova-pet-cloak-back-right.png"
                  alt=""
                  aria-hidden="true"
                />
                <img
                  className="pet-sprite pet-base rig-body"
                  src="/assets/nova-pet-undercoat-base.png"
                  alt="紫藍色的星際狐狸貓 Nova"
                />
                <img
                  className="pet-sprite rig-robe rig-robe-front"
                  src="/assets/nova-pet-robe-front.png"
                  alt=""
                  aria-hidden="true"
                />
                <img
                  className="pet-sprite rig-collar rig-collar-front"
                  src="/assets/nova-pet-collar-front.png"
                  alt=""
                  aria-hidden="true"
                />
                <img
                  className="pet-sprite rig-cloth rig-pendant"
                  src="/assets/nova-pet-pendant.png"
                  alt=""
                  aria-hidden="true"
                />
                <img
                  className="pet-sprite rig-arm rig-arm-closed rig-arm-left"
                  src="/assets/nova-pet-hand-left.png"
                  alt=""
                  aria-hidden="true"
                />
                <img
                  className="pet-sprite rig-arm rig-arm-closed rig-arm-right"
                  src="/assets/nova-pet-hand-right.png"
                  alt=""
                  aria-hidden="true"
                />
                <img
                  className="pet-sprite rig-arm rig-arm-open rig-arm-left"
                  src="/assets/nova-pet-hand-open-left.png"
                  alt=""
                  aria-hidden="true"
                />
                <img
                  className="pet-sprite rig-arm rig-arm-open rig-arm-right"
                  src="/assets/nova-pet-hand-open-right.png"
                  alt=""
                  aria-hidden="true"
                />
                <span
                  className={`rig-eyes-direction eye-${eyeExpression}`}
                  aria-hidden="true"
                >
                  <span className="rig-open-eyes">
                    <img
                      className="pet-sprite rig-eye rig-eye-left"
                      src="/assets/nova-pet-eye-left.png"
                      alt=""
                    />
                    <img
                      className="pet-sprite rig-eye rig-eye-right"
                      src="/assets/nova-pet-eye-right.png"
                      alt=""
                    />
                    <img
                      className="pet-sprite rig-eye-detail rig-eye-detail-left rig-eye-depth"
                      src="/assets/nova-pet-eye-depth-left.png"
                      alt=""
                    />
                    <img
                      className="pet-sprite rig-eye-detail rig-eye-detail-right rig-eye-depth"
                      src="/assets/nova-pet-eye-depth-right.png"
                      alt=""
                    />
                    <img
                      className="pet-sprite rig-eye-detail rig-eye-detail-left rig-eye-pupil"
                      src="/assets/nova-pet-eye-pupil-left.png"
                      alt=""
                    />
                    <img
                      className="pet-sprite rig-eye-detail rig-eye-detail-right rig-eye-pupil"
                      src="/assets/nova-pet-eye-pupil-right.png"
                      alt=""
                    />
                    <img
                      className="pet-sprite rig-eye-detail rig-eye-detail-left rig-eye-glint"
                      src="/assets/nova-pet-eye-glint-left.png"
                      alt=""
                    />
                    <img
                      className="pet-sprite rig-eye-detail rig-eye-detail-right rig-eye-glint"
                      src="/assets/nova-pet-eye-glint-right.png"
                      alt=""
                    />
                  </span>
                  <img
                    className="pet-sprite pet-face pet-blink"
                    src="/assets/nova-pet-blink-eyes.png"
                    alt=""
                  />
                  <img
                    className="pet-sprite pet-face pet-eye-expression pet-eye-half"
                    src="/assets/nova-pet-half-eyes.png"
                    alt=""
                  />
                  <img
                    className="pet-sprite pet-face pet-eye-expression pet-eye-squint"
                    src="/assets/nova-pet-squint-eyes.png"
                    alt=""
                  />
                  <img
                    className="pet-sprite pet-face pet-eye-expression pet-wink-left"
                    src="/assets/nova-pet-blink-left.png"
                    alt=""
                  />
                  <img
                    className="pet-sprite pet-face pet-eye-expression pet-wink-right"
                    src="/assets/nova-pet-blink-right.png"
                    alt=""
                  />
                </span>
                <img
                  className="pet-sprite rig-antenna"
                  src="/assets/nova-pet-antenna-alpha.png"
                  alt=""
                  aria-hidden="true"
                />
                <img
                  className="pet-sprite rig-mouth-idle"
                  src="/assets/nova-pet-idle-mouth.png"
                  alt=""
                  aria-hidden="true"
                />
                <img
                  className="pet-sprite pet-face pet-speaking"
                  src="/assets/nova-pet-speaking-mouth.png"
                  alt=""
                  aria-hidden="true"
                />
                <img
                  className="pet-sprite pet-face pet-happy"
                  src="/assets/nova-pet-happy-expression.png"
                  alt=""
                  aria-hidden="true"
                />
              </span>
            </span>
            <span className="voice-wave" aria-hidden="true">
              <i /><i /><i /><i /><i />
            </span>
          </button>

          <div className="motion-lab" aria-label="動畫與動作試播">
            <div className="motion-row">
              <span>State</span>
              <div>
                {stateOrder.map((state) => (
                  <button
                    type="button"
                    key={state}
                    disabled={isBusy}
                    className={!activeAction && state === petState ? "active" : ""}
                    aria-pressed={!activeAction && state === petState}
                    onClick={() => previewMotion(state)}
                  >
                    {petStatus[state].label.replace("中", "")}
                  </button>
                ))}
              </div>
            </div>
            <div className="motion-row action-row">
              <span>Action</span>
              <div>
                {actionOrder.map((action) => (
                  <button
                    type="button"
                    key={action}
                    disabled={isBusy}
                    className={activeAction?.name === action ? "active" : ""}
                    aria-pressed={activeAction?.name === action}
                    onClick={() => previewAction(action)}
                  >
                    {actionStatus[action].buttonLabel}
                  </button>
                ))}
              </div>
            </div>
          </div>

          <div className="habitat-footer">
            <p>Nova 會自然換方向；也可以點牠或試播動作。</p>
            <div className="state-track" aria-hidden="true">
              {stateOrder.map((state) => (
                <span className={state === petState ? "active" : ""} key={state} />
              ))}
            </div>
          </div>

          {settingsOpen && (
            <section className="settings-popover" aria-label="語音設定">
              <div>
                <p className="eyebrow">Voice route</p>
                <h3>語音來源</h3>
              </div>
              <label>
                <input
                  type="radio"
                  name="voice-provider"
                  checked={voiceProvider === "browser"}
                  onChange={() => setVoiceProvider("browser")}
                />
                <span><strong>裝置語音</strong><small>免金鑰，品質依作業系統而異</small></span>
              </label>
              <label className={!cloudReady ? "is-disabled" : ""}>
                <input
                  type="radio"
                  name="voice-provider"
                  checked={voiceProvider === "azure"}
                  disabled={!cloudReady}
                  onChange={() => setVoiceProvider("azure")}
                />
                <span><strong>Azure zh-TW</strong><small>{cloudReady ? "原生台灣中文聲線" : "需設定伺服器金鑰"}</small></span>
              </label>
            </section>
          )}
        </aside>
      </section>
    </main>
  );
}

export default App;
