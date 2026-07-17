export type VoiceProvider = "azure" | "browser";

type SpeakOptions = {
  text: string;
  provider: VoiceProvider;
  azureVoice: string;
  onStart: () => void;
  onEnd: () => void;
  onFallback: () => void;
};

let activeAudio: HTMLAudioElement | null = null;

export const stopSpeaking = () => {
  window.speechSynthesis?.cancel();
  if (activeAudio) {
    activeAudio.pause();
    activeAudio.src = "";
    activeAudio = null;
  }
};

const speakWithBrowser = ({ text, onStart, onEnd }: SpeakOptions) => {
  if (!("speechSynthesis" in window)) {
    onEnd();
    return;
  }

  const utterance = new SpeechSynthesisUtterance(text);
  const voices = window.speechSynthesis.getVoices();
  const preferredVoice =
    voices.find((voice) => voice.lang.toLowerCase() === "zh-tw") ??
    voices.find((voice) => voice.lang.toLowerCase().startsWith("zh"));

  utterance.lang = "zh-TW";
  utterance.voice = preferredVoice ?? null;
  utterance.rate = 1.04;
  utterance.pitch = 1.08;
  utterance.onstart = onStart;
  utterance.onend = onEnd;
  utterance.onerror = onEnd;
  window.speechSynthesis.cancel();
  window.speechSynthesis.speak(utterance);
};

export const speak = async (options: SpeakOptions) => {
  stopSpeaking();

  if (options.provider === "browser") {
    speakWithBrowser(options);
    return;
  }

  try {
    const response = await fetch("/api/tts", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ text: options.text, voice: options.azureVoice }),
    });

    if (!response.ok) {
      throw new Error("Cloud voice unavailable");
    }

    const url = URL.createObjectURL(await response.blob());
    activeAudio = new Audio(url);
    activeAudio.onplay = options.onStart;
    activeAudio.onended = () => {
      URL.revokeObjectURL(url);
      activeAudio = null;
      options.onEnd();
    };
    activeAudio.onerror = () => {
      URL.revokeObjectURL(url);
      activeAudio = null;
      options.onFallback();
      speakWithBrowser(options);
    };
    await activeAudio.play();
  } catch {
    options.onFallback();
    speakWithBrowser(options);
  }
};
