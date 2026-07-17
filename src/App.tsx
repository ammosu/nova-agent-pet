import { FormEvent, useEffect, useRef, useState } from "react";
import { petStatus, PetState, transitionPet } from "./petMachine";
import { speak, stopSpeaking, VoiceProvider } from "./voice";

type Message = {
  id: number;
  role: "user" | "assistant";
  text: string;
  time: string;
};

type Facing = "left" | "center" | "right";

const sleep = (duration: number) => new Promise((resolve) => setTimeout(resolve, duration));

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
  const transcriptRef = useRef<HTMLDivElement>(null);
  const previewTimerRef = useRef<number | null>(null);

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
  }, [petState, facing]);

  useEffect(
    () => () => {
      stopSpeaking();
      if (previewTimerRef.current) window.clearTimeout(previewTimerRef.current);
    },
    [],
  );

  const previewMotion = (state: PetState) => {
    if (isBusy) return;
    stopSpeaking();
    if (previewTimerRef.current) window.clearTimeout(previewTimerRef.current);
    setPetState(state);

    if (state !== "idle") {
      const duration = state === "speaking" ? 3_600 : 2_500;
      previewTimerRef.current = window.setTimeout(() => {
        setPetState("idle");
        previewTimerRef.current = null;
      }, duration);
    }
  };

  const sendMessage = async (event: FormEvent) => {
    event.preventDefault();
    const cleanInput = input.trim();
    if (!cleanInput || isBusy) return;

    setInput("");
    setIsBusy(true);
    setVoiceNotice("");
    stopSpeaking();
    setMessages((current) => [
      ...current,
      { id: Date.now(), role: "user", text: cleanInput, time: "現在" },
    ]);
    setPetState((state) => transitionPet(state, { type: "AGENT_STARTED" }));

    try {
      await sleep(650);
      setPetState((state) => transitionPet(state, { type: "TOOL_STARTED" }));
      await sleep(900);

      if (cleanInput === "測試錯誤") {
        throw new Error("Demo error");
      }

      const reply = createReply(cleanInput);
      setMessages((current) => [
        ...current,
        { id: Date.now() + 1, role: "assistant", text: reply, time: "現在" },
      ]);
      setPetState((state) => transitionPet(state, { type: "MESSAGE_READY" }));
      setIsBusy(false);

      if (!muted) {
        await speak({
          text: reply,
          provider: voiceProvider,
          azureVoice: "zh-TW-HsiaoChenNeural",
          onStart: () => setPetState("speaking"),
          onEnd: () => setPetState("idle"),
          onFallback: () => {
            setVoiceProvider("browser");
            setVoiceNotice("雲端語音無法使用，已切換為裝置語音。 ");
          },
        });
      } else {
        window.setTimeout(() => setPetState("idle"), 1_200);
      }
    } catch {
      setMessages((current) => [
        ...current,
        {
          id: Date.now() + 1,
          role: "assistant",
          text: "這次示範遇到錯誤了。輸入其他內容就能重新開始。",
          time: "現在",
        },
      ]);
      setPetState("error");
      setIsBusy(false);
    }
  };

  const tapPet = () => {
    if (isBusy || petState === "speaking") return;
    previewMotion("happy");
  };

  return (
    <main className="app-shell">
      <header className="topbar">
        <div className="brand-lockup">
          <div className="brand-mark" aria-hidden="true">✦</div>
          <div>
            <p className="eyebrow">Agent companion / prototype 0.4</p>
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
            <span className="connection-label"><span />已連線</span>
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
                <div className="message-meta"><span>Nova</span><span>處理中</span></div>
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
              onFocus={() => !isBusy && setPetState("listening")}
              onBlur={() => !input && petState === "listening" && setPetState("idle")}
              onChange={(event) => setInput(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === "Enter" && !event.shiftKey) {
                  event.preventDefault();
                  event.currentTarget.form?.requestSubmit();
                }
              }}
            />
            <button className="send-button" type="submit" disabled={!input.trim() || isBusy}>
              <span>送出</span><span aria-hidden="true">↗</span>
            </button>
          </form>
          {voiceNotice && <p className="voice-notice">{voiceNotice}</p>}
        </section>

        <aside className={`habitat state-${petState}`} aria-label="Nova 寵物狀態">
          <div className="habitat-grid" aria-hidden="true" />
          <div className="orbit orbit-one" aria-hidden="true" />
          <div className="orbit orbit-two" aria-hidden="true" />
          <div className="state-readout">
            <span className="state-index">
              {String(stateOrder.indexOf(petState) + 1).padStart(2, "0")}
            </span>
            <div>
              <p>{petStatus[petState].label}</p>
              <span>{petStatus[petState].detail}</span>
            </div>
          </div>

          <button className="pet-stage" type="button" onClick={tapPet} aria-label="摸摸 Nova">
            <span className="pet-glow" aria-hidden="true" />
            <span className="thought-dots" aria-hidden="true"><i /><i /><i /></span>
            <span className="signal-ring signal-left" aria-hidden="true" />
            <span className="signal-ring signal-right" aria-hidden="true" />
            <span className="scan-beam" aria-hidden="true" />
            <span className="spark-field" aria-hidden="true">
              <i /><i /><i /><i /><i /><i />
            </span>
            <span className={`pet-direction facing-${facing}`}>
              <span className="pet-sprite-stack">
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
                  className="pet-sprite pet-base rig-body"
                  src="/assets/nova-pet-attention-base-mouthless.png"
                  alt="紫藍色的星際狐狸貓 Nova"
                />
                <img
                  className="pet-sprite rig-arm rig-arm-left"
                  src="/assets/nova-pet-hand-left.png"
                  alt=""
                  aria-hidden="true"
                />
                <img
                  className="pet-sprite rig-arm rig-arm-right"
                  src="/assets/nova-pet-hand-right.png"
                  alt=""
                  aria-hidden="true"
                />
                <img
                  className="pet-sprite rig-eye rig-eye-left"
                  src="/assets/nova-pet-eye-left.png"
                  alt=""
                  aria-hidden="true"
                />
                <img
                  className="pet-sprite rig-eye rig-eye-right"
                  src="/assets/nova-pet-eye-right.png"
                  alt=""
                  aria-hidden="true"
                />
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
                  className="pet-sprite pet-face pet-blink"
                  src="/assets/nova-pet-blink-eyes.png"
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

          <div className="motion-lab" aria-label="動畫試播">
            <span>Motion</span>
            <div>
              {stateOrder.map((state) => (
                <button
                  type="button"
                  key={state}
                  disabled={isBusy}
                  className={state === petState ? "active" : ""}
                  aria-pressed={state === petState}
                  onClick={() => previewMotion(state)}
                >
                  {petStatus[state].label.replace("中", "")}
                </button>
              ))}
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
