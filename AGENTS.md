# AGENTS.md

本檔案適用於 repository 根目錄及其所有子目錄，提供自動化程式代理與協作者一致的開發規範。

## 專案目標

Nova Agent Pet 是 React + TypeScript 的網頁寵物原型。角色視覺必須能反映 Agent 的真實工作狀態，並維持透明分件動畫、中文語音 fallback 與可嵌入既有 Agent 頁面的結構。

## 技術棧

- React 19
- TypeScript（strict mode）
- Vite 7
- Express 5
- Vitest
- CSS keyframe animation
- Python + Pillow + NumPy（角色素材產生）

## 開發指令

```bash
npm install
npm run dev
npm run build
npm test -- --run
```

開發頁面為 `http://127.0.0.1:5173/`。

完成任何程式、動畫或素材變更前，至少必須成功執行：

```bash
npm run build
npm test -- --run
```

## 主要檔案

- `src/App.tsx`：介面、角色圖層、方向排程、模擬 Agent 流程。
- `src/styles.css`：版面、狀態動畫、圖層 z-index 與 reduced-motion。
- `src/petMachine.ts`：唯一的 Agent 狀態與事件定義來源。
- `src/petMachine.test.ts`：狀態轉移測試。
- `src/voice.ts`：Azure 與瀏覽器語音播放及 fallback。
- `server.mjs`：Express、Vite middleware、語音 API 與 production 靜態檔案。
- `public/assets/`：角色母圖與透明執行素材。
- `scripts/`：可重複產生角色透明分件的 Python 腳本。

## Agent 狀態規則

合法狀態只有：

```text
idle, listening, thinking, working, speaking, happy, error
```

事件映射必須集中在 `transitionPet`，不要在多個元件複製另一套狀態轉移表。新增狀態或事件時，同步更新：

1. `PetState`／`PetEvent`
2. `transitionPet`
3. `petStatus`
4. `stateOrder` 與動畫試播介面
5. 對應 CSS state selectors
6. `petMachine.test.ts`
7. `README.md`

正式 Agent 整合應由串流事件驅動狀態；`App.tsx` 內的 `sleep()` 只供原型展示。

## 角色透明分件規範

這是本專案的重要不變條件：

- 執行中的角色不可直接引用完整母圖 `nova-pet.png`。
- 每個可動部件必須是獨立 RGBA PNG，四角 Alpha 必須為 0。
- 四角透明不代表分件合格；Alpha 有效邊界必須緊貼目標部件輪廓，不得把鄰近的袖身、頭部、袍身或矩形色塊一起保留下來。
- 新增或重製分件後，必須先在至少一個高對比純色背景上單獨檢查，再於瀏覽器中旋轉與縮放；任何姿勢都不得出現有色方框、直角殘片或背景色毛邊。
- 不要以大型 CSS `clip-path` 從完整角色圖裁切可動部件。
- 尾巴與耳朵位於身體後方；雙手、眼睛、天線與嘴型位於身體前方。
- 底圖必須使用無手、無尾、無耳、無眼、無天線、無嘴的對應版本。
- 待機嘴與說話嘴必須互斥；說話影格不可同時顯示兩張嘴。
- 開眼與眨眼影格必須互斥；閉眼時不可留下原始眼睛。
- 表情素材只保留眼瞼或嘴型，不得包含臉部膚色方塊。
- 旋轉部件前要確認素材沒有包含頭部、袍身或相鄰角色區塊。

目前的圖層順序是：尾巴／耳朵／披風後片 → 內層衣身體 → 袍身／領片 → 雙手／寶石 → 雙眼 → 天線／待機嘴 → 表情影格。修改 z-index 時要維持合理遮擋。

## 素材產生流程

需要 Python 3、Pillow 與 NumPy：

```bash
python3 -m pip install Pillow numpy
python3 scripts/extract_eye_layers.py
python3 scripts/create_mouthless_base.py
python3 scripts/extract_rig_parts.py
python3 scripts/extract_clothing_layers.py
python3 scripts/validate_asset_layers.py
```

- `extract_eye_layers.py` 產生雙眼、待機嘴、眨眼、說話嘴與完成表情。
- `create_mouthless_base.py` 產生無嘴角色底圖。
- `extract_rig_parts.py` 產生尾巴、耳朵、雙手與天線。
- `extract_clothing_layers.py` 從無嘴角色底圖產生披風後片、領片、袍身與寶石。
- `validate_asset_layers.py` 驗證執行圖層的 Alpha 邊界、透明 RGB、碎片與相鄰部件污染。

不要手動覆寫來源母圖。若輸出檔名改變，必須同步更新 `App.tsx` 與 README 素材清單。

## 動畫與視覺驗證

只執行單元測試不足以驗證角色分件。涉及 `App.tsx` 角色 markup、`styles.css`、`public/assets/` 或 `scripts/` 時，必須在瀏覽器檢查：

1. 待機：方向、視線、眨眼與一般嘴型。
2. 聆聽：耳朵與視線。
3. 思考：眼睛、天線與浮動。
4. 執行：雙手、尾巴與掃描效果。
5. 說話：待機嘴與說話嘴互斥，嘴周圍沒有方格。
6. 完成：笑眼、笑嘴、天線與尾巴，沒有頭部殘影。
7. 錯誤：閉眼、垂耳與灰階效果。

同時檢查瀏覽器 console 沒有 error 或 warning。若改動 motion，保留 `prefers-reduced-motion` 行為。

## 語音與安全

- Azure key 只能由 `server.mjs` 讀取。
- 不得在前端程式、測試、README 範例或 `VITE_*` 變數放入真實金鑰。
- `.env` 不得加入 Git；只能提交 `.env.example`。
- `POST /api/tts` 的文字上限與聲線 allowlist 不應在未評估安全風險下移除。
- 雲端語音失敗時必須保留瀏覽器 `SpeechSynthesis` fallback。

## 程式風格

- 保持 TypeScript strict mode，不使用 `any` 規避型別問題。
- 狀態與事件名稱使用既有英文命名；使用者介面文字使用繁體中文。
- 優先修改既有元件與 CSS 結構，避免為小功能引入大型依賴。
- 保留無障礙名稱、鍵盤操作、`aria-live` 與 reduced-motion。
- 將真正的 Agent／語音事件與純視覺動畫解耦。

## Git 與文件

- 不提交 `node_modules/`、`dist/`、`.env`、`tmp/` 或作業系統暫存檔。
- 不使用會覆蓋使用者未提交內容的破壞性 Git 指令。
- Commit 訊息建議使用 Conventional Commits，例如 `feat: add gaze scheduler`、`fix: remove antenna background`。
- 功能、指令、環境變數、API 或素材流程變更時，同步更新 `README.md`。
- 除非使用者明確要求，不要自行決定或更換專案授權條款。
