# Nova Agent Pet

Nova 是一個可嵌入既有 Agent 網頁的互動寵物原型。角色會依 Agent 的處理狀態切換動作、表情與語音回應，並以獨立透明 PNG 圖層驅動尾巴、耳朵、衣服、雙手、眼睛、天線與嘴型。

Repository：<https://github.com/ammosu/nova-agent-pet>

## 功能

- 七種 Agent 狀態：待機、聆聽、思考、執行、說話、完成、錯誤。
- 尾巴、左右耳、左右披風、完整前領片、完整正面袍身、寶石、雙手、雙眼、天線與嘴型皆使用獨立透明圖層。
- 正面袍身與領片固定跟隨內層衣身，不會在招手、伸展、完成或星光舞時產生第二次位移。
- 後方披風與寶石使用不同支點、週期與相位延遲；招手、伸展、星光舞與瞌睡另有拖曳、甩動與回彈時間軸。
- 待機時自然切換角色方向與視線。
- 觀測艙具有游標視差、動態星塵、角色落地陰影與狀態切換脈衝。
- 雙手採用非對稱表演節奏，依聆聽、思考、執行、說話、完成與錯誤狀態切換手勢。
- 四種獨立角色動作：招手、伸展、星光舞與瞌睡；不會混入正式 Agent 狀態機。
- 可從介面試播每種動畫狀態。
- 執行中的模擬任務可隨時停止，失敗後可從介面重新嘗試。
- 瀏覽器 `SpeechSynthesis` 中文語音 fallback。
- 可選 Azure Speech 台灣中文語音。
- 響應式介面與 `prefers-reduced-motion` 支援。

目前仍是前端原型：Agent 回覆與工具執行流程由 `src/App.tsx` 模擬，尚未連接正式 Agent 後端。
輸入 `測試錯誤` 可觸發一次可恢復錯誤，供驗證錯誤動畫與重新嘗試流程。

## 系統需求

- Node.js 22+（建議使用目前的 Node.js LTS）
- npm 10+
- 若要重新產生透明角色分件：Python 3、Pillow、NumPy

## 快速開始

```bash
git clone https://github.com/ammosu/nova-agent-pet.git
cd nova-agent-pet
npm install
npm run dev
```

開啟 <http://127.0.0.1:5173>。

## 常用指令

| 指令 | 用途 |
| --- | --- |
| `npm run dev` | 啟動 Express、Vite 與語音 API 開發伺服器 |
| `npm run build` | 執行 TypeScript 檢查並產生 `dist/` |
| `npm test` | 執行 Vitest 狀態機測試 |
| `npm run preview` | 僅預覽 Vite build；不包含 Express 語音 API |

提交變更前至少執行：

```bash
npm run build
npm test -- --run
```

## 語音設定

沒有設定 Azure 時，Nova 會自動使用裝置提供的 `zh-TW` 或其他中文瀏覽器語音。

若要啟用 Azure Speech，複製環境變數範例：

```bash
cp .env.example .env
```

填入伺服器端設定：

```bash
AZURE_SPEECH_KEY=你的資源金鑰
AZURE_SPEECH_REGION=eastasia
PORT=5173
```

請勿使用 `VITE_*` 變數保存金鑰。`.env` 已被 Git 忽略，Azure 金鑰只會由 `server.mjs` 讀取。

### 語音 API

| Endpoint | 說明 |
| --- | --- |
| `GET /api/voice-status` | 回傳 Azure 是否已設定，以及目前建議的語音來源 |
| `POST /api/tts` | 接收 `{ "text": string, "voice": string }` 並回傳 MP3 |

`POST /api/tts` 最多接受 2,000 個字元，Azure 聲線限制為：

- `zh-TW-HsiaoChenNeural`
- `zh-TW-HsiaoYuNeural`
- `zh-TW-YunJheNeural`

## 接上既有 Agent

狀態機位於 `src/petMachine.ts`。將 `src/App.tsx` 的模擬延遲替換成既有 Agent 的串流事件，再將事件傳入 `transitionPet`。

| Agent 事件 | Nova 狀態 |
| --- | --- |
| `USER_INPUT_STARTED` | `listening` |
| `AGENT_STARTED` | `thinking` |
| `TOOL_STARTED` | `working` |
| `MESSAGE_READY` | `happy` |
| `VOICE_STARTED` | `speaking` |
| `VOICE_ENDED` | `idle` |
| `AGENT_FAILED` | `error` |
| `TASK_CANCELLED` | `idle` |
| `PET_TAPPED` | `happy` |
| `RESET` | `idle` |

範例：

```ts
setPetState((state) => transitionPet(state, { type: "AGENT_STARTED" }));

agent.on("tool-start", () => {
  setPetState((state) => transitionPet(state, { type: "TOOL_STARTED" }));
});

agent.on("message-ready", () => {
  setPetState((state) => transitionPet(state, { type: "MESSAGE_READY" }));
});
```

