# Nova Agent Pet

一個可以嵌入既有 Agent 網頁的 AI 寵物原型。包含 Agent 狀態動畫、表情切換、動畫試播、模擬對話、瀏覽器語音，以及可選的 Azure 台灣中文語音。

## 啟動

```bash
npm install
npm run dev
```

開啟 `http://127.0.0.1:5173`。

## 台灣中文雲端語音

複製 `.env.example` 為 `.env`，再填入 Azure Speech 資源資訊：

```bash
AZURE_SPEECH_KEY=你的資源金鑰
AZURE_SPEECH_REGION=eastasia
```

金鑰只由 `server.mjs` 讀取，不會傳進前端 bundle。沒有設定時，介面會自動使用作業系統提供的 `zh-TW` 語音。

## 接上既有 Agent

將 `src/App.tsx` 內的模擬流程換成既有 Agent 的串流事件，並呼叫 `transitionPet`：

- 開始處理：`AGENT_STARTED`
- 開始使用工具：`TOOL_STARTED`
- 回覆完成：`MESSAGE_READY`
- 發生錯誤：`AGENT_FAILED`
- 開始與結束播放語音：`VOICE_STARTED`、`VOICE_ENDED`

原始角色母圖位於 `public/assets/nova-pet.png`，只作為產生分件的來源；執行中的
角色不會直接載入這張完整圖片。

0.2 版另外加入 `nova-pet-blink.png`、`nova-pet-speaking.png` 與
`nova-pet-happy.png`，用於眨眼、嘴型和開心表情動畫。

0.3 版加入 `nova-pet-rig-base.png` 作為無手、無尾巴的角色底圖；畫面會將
原角色的尾巴與左右手裁成三個獨立圖層。每個 Agent 狀態都有不同的手勢與
搖尾節奏，待機時也會約每 3–7 秒在左、中、右方向之間自然切換。

0.4 版加入 `nova-pet-attention-base.png`，再將左右耳、雙眼與額頭天線拆成
獨立圖層。耳朵會依聆聽、思考與工作狀態轉動，視線會自然游移，天線則會在
思考與工作時加速並發光。雙眼使用 `nova-pet-eye-left.png` 與
`nova-pet-eye-right.png` 透明眼型素材，避免移動時出現臉部色塊；左右手遮罩
也縮到手掌本身，不再帶動袍身或袖口。

眨眼、說話與完成表情也分別使用 `nova-pet-blink-eyes.png`、
`nova-pet-speaking-mouth.png` 與 `nova-pet-happy-expression.png`，只替換眼瞼
或嘴型，不再用帶有膚色背景的表情方塊覆蓋角色臉部。

角色底圖使用 `nova-pet-attention-base-mouthless.png`，一般微笑則由
`nova-pet-idle-mouth.png` 提供。說話時一般微笑與開口嘴型會互斥切換，避免
底圖嘴巴與說話嘴型同時出現。

尾巴、左右耳、左右手與天線也都是各自的透明 PNG，由
`scripts/extract_rig_parts.py` 從母圖產生。所有執行中角色圖層的四角 Alpha
皆為 0，不再依賴 CSS 從完整角色圖片即時裁切。
