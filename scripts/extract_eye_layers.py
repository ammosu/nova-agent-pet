from collections import deque
from pathlib import Path

import numpy as np
from PIL import Image, ImageFilter


ROOT = Path(__file__).resolve().parents[1]
SOURCE = ROOT / "public/assets/nova-pet.png"
BLINK_SOURCE = ROOT / "public/assets/nova-pet-blink.png"
SPEAKING_SOURCE = ROOT / "public/assets/nova-pet-speaking.png"
HAPPY_SOURCE = ROOT / "public/assets/nova-pet-happy.png"

EYES = {
    "left": (0.40, 0.32, 0.57, 0.47),
    "right": (0.60, 0.32, 0.77, 0.47),
}

MOUTH = (0.52, 0.40, 0.66, 0.52)
IDLE_MOUTH = (0.54, 0.442, 0.63, 0.46)


def largest_component(mask: np.ndarray) -> np.ndarray:
    height, width = mask.shape
    visited = np.zeros_like(mask, dtype=bool)
    largest: list[tuple[int, int]] = []
    largest_interior: list[tuple[int, int]] = []

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
            touches_border = any(
                y in (0, height - 1) or x in (0, width - 1)
                for y, x in component
            )
            if not touches_border and len(component) > len(largest_interior):
                largest_interior = component

    result = np.zeros_like(mask, dtype=bool)
    for y, x in (largest_interior or largest):
        result[y, x] = True
    return result


def fill_holes(mask: np.ndarray) -> np.ndarray:
    height, width = mask.shape
    outside = np.zeros_like(mask, dtype=bool)
    queue = deque()

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


def clear_transparent_rgb(rgba: np.ndarray) -> np.ndarray:
    rgba[rgba[..., 3] == 0, :3] = 0
    return rgba


def dilate(mask: np.ndarray, iterations: int = 2) -> np.ndarray:
    result = mask.copy()
    for _ in range(iterations):
        padded = np.pad(result, 1, mode="constant")
        result = np.logical_or.reduce(
            [
                padded[y : y + result.shape[0], x : x + result.shape[1]]
                for y in range(3)
                for x in range(3)
            ]
        )
    return result


def extract_eye(source: Image.Image, bounds: tuple[float, float, float, float]) -> Image.Image:
    rgba = np.asarray(source.convert("RGBA"))
    height, width = rgba.shape[:2]
    left, top, right, bottom = bounds
    x0, y0 = round(left * width), round(top * height)
    x1, y1 = round(right * width), round(bottom * height)

    crop = rgba[y0:y1, x0:x1]
    rgb = crop[..., :3].astype(np.float32)
    luminance = 0.2126 * rgb[..., 0] + 0.7152 * rgb[..., 1] + 0.0722 * rgb[..., 2]
    dark_pixels = (luminance < 125) & (crop[..., 3] > 0)
    component = largest_component(dark_pixels)
    silhouette = Image.fromarray(fill_holes(component).astype(np.uint8) * 255)
    silhouette = silhouette.filter(ImageFilter.MaxFilter(3))
    silhouette = silhouette.filter(ImageFilter.GaussianBlur(radius=0.4))

    output = np.zeros_like(rgba)
    eye_pixels = crop.copy()
    eye_pixels[..., 3] = np.minimum(eye_pixels[..., 3], np.asarray(silhouette))
    eye_colors = eye_pixels[..., :3].astype(np.int16)
    red, green, blue = [eye_colors[..., channel] for channel in range(3)]
    face_cream = (
        (red > 180)
        & (green > 140)
        & (blue > 90)
        & (blue < 225)
        & ((red - blue) > 20)
        & ((red - blue) < 120)
    )
    eye_pixels[face_cream, 3] = 0
    output[y0:y1, x0:x1] = eye_pixels
    return Image.fromarray(clear_transparent_rgb(output))


