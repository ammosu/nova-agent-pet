from dataclasses import dataclass
from pathlib import Path
from typing import Optional

import numpy as np
from PIL import Image


ROOT = Path(__file__).resolve().parents[1]
ASSET_DIR = ROOT / "public/assets"


@dataclass(frozen=True)
class LayerSpec:
    components: int = 1
    min_left: float = 0.0
    min_top: float = 0.0
    max_right: float = 1.0
    max_bottom: float = 1.0
    max_alpha_pixels: Optional[int] = None
    max_cream_pixels: Optional[int] = None
    max_purple_pixels: Optional[int] = None


LAYER_SPECS = {
    "nova-pet-antenna-alpha.png": LayerSpec(),
    "nova-pet-antenna.png": LayerSpec(),
    "nova-pet-blink-left.png": LayerSpec(),
    "nova-pet-blink-right.png": LayerSpec(),
    "nova-pet-blink-eyes.png": LayerSpec(components=2),
    "nova-pet-cloak-back-left.png": LayerSpec(),
    "nova-pet-cloak-back-right.png": LayerSpec(),
    "nova-pet-collar-front.png": LayerSpec(components=2),
    "nova-pet-ear-left.png": LayerSpec(max_alpha_pixels=8000),
    "nova-pet-ear-right.png": LayerSpec(max_alpha_pixels=3500),
    "nova-pet-eye-depth-left.png": LayerSpec(max_cream_pixels=0),
    "nova-pet-eye-depth-right.png": LayerSpec(max_cream_pixels=0),
    "nova-pet-eye-glint-left.png": LayerSpec(max_cream_pixels=0),
    "nova-pet-eye-glint-right.png": LayerSpec(max_cream_pixels=0),
    "nova-pet-eye-left.png": LayerSpec(max_cream_pixels=0),
    "nova-pet-eye-pupil-left.png": LayerSpec(max_cream_pixels=0),
    "nova-pet-eye-pupil-right.png": LayerSpec(max_cream_pixels=0),
    "nova-pet-eye-right.png": LayerSpec(max_cream_pixels=0),
    "nova-pet-half-eyes.png": LayerSpec(components=2, max_cream_pixels=0),
    "nova-pet-hand-left.png": LayerSpec(max_purple_pixels=700),
    "nova-pet-hand-open-left.png": LayerSpec(
        min_top=0.595,
        max_purple_pixels=700,
    ),
    "nova-pet-hand-open-right.png": LayerSpec(
        min_top=0.595,
        max_purple_pixels=700,
    ),
    "nova-pet-hand-right.png": LayerSpec(max_purple_pixels=700),
    "nova-pet-happy-expression.png": LayerSpec(components=3),
    "nova-pet-idle-mouth.png": LayerSpec(min_top=0.438),
    "nova-pet-pendant.png": LayerSpec(),
    "nova-pet-robe-front.png": LayerSpec(),
    "nova-pet-speaking-mouth.png": LayerSpec(),
    "nova-pet-squint-eyes.png": LayerSpec(components=2, max_cream_pixels=0),
    "nova-pet-tail.png": LayerSpec(max_right=0.405),
}


def component_sizes(mask: np.ndarray) -> list[int]:
    height, width = mask.shape
    seen = np.zeros_like(mask, dtype=bool)
    sizes: list[int] = []

    for start_y, start_x in zip(*np.where(mask & ~seen)):
        if seen[start_y, start_x]:
            continue
        stack = [(int(start_y), int(start_x))]
        seen[start_y, start_x] = True
        size = 0
        while stack:
            y, x = stack.pop()
            size += 1
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
                    stack.append((next_y, next_x))
        sizes.append(size)

    return sorted(sizes, reverse=True)