正式整合時應由真實串流事件控制狀態，不要保留 `sleep()` 模擬流程。

## 專案結構

```text
.
├── public/assets/             # 角色母圖與執行中透明分件
├── scripts/
│   ├── create_mouthless_base.py
│   ├── extract_clothing_layers.py
│   ├── extract_eye_layers.py
│   ├── extract_open_hand_layers.py
│   ├── extract_rig_parts.py
│   └── validate_asset_layers.py
├── src/
│   ├── App.tsx                # UI、模擬 Agent 流程、角色圖層
│   ├── petMachine.ts          # Agent 狀態機
│   ├── petMachine.test.ts     # 狀態轉移測試
│   ├── styles.test.ts         # 固定衣物圖層的動畫回歸測試
│   ├── voice.ts               # Azure／瀏覽器語音播放
│   └── styles.css             # 版面與角色動畫
├── server.mjs                 # Express、Vite middleware、Azure TTS proxy
└── vite.config.ts
```

## 透明角色分件

`public/assets/nova-pet.png` 是原始母圖，只供產生素材使用。執行中的角色不會直接載入完整母圖。

目前使用中的角色素材包括：

- `nova-pet-undercoat-base.png`
- `nova-pet-tail.png`
- `nova-pet-ear-left.png`、`nova-pet-ear-right.png`
- `nova-pet-cloak-back-left.png`、`nova-pet-cloak-back-right.png`
- `nova-pet-collar-front.png`
- `nova-pet-robe-front.png`
- `nova-pet-pendant.png`
- `nova-pet-hand-left.png`、`nova-pet-hand-right.png`
- `nova-pet-hand-open-left.png`、`nova-pet-hand-open-right.png`
- `nova-pet-eye-left.png`、`nova-pet-eye-right.png`
- `nova-pet-antenna-alpha.png`
- `nova-pet-idle-mouth.png`
- `nova-pet-blink-eyes.png`
- `nova-pet-speaking-mouth.png`
- `nova-pet-happy-expression.png`

每個執行中圖層都必須有真正的 Alpha 背景，四個角落必須完全透明。不要改回從完整角色圖片以 CSS `clip-path` 即時裁切，否則旋轉時容易帶出頭部、衣服或臉部色塊。

若要重新產生素材：

```bash
python3 -m pip install Pillow numpy
python3 scripts/extract_eye_layers.py
python3 scripts/create_mouthless_base.py
python3 scripts/extract_rig_parts.py
python3 scripts/extract_open_hand_layers.py
python3 scripts/extract_clothing_layers.py
python3 scripts/validate_asset_layers.py
```

`nova-pet-open-paws-source.png` 是以原角色為參考生成的開掌來源影格，只供
`extract_open_hand_layers.py` 產生兩張透明開掌圖層；不會取代原始母圖。

`nova-pet-undercoat-base.png` 是保留角色頭部與輪廓、將外袍下方整理成深靛色
內層衣的 Rig 底圖。`extract_clothing_layers.py` 會從
`nova-pet-attention-base-mouthless.png` 重新產生披風、領片、袍身與寶石，不會
覆寫原始母圖或內層衣底圖。

外袍前片與領片雖然是獨立 PNG，以便維持正確的前後遮擋，但它們屬於身體的固定
衣物，必須與 `nova-pet-undercoat-base.png` 使用同一條移動時間軸；不可加入
`rig-cloth` 或額外的上下位移。只有身體後方的披風片與以頸部為錨點的寶石可保留
獨立擺動。

`validate_asset_layers.py` 會檢查所有執行圖層的透明四角、Alpha 邊界、
脫離碎片、透明像素 RGB 殘留，以及耳朵、雙手、雙眼、領片、袍身與寶石之間的
已知污染區。重新產生素材後應先看到 `All runtime asset layers passed.`，再進入
瀏覽器檢查動畫。

重新產生後，請在瀏覽器依序檢查待機、思考、執行、說話、完成與錯誤狀態，確認沒有方格、重影或相鄰部件跟著移動。

## Production build

```bash
npm run build
NODE_ENV=production npm run dev
```

Production 模式會由 Express 提供 `dist/`、SPA fallback 與語音 API。若部署在其他平台，必須同時保留 `/api/voice-status` 與 `/api/tts` 的伺服器功能。

## 安全注意事項

- 不要提交 `.env`、Azure Speech key 或其他 API key。
- 不要將伺服器金鑰放入 `VITE_*` 環境變數。
- TTS 文字限制為 2,000 字元，Express JSON body 限制為 32 KB。
- 公開 repository 不代表已授權他人自由使用角色美術或程式碼。

## 授權

本專案目前尚未指定開源授權。加入 `LICENSE` 前，所有權利仍由原作者保留。