def extract_eyelid(source: Image.Image, bounds: tuple[float, float, float, float]) -> Image.Image:
    rgba = np.asarray(source.convert("RGBA"))
    height, width = rgba.shape[:2]
    left, top, right, bottom = bounds
    x0, y0 = round(left * width), round(top * height)
    x1, y1 = round(right * width), round(bottom * height)

    crop = rgba[y0:y1, x0:x1]
    rgb = crop[..., :3].astype(np.float32)
    luminance = 0.2126 * rgb[..., 0] + 0.7152 * rgb[..., 1] + 0.0722 * rgb[..., 2]
    eyelid_core = largest_component((luminance < 125) & (crop[..., 3] > 0))
    eyelid_area = dilate(eyelid_core)
    antialias = np.clip((205 - luminance) / 80, 0, 1) * 255

    output = np.zeros_like(rgba)
    eyelid_pixels = crop.copy()
    eyelid_pixels[..., 3] = np.where(
        eyelid_area,
        np.minimum(eyelid_pixels[..., 3], antialias.astype(np.uint8)),
        0,
    )
    output[y0:y1, x0:x1] = eyelid_pixels
    return Image.fromarray(clear_transparent_rgb(output))


def extract_dark_region(source: Image.Image, bounds: tuple[float, float, float, float]) -> Image.Image:
    rgba = np.asarray(source.convert("RGBA"))
    height, width = rgba.shape[:2]
    left, top, right, bottom = bounds
    x0, y0 = round(left * width), round(top * height)
    x1, y1 = round(right * width), round(bottom * height)

    crop = rgba[y0:y1, x0:x1]
    rgb = crop[..., :3].astype(np.float32)
    luminance = 0.2126 * rgb[..., 0] + 0.7152 * rgb[..., 1] + 0.0722 * rgb[..., 2]
    feature_area = dilate((luminance < 135) & (crop[..., 3] > 0))
    antialias = np.clip((210 - luminance) / 85, 0, 1) * 255

    output = np.zeros_like(rgba)
    feature_pixels = crop.copy()
    feature_pixels[..., 3] = np.where(
        feature_area,
        np.minimum(feature_pixels[..., 3], antialias.astype(np.uint8)),
        0,
    )
    output[y0:y1, x0:x1] = feature_pixels
    return Image.fromarray(clear_transparent_rgb(output))


def main() -> None:
    source = Image.open(SOURCE)
    for name, bounds in EYES.items():
        output = ROOT / f"public/assets/nova-pet-eye-{name}.png"
        extract_eye(source, bounds).save(output)
        print(f"Wrote {output.relative_to(ROOT)}")

    idle_mouth_output = ROOT / "public/assets/nova-pet-idle-mouth.png"
    extract_dark_region(source, IDLE_MOUTH).save(idle_mouth_output)
    print(f"Wrote {idle_mouth_output.relative_to(ROOT)}")

    blink_source = Image.open(BLINK_SOURCE)
    blink_layer = Image.new("RGBA", blink_source.size, (0, 0, 0, 0))
    for bounds in EYES.values():
        blink_layer = Image.alpha_composite(blink_layer, extract_eyelid(blink_source, bounds))
    blink_output = ROOT / "public/assets/nova-pet-blink-eyes.png"
    blink_layer.save(blink_output)
    print(f"Wrote {blink_output.relative_to(ROOT)}")

    speaking_source = Image.open(SPEAKING_SOURCE)
    speaking_output = ROOT / "public/assets/nova-pet-speaking-mouth.png"
    extract_eye(speaking_source, MOUTH).save(speaking_output)
    print(f"Wrote {speaking_output.relative_to(ROOT)}")

    happy_source = Image.open(HAPPY_SOURCE)
    happy_layer = Image.new("RGBA", happy_source.size, (0, 0, 0, 0))
    for bounds in EYES.values():
        happy_layer = Image.alpha_composite(happy_layer, extract_eyelid(happy_source, bounds))
    happy_layer = Image.alpha_composite(happy_layer, extract_eye(happy_source, MOUTH))
    happy_output = ROOT / "public/assets/nova-pet-happy-expression.png"
    happy_layer.save(happy_output)
    print(f"Wrote {happy_output.relative_to(ROOT)}")


if __name__ == "__main__":
    main()
