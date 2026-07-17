from collections import deque
from pathlib import Path

import numpy as np
from PIL import Image, ImageDraw, ImageFilter


ROOT = Path(__file__).resolve().parents[1]
SOURCE = ROOT / "public/assets/nova-pet.png"

PARTS = {
    "tail": [
        (0.22, 0.43),
        (0.18, 0.46),
        (0.15, 0.51),
        (0.14, 0.58),
        (0.16, 0.68),
        (0.20, 0.76),
        (0.29, 0.81),
        (0.42, 0.80),
        (0.42, 0.70),
        (0.37, 0.62),
        (0.31, 0.56),
        (0.25, 0.52),
    ],
    "ear-left": [
        (0.32, 0.10),
        (0.44, 0.12),
        (0.48, 0.23),
        (0.45, 0.30),
        (0.36, 0.29),
        (0.31, 0.21),
    ],
    "ear-right": [
        (0.66, 0.11),
        (0.72, 0.12),
        (0.75, 0.22),
        (0.72, 0.29),
        (0.64, 0.28),
        (0.63, 0.20),
    ],
    "hand-left": [
        (0.39, 0.61),
        (0.44, 0.61),
        (0.47, 0.64),
        (0.47, 0.68),
        (0.45, 0.70),
        (0.41, 0.70),
        (0.39, 0.67),
    ],
    "hand-right": [
        (0.68, 0.61),
        (0.72, 0.61),
        (0.75, 0.64),
        (0.75, 0.68),
        (0.73, 0.70),
        (0.69, 0.69),
        (0.67, 0.66),
    ],
    "antenna": [
        (0.53, 0.09),
        (0.59, 0.09),
        (0.60, 0.17),
        (0.63, 0.23),
        (0.63, 0.31),
        (0.59, 0.35),
        (0.55, 0.31),
        (0.54, 0.23),
        (0.56, 0.17),
    ],
}


def extract_part(source: Image.Image, points: list[tuple[float, float]]) -> Image.Image:
    width, height = source.size
    polygon = [(round(x * width), round(y * height)) for x, y in points]
    mask = Image.new("L", source.size, 0)
    ImageDraw.Draw(mask).polygon(polygon, fill=255)
    mask = mask.filter(ImageFilter.GaussianBlur(radius=0.55))

    rgba = np.asarray(source.convert("RGBA")).copy()
    source_alpha = rgba[..., 3]
    rgba[..., 3] = np.minimum(source_alpha, np.asarray(mask))
    return Image.fromarray(rgba)


def largest_component(mask: np.ndarray) -> np.ndarray:
    height, width = mask.shape
    visited = np.zeros_like(mask, dtype=bool)
    largest: list[tuple[int, int]] = []

    for y in range(height):
        for x in range(width):
            if not mask[y, x] or visited[y, x]:
                continue
            queue = deque([(y, x)])
            visited[y, x] = True
            component: list[tuple[int, int]] = []
            while queue:
                current_y, current_x = queue.popleft()
                component.append((current_y, current_x))
                for next_y, next_x in (
                    (current_y - 1, current_x),
                    (current_y + 1, current_x),
                    (current_y, current_x - 1),
                    (current_y, current_x + 1),
                ):
                    if (
                        0 <= next_y < height
                        and 0 <= next_x < width
                        and mask[next_y, next_x]
                        and not visited[next_y, next_x]
                    ):
                        visited[next_y, next_x] = True
                        queue.append((next_y, next_x))
            if len(component) > len(largest):
                largest = component

    result = np.zeros_like(mask, dtype=bool)
    for y, x in largest:
        result[y, x] = True
    return result


def extract_antenna(source: Image.Image) -> Image.Image:
    rgba = np.asarray(source.convert("RGBA")).copy()
    height, width = rgba.shape[:2]
    red, green, blue = [rgba[..., channel].astype(np.float32) for channel in range(3)]
    gold = (
        (rgba[..., 3] > 0)
        & (red > 140)
        & ((red - blue) > 55)
        & (green > blue * 0.65)
    )
    gold[: round(height * 0.08)] = False
    gold[round(height * 0.36) :] = False
    gold[:, : round(width * 0.52)] = False
    gold[:, round(width * 0.64) :] = False

    component = largest_component(gold)
    silhouette = np.zeros_like(component, dtype=np.uint8)
    for y in np.flatnonzero(component.any(axis=1)):
        columns = np.flatnonzero(component[y])
        left = max(0, columns.min() - 2)
        right = min(width, columns.max() + 3)
        silhouette[y, left:right] = 255

    mask = Image.fromarray(silhouette).filter(ImageFilter.GaussianBlur(radius=0.65))
    rgba[..., 3] = np.minimum(rgba[..., 3], np.asarray(mask))
    return Image.fromarray(rgba)


def main() -> None:
    source = Image.open(SOURCE)
    for name, points in PARTS.items():
        filename = "nova-pet-antenna-alpha.png" if name == "antenna" else f"nova-pet-{name}.png"
        output = ROOT / f"public/assets/{filename}"
        part = extract_antenna(source) if name == "antenna" else extract_part(source, points)
        part.save(output)
        print(f"Wrote {output.relative_to(ROOT)}")


if __name__ == "__main__":
    main()