def validate_layer(path: Path, spec: LayerSpec) -> list[str]:
    image = Image.open(path).convert("RGBA")
    rgba = np.asarray(image)
    alpha = rgba[..., 3]
    height, width = alpha.shape
    failures: list[str] = []

    corners = [alpha[0, 0], alpha[0, -1], alpha[-1, 0], alpha[-1, -1]]
    if any(corners):
        failures.append(f"opaque canvas corners: {[int(value) for value in corners]}")

    invisible_rgb = np.any(rgba[..., :3] != 0, axis=2) & (alpha == 0)
    if invisible_rgb.any():
        failures.append(f"{int(invisible_rgb.sum())} transparent pixels retain RGB data")

    rows, columns = np.where(alpha > 0)
    if not len(columns):
        failures.append("empty alpha channel")
        return failures

    bbox = (
        int(columns.min()),
        int(rows.min()),
        int(columns.max() + 1),
        int(rows.max() + 1),
    )
    allowed_bbox = (
        round(spec.min_left * width),
        round(spec.min_top * height),
        round(spec.max_right * width),
        round(spec.max_bottom * height),
    )
    if (
        bbox[0] < allowed_bbox[0]
        or bbox[1] < allowed_bbox[1]
        or bbox[2] > allowed_bbox[2]
        or bbox[3] > allowed_bbox[3]
    ):
        failures.append(f"alpha bbox {bbox} exceeds allowed bbox {allowed_bbox}")

    components = component_sizes(alpha >= 32)
    meaningful_components = [size for size in components if size >= 12]
    if len(meaningful_components) != spec.components:
        failures.append(
            f"expected {spec.components} components, got {meaningful_components}"
        )
    visible_fragments = [size for size in components if 4 <= size < 12]
    if visible_fragments:
        failures.append(f"detached alpha fragments: {visible_fragments}")

    if spec.max_alpha_pixels is not None:
        alpha_pixels = int((alpha >= 32).sum())
        if alpha_pixels > spec.max_alpha_pixels:
            failures.append(
                f"contains {alpha_pixels} opaque pixels "
                f"(maximum {spec.max_alpha_pixels})"
            )

    if spec.max_cream_pixels is not None:
        colors = rgba[..., :3].astype(np.int16)
        red, green, blue = [colors[..., channel] for channel in range(3)]
        cream = (
            (alpha >= 32)
            & (red > 180)
            & (green > 140)
            & (blue > 90)
            & (blue < 225)
            & ((red - blue) > 20)
            & ((red - blue) < 120)
        )
        if int(cream.sum()) > spec.max_cream_pixels:
            failures.append(
                f"contains {int(cream.sum())} cream face-fill pixels "
                f"(maximum {spec.max_cream_pixels})"
            )

    if spec.max_purple_pixels is not None:
        colors = rgba[..., :3].astype(np.float32)
        red, green, blue = [colors[..., channel] for channel in range(3)]
        purple = (
            (alpha >= 32)
            & (blue > red * 1.18)
            & (blue > green * 1.15)
        )
        if int(purple.sum()) > spec.max_purple_pixels:
            failures.append(
                f"contains {int(purple.sum())} purple sleeve/collar pixels "
                f"(maximum {spec.max_purple_pixels})"
            )

    return failures


def validate_no_overlap(
    first_name: str,
    second_name: str,
    maximum_pixels: int,
) -> Optional[str]:
    first = Image.open(ASSET_DIR / first_name).convert("RGBA").getchannel("A")
    second = Image.open(ASSET_DIR / second_name).convert("RGBA").getchannel("A")
    canvas_size = (760, 760)
    first_mask = np.asarray(first.resize(canvas_size, Image.Resampling.LANCZOS)) >= 32
    second_mask = np.asarray(second.resize(canvas_size, Image.Resampling.LANCZOS)) >= 32
    overlap = int((first_mask & second_mask).sum())
    if overlap > maximum_pixels:
        return f"overlaps {second_name} by {overlap} pixels (maximum {maximum_pixels})"
    return None


def main() -> None:
    failures: list[str] = []
    for filename, spec in LAYER_SPECS.items():
        path = ASSET_DIR / filename
        if not path.exists():
            failures.append(f"{filename}: missing runtime layer")
            continue
        failures.extend(
            f"{filename}: {failure}" for failure in validate_layer(path, spec)
        )

    for first, second, maximum in (
        ("nova-pet-robe-front.png", "nova-pet-collar-front.png", 48),
        ("nova-pet-robe-front.png", "nova-pet-pendant.png", 24),
    ):
        failure = validate_no_overlap(first, second, maximum)
        if failure:
            failures.append(f"{first}: {failure}")

    if failures:
        raise SystemExit("Layer validation failed:\n- " + "\n- ".join(failures))
    print("All runtime asset layers passed.")


if __name__ == "__main__":
    main()
