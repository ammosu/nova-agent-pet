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
        (0.398, 0.80),
        (0.398, 0.70),
        (0.365, 0.62),
        (0.31, 0.56),
        (0.25, 0.52),
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

HAND_BOUNDS = {
    "hand-left": (0.36, 0.59, 0.50, 0.74),
    "hand-right": (0.64, 0.59, 0.79, 0.74),
}

EAR_SPECS = {
    "ear-left": ((220, 80, 350, 240), 14, 5),
    "ear-right": ((480, 80, 570, 220), 5, 14),
}


def clear_transparent_rgb(rgba: np.ndarray) -> np.ndarray:
    rgba[rgba[..., 3] == 0, :3] = 0
    return rgba


def extract_part(source: Image.Image, points: list[tuple[float, float]]) -> Image.Image:
    width, height = source.size
    polygon = [(round(x * width), round(y * height)) for x, y in points]
    mask = Image.new("L", source.size, 0)
    ImageDraw.Draw(mask).polygon(polygon, fill=255)
    mask = mask.filter(ImageFilter.GaussianBlur(radius=0.55))

    rgba = np.asarray(source.convert("RGBA")).copy()
    source_alpha = rgba[..., 3]
    rgba[..., 3] = np.minimum(source_alpha, np.asarray(mask))
    return Image.fromarray(clear_transparent_rgb(rgba))


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
        current_y, current_x = queue.popleft()
        for next_y, next_x in (
            (current_y - 1, current_x),
            (current_y + 1, current_x),
            (current_y, current_x - 1),
            (current_y, current_x + 1),
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


def directional_dilate(
    mask: np.ndarray,
    upward: int,
    leftward: int,
    rightward: int,
) -> np.ndarray:
    height, width = mask.shape
    result = np.zeros_like(mask, dtype=bool)
    for offset_y in range(-upward, 1):
        source_y0 = max(0, -offset_y)
        source_y1 = min(height, height - offset_y)
        target_y0 = source_y0 + offset_y
        target_y1 = source_y1 + offset_y
        for offset_x in range(-leftward, rightward + 1):
            source_x0 = max(0, -offset_x)
            source_x1 = min(width, width - offset_x)
            target_x0 = source_x0 + offset_x
            target_x1 = source_x1 + offset_x
            result[target_y0:target_y1, target_x0:target_x1] |= mask[
                source_y0:source_y1,
                source_x0:source_x1,
            ]
    return result


def extract_ear(
    source: Image.Image,
    bounds: tuple[int, int, int, int],
    leftward: int,
    rightward: int,
) -> Image.Image:
    rgba = np.asarray(source.convert("RGBA")).copy()
    red, green, blue = [rgba[..., channel].astype(np.float32) for channel in range(3)]
    warm_inner_ear = (
        (rgba[..., 3] > 0)
        & (red > 150)
        & ((red - blue) > 35)
        & (green > 80)
    )
    left, top, right, bottom = bounds
    region = np.zeros_like(warm_inner_ear)
    region[top:bottom, left:right] = warm_inner_ear[top:bottom, left:right]
    component = largest_component(region)
    silhouette = directional_dilate(
        component,
        upward=22,
        leftward=leftward,
        rightward=rightward,
    )
    mask = Image.fromarray(silhouette.astype(np.uint8) * 255)
    mask = mask.filter(ImageFilter.GaussianBlur(radius=0.5))
    rgba[..., 3] = np.minimum(rgba[..., 3], np.asarray(mask))
    return Image.fromarray(clear_transparent_rgb(rgba))


def extract_hand(
    source: Image.Image,
    bounds: tuple[float, float, float, float],
) -> Image.Image:
    rgba = np.asarray(source.convert("RGBA")).copy()
    height, width = rgba.shape[:2]
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
    region[
        round(top * height) : round(bottom * height),
        round(left * width) : round(right * width),
    ] = skin[
        round(top * height) : round(bottom * height),
        round(left * width) : round(right * width),
    ]
    silhouette = fill_holes(largest_component(region))
    mask = (
        Image.fromarray(silhouette.astype(np.uint8) * 255)
        .filter(ImageFilter.MaxFilter(5))
        .filter(ImageFilter.GaussianBlur(radius=0.55))
    )
    rgba[..., 3] = np.minimum(rgba[..., 3], np.asarray(mask))
    return Image.fromarray(clear_transparent_rgb(rgba))


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
    return Image.fromarray(clear_transparent_rgb(rgba))


def main() -> None:
    source = Image.open(SOURCE)
    for name, points in PARTS.items():
        filename = "nova-pet-antenna-alpha.png" if name == "antenna" else f"nova-pet-{name}.png"
        output = ROOT / f"public/assets/{filename}"
        part = extract_antenna(source) if name == "antenna" else extract_part(source, points)
        part.save(output)
        print(f"Wrote {output.relative_to(ROOT)}")

        if name == "antenna":
            legacy_output = ROOT / "public/assets/nova-pet-antenna.png"
            part.save(legacy_output)
            print(f"Wrote {legacy_output.relative_to(ROOT)}")

    for name, bounds in HAND_BOUNDS.items():
        output = ROOT / f"public/assets/nova-pet-{name}.png"
        extract_hand(source, bounds).save(output)
        print(f"Wrote {output.relative_to(ROOT)}")

    for name, (bounds, leftward, rightward) in EAR_SPECS.items():
        output = ROOT / f"public/assets/nova-pet-{name}.png"
        extract_ear(source, bounds, leftward, rightward).save(output)
        print(f"Wrote {output.relative_to(ROOT)}")


if __name__ == "__main__":
    main()
