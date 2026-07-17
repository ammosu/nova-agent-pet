import express from "express";
import { createServer as createViteServer } from "vite";

const app = express();
const port = Number(process.env.PORT || 5173);

app.use(express.json({ limit: "32kb" }));

const azureVoiceNames = new Set([
  "zh-TW-HsiaoChenNeural",
  "zh-TW-HsiaoYuNeural",
  "zh-TW-YunJheNeural",
]);

const escapeXml = (value) =>
  value.replace(/[<>&'\"]/g, (character) => {
    const entities = {
      "<": "&lt;",
      ">": "&gt;",
      "&": "&amp;",
      "'": "&apos;",
      '\"': "&quot;",
    };
    return entities[character];
  });

app.get("/api/voice-status", (_request, response) => {
  response.json({
    provider: process.env.AZURE_SPEECH_KEY ? "azure" : "browser",
    cloudReady: Boolean(
      process.env.AZURE_SPEECH_KEY && process.env.AZURE_SPEECH_REGION,
    ),
  });
});

app.post("/api/tts", async (request, response) => {
  const key = process.env.AZURE_SPEECH_KEY;
  const region = process.env.AZURE_SPEECH_REGION;

  if (!key || !region) {
    return response.status(503).json({
      code: "voice_not_configured",
      message: "Azure Speech 尚未設定，請改用瀏覽器語音。",
    });
  }

  const text = typeof request.body?.text === "string" ? request.body.text.trim() : "";
  const requestedVoice = request.body?.voice;
  const voice = azureVoiceNames.has(requestedVoice)
    ? requestedVoice
    : "zh-TW-HsiaoChenNeural";

  if (!text || text.length > 2_000) {
    return response.status(400).json({
      code: "invalid_text",
      message: "語音文字必須介於 1 到 2,000 個字元。",
    });
  }

  const ssml = [
    '<speak version="1.0" xmlns="http://www.w3.org/2001/10/synthesis" xml:lang="zh-TW">',
    `<voice name="${voice}">`,
    '<prosody rate="+4%" pitch="+2%">',
    escapeXml(text),
    "</prosody>",
    "</voice>",
    "</speak>",
  ].join("");

  try {
    const upstream = await fetch(
      `https://${region}.tts.speech.microsoft.com/cognitiveservices/v1`,
      {
        method: "POST",
        headers: {
          "Ocp-Apim-Subscription-Key": key,
          "Content-Type": "application/ssml+xml",
          "X-Microsoft-OutputFormat": "audio-24khz-96kbitrate-mono-mp3",
          "User-Agent": "nova-agent-pet",
        },
        body: ssml,
      },
    );

    if (!upstream.ok) {
      const detail = await upstream.text();
      console.error("Azure Speech request failed", upstream.status, detail);
      return response.status(502).json({
        code: "voice_provider_error",
        message: "雲端語音暫時無法使用。",
      });
    }

    const audio = Buffer.from(await upstream.arrayBuffer());
    response.set({
      "Content-Type": "audio/mpeg",
      "Content-Length": String(audio.length),
      "Cache-Control": "no-store",
    });
    return response.send(audio);
  } catch (error) {
    console.error("Azure Speech connection failed", error);
    return response.status(502).json({
      code: "voice_connection_error",
      message: "目前無法連接雲端語音服務。",
    });
  }
});

if (process.env.NODE_ENV === "production") {
  app.use(express.static("dist"));
  app.get("/{*splat}", (_request, response) =>
    response.sendFile("index.html", { root: "dist" }),
  );
} else {
  const vite = await createViteServer({ server: { middlewareMode: true }, appType: "spa" });
  app.use(vite.middlewares);
}

app.listen(port, "127.0.0.1", () => {
  console.log(`Nova is awake at http://127.0.0.1:${port}`);
});
