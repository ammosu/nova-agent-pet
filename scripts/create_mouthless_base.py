from pathlib import Path

import numpy as np
from PIL import Image, ImageDraw, ImageFilter


ROOT = Path(__file__).resolve().parents[1]
SOURCE = ROOT / "public/assets/nova-pet-attention-base.png"
OUTPUT = ROOT / "public/assets/nova-pet-attention-base-mouthless.png"


def main() -> None:
    source = Image.open(SOURCE).convert("RGBA")
    pixels = np.asarray(source).copy()
    height, width = pixels.shape[:2]

    left, right = round(width * 0.55), round(width * 0.64)
    top, bottom = round(height * 0.418), round(height * 0.45)

    replacement = pixels.copy()
    for y in range(top, bottom):
        sample_left = pixels[y, left - 3, :3].astype(np.float32)
        sample_right = pixels[y, right + 3, :3].astype(np.float32)
        amount = np.linspace(0, 1, right - left, dtype=np.float32)[:, None]
        replacement[y, left:right, :3] = (
            sample_left * (1 - amount) + sample_right * amount
        ).astype(np.uint8)

    mask = Image.new("L", source.size, 0)
    draw = ImageDraw.Draw(mask)
    draw.ellipse((left, top - 2, right, bottom + 2), fill=255)
    mask = mask.filter(ImageFilter.GaussianBlur(radius=max(2, width * 0.003)))

    cleaned = Image.fromarray(replacement)
    result = Image.composite(cleaned, source, mask)
    result.save(OUTPUT)
    print(f"Wrote {OUTPUT.relative_to(ROOT)}")


if __name__ == "__main__":
    main()
