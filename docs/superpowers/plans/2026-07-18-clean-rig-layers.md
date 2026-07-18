# Clean Rig Layers Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ensure every runtime Nova PNG layer contains only its intended movable part, with no collar, sleeve, head, body, face-fill, or duplicated pendant pixels.

**Architecture:** Keep the existing full-canvas RGBA rig and correct the deterministic Pillow/NumPy extraction scripts at the source. Add a standalone pixel audit that validates every runtime layer against independent allowed/forbidden regions, then regenerate the PNGs and verify them on two high-contrast backgrounds and in the browser.

**Tech Stack:** Python 3, Pillow, NumPy, React 19, TypeScript, Vite 7, Vitest.

## Global Constraints

- Runtime layers remain independent full-canvas RGBA PNG files with four transparent corners.
- Tail and ears stay behind the body; hands, eyes, antenna, and mouths stay in front.
- Do not overwrite source master images.
- Preserve reduced-motion behavior and existing accessibility markup.
- Run `npm run build` and `npm test -- --run` before completion.

---

### Task 1: Add independent layer-contamination checks

**Files:**
- Create: `scripts/validate_asset_layers.py`

**Interfaces:**
- Consumes: runtime asset filenames referenced by `src/App.tsx` and RGBA PNGs in `public/assets/`.
- Produces: a zero exit code only when corners, alpha bounds, fragment sizes, and part-specific forbidden regions are clean.

- [ ] **Step 1: Write the failing validation script**

Implement `validate_layer(path, spec)` with independent normalized forbidden polygons for the known contamination zones: ear-to-head seams, tail-to-body seam, closed/open hand-to-sleeve seams, eye-to-face-fill wedges, and robe-to-pendant overlap.

- [ ] **Step 2: Run the audit to verify it fails**

Run: `python3 scripts/validate_asset_layers.py`

Expected: non-zero exit with failures for the currently contaminated rig layers.

- [ ] **Step 3: Keep the validation independent of extraction masks**

The validator must not import mask constants from the extraction scripts; otherwise a bad extraction polygon could make its own test pass.

### Task 2: Tighten rig, hand, eye, and clothing extraction

**Files:**
- Modify: `scripts/extract_rig_parts.py`
- Modify: `scripts/extract_open_hand_layers.py`
- Modify: `scripts/extract_eye_layers.py`
- Modify: `scripts/extract_clothing_layers.py`
- Regenerate: corresponding runtime PNGs in `public/assets/`

**Interfaces:**
- Consumes: the existing master/source PNGs without modifying them.
- Produces: full-canvas RGBA PNGs whose alpha bounds tightly follow only the intended part.

- [ ] **Step 1: Replace broad seam-crossing polygons with tight masks**

Use explicit exclusion masks at every attachment seam, zero fully transparent RGB pixels, and retain antialiasing only on the intended contour.

- [ ] **Step 2: Remove duplicated face/garment pixels**

Restrict eye masks to eye features without cream face wedges, isolate paws from sleeves/collar, and cut the pendant out of the robe layer.

- [ ] **Step 3: Regenerate all affected assets**

Run the four extraction scripts and confirm each output has a non-empty alpha bbox and transparent corners.

- [ ] **Step 4: Run the pixel audit to verify it passes**

Run: `python3 scripts/validate_asset_layers.py`

Expected: `All runtime asset layers passed.`

### Task 3: Visual and application verification

**Files:**
- Create or update only temporary audit images outside the repository.
- Modify `README.md` only if the documented asset workflow changes.

**Interfaces:**
- Consumes: regenerated PNGs and the existing Vite application.
- Produces: visual evidence that isolated and animated layers do not expose colored blocks or neighboring parts.

- [ ] **Step 1: Render high-contrast layer contact sheets**

Composite every runtime overlay individually on cyan and yellow backgrounds, inspect tight alpha crops, and rotate/scale the moving parts in an audit sheet.

- [ ] **Step 2: Inspect all seven states in the browser**

Check idle, listening, thinking, working, speaking, happy, and error plus available action previews; confirm mouth/eye mutual exclusion and no console warnings or errors.

- [ ] **Step 3: Run repository verification**

Run: `npm run build`

Expected: exit 0.

Run: `npm test -- --run`

Expected: all Vitest tests pass.
