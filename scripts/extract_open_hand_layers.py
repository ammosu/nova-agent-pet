from collections import deque
from pathlib import Path

import numpy as np
from PIL import Image, ImageFilter


ROOT = Path(__file__).resolve().parents[1]
SOURCE = ROOT / "public/assets/nova-pet-open-paws-source.png"
CANVAS_SIZE = (760, 760)

HAND_BOUNDS = {
    "hand-open-left": (260, 430, 390, 560),
    "hand-open-right": (500, 430, 630, 550),
}


def largest_component(mask: np.ndarray) -> np.ndarray:
    height, width = mask.shape
    seen = np.zeros_like(mask, dtype=bool)
    largest: list[tuple[int, int]] = []

    for start_y, start_x in zip(*np.where(mask)):
        if seen[start_y, start_x]:
            continue
        queue = deque([(int(start_y), int(start_x))])
        seen[start_y, start_x] = True
        component: list[tuple[int, int]] = []
        while queue:
            y, x = queue.popleft()
            component.append((y, x))
            for next_y, next_x in (
                (y - 1, x),
                (y + 1, x),
                (y, x - 1),
                (y, x + 1),
            ):
                if (
                    0 <= next_y < height
                    and 0 <= next_x < width
                    and mask[next_y, next_x]
                    and not seen[next_y, next_x]
                ):
                    seen[next_y, next_x] = True
                    queue.append((next_y, next_x))

        if len(component) > len(largest):
            largest = component

    result = np.zeros_like(mask, dtype=bool)
    for y, x in largest:
        result[y, x] = True
    return result


def fill_holes(mask: np.ndarray) -> np.ndarray:
    height, width = mask.shape
    outside = np.zeros_like(mask, dtype=bool)
    queue: deque[tuple[int, int]] = deque()

    for x in range(width):
        for y in (0, height - 1):
            if not mask[y, x] and not outside[y, x]:
                outside[y, x] = True
                queue.append((y, x))
    for y in range(height):
        for x in (0, width - 1):
            if not mask[y, x] and not outside[y, x]:
                outside[y, x] = True
                queue.append((y, x))

    while queue:
        y, x = queue.popleft()
        for next_y, next_x in (
            (y - 1, x),
            (y + 1, x),
            (y, x - 1),
            (y, x + 1),
        ):
            if (
                0 <= next_y < height
                and 0 <= next_x < width
                and not mask[next_y, next_x]
                and not outside[next_y, next_x]
            ):
                outside[next_y, next_x] = True
                queue.append((next_y, next_x))

    return mask | (~mask & ~outside)


def extract_hand(
    source: Image.Image,
    bounds: tuple[int, int, int, int],
) -> Image.Image:
    rgba = np.asarray(source.convert("RGBA")).copy()
    red, green, blue = [rgba[..., channel].astype(np.float32) for channel in range(3)]
    skin = (
        (rgba[..., 3] > 0)
        & (red > 180)
        & (green > 135)
        & (blue > 100)
        & (red > green)
        & (green > blue)
    )

    left, top, right, bottom = bounds
    region = np.zeros_like(skin)
    region[top:bottom, left:right] = skin[top:bottom, left:right]
    silhouette = fill_holes(largest_component(region))
    mask = (
        Image.fromarray(silhouette.astype(np.uint8) * 255)
        .filter(ImageFilter.MaxFilter(5))
        .filter(ImageFilter.GaussianBlur(radius=0.55))
    )

    rgba[..., 3] = np.minimum(rgba[..., 3], np.asarray(mask))
    rgba[rgba[..., 3] == 0, :3] = 0
    return Image.fromarray(rgba)


def main() -> None:
    source = Image.open(SOURCE).convert("RGBA")
    source = source.resize(CANVAS_SIZE, Image.Resampling.LANCZOS)

    for name, bounds in HAND_BOUNDS.items():
        output = ROOT / f"public/assets/nova-pet-{name}.png"
        extract_hand(source, bounds).save(output)
        print(f"Wrote {output.relative_to(ROOT)}")


if __name__ == "__main__":
    main()
