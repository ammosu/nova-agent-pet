from pathlib import Path
from typing import Optional

import numpy as np
from PIL import Image, ImageDraw, ImageFilter


ROOT = Path(__file__).resolve().parents[1]
SOURCE = ROOT / "public/assets/nova-pet-attention-base-mouthless.png"

# Points use normalized canvas coordinates so the layers remain aligned if the
# source asset is regenerated at a different square resolution.
PARTS = {
    "cloak-back-left": [
        (0.33, 0.52),
        (0.43, 0.56),
        (0.43, 0.67),
        (0.40, 0.80),
        (0.35, 0.77),
        (0.32, 0.70),
        (0.31, 0.61),
    ],
    "cloak-back-right": [
        (0.68, 0.56),
        (0.73, 0.52),
        (0.75, 0.61),
        (0.75, 0.70),
        (0.72, 0.78),
        (0.68, 0.80),
        (0.67, 0.68),
    ],
    "collar-left": [
        (0.34, 0.51),
        (0.42, 0.49),
        (0.50, 0.50),
        (0.58, 0.55),
        (0.55, 0.59),
        (0.49, 0.61),
        (0.41, 0.59),
        (0.35, 0.55),
    ],
    "collar-right": [
        (0.61, 0.55),
        (0.65, 0.50),
        (0.72, 0.51),
        (0.73, 0.55),
        (0.69, 0.59),
        (0.64, 0.61),
        (0.615, 0.60),
    ],
    "robe-left": [
        (0.34, 0.55),
        (0.49, 0.56),
        (0.59, 0.61),
        (0.60, 0.82),
        (0.52, 0.85),
        (0.41, 0.82),
        (0.34, 0.76),
        (0.32, 0.66),
    ],
    "robe-right": [
        (0.57, 0.61),
        (0.68, 0.55),
        (0.73, 0.57),
        (0.75, 0.66),
        (0.74, 0.75),
        (0.67, 0.82),
        (0.59, 0.85),
    ],
    "pendant": [
        (0.585, 0.53),
        (0.615, 0.56),
        (0.625, 0.60),
        (0.595, 0.65),
        (0.56, 0.62),
        (0.555, 0.58),
    ],
}


def extract_part(
    source: Image.Image,
    points: list[tuple[float, float]],
) -> Image.Image:
    width, height = source.size
    polygon = [(round(x * width), round(y * height)) for x, y in points]
    mask = Image.new("L", source.size, 0)
    ImageDraw.Draw(mask).polygon(polygon, fill=255)
    mask = mask.filter(ImageFilter.GaussianBlur(radius=max(0.55, width * 0.00045)))

    rgba = np.asarray(source.convert("RGBA")).copy()
    rgba[..., 3] = np.minimum(rgba[..., 3], np.asarray(mask))
    rgba[rgba[..., 3] == 0, :3] = 0
    return Image.fromarray(rgba)


def remove_occluded_pixels(
    image: Image.Image,
    occluders: list[Image.Image],
) -> Image.Image:
    rgba = np.asarray(image.convert("RGBA")).copy()
    occlusion = np.maximum.reduce(
        [np.asarray(layer.getchannel("A")) for layer in occluders]
    )
    expanded = Image.fromarray(occlusion).filter(ImageFilter.MaxFilter(5))
    rgba[np.asarray(expanded) > 0, 3] = 0
    rgba[rgba[..., 3] == 0, :3] = 0
    return Image.fromarray(rgba)


def validate_part(name: str, image: Image.Image) -> None:
    alpha = image.getchannel("A")
    width, height = image.size
    corners = [
        alpha.getpixel((0, 0)),
        alpha.getpixel((width - 1, 0)),
        alpha.getpixel((0, height - 1)),
        alpha.getpixel((width - 1, height - 1)),
    ]
    if any(corners):
        raise ValueError(f"{name} has opaque canvas corners: {corners}")
    if alpha.getbbox() is None:
        raise ValueError(f"{name} has no visible pixels")


def main() -> None:
    source = Image.open(SOURCE).convert("RGBA")
    collar_fragments: list[Image.Image] = []
    robe_fragments: list[Image.Image] = []
    pendant_layer: Optional[Image.Image] = None
    for name, points in PARTS.items():
        part = extract_part(source, points)
        validate_part(name, part)
        if name in {"collar-left", "collar-right"}:
            collar_fragments.append(part)
            continue
        if name in {"robe-left", "robe-right"}:
            robe_fragments.append(part)
            continue
        if name == "pendant":
            pendant_layer = part

        output = ROOT / f"public/assets/nova-pet-{name}.png"
        part.save(output)
        print(f"Wrote {output.relative_to(ROOT)}; alpha bbox={part.getchannel('A').getbbox()}")

    collar = Image.new("RGBA", source.size, (0, 0, 0, 0))
    for fragment in collar_fragments:
        collar = Image.alpha_composite(collar, fragment)
    validate_part("collar-front", collar)
    collar_output = ROOT / "public/assets/nova-pet-collar-front.png"
    collar.save(collar_output)
    print(
        f"Wrote {collar_output.relative_to(ROOT)}; "
        f"alpha bbox={collar.getchannel('A').getbbox()}"
    )

    robe = Image.new("RGBA", source.size, (0, 0, 0, 0))
    for fragment in robe_fragments:
        robe = Image.alpha_composite(robe, fragment)
    if pendant_layer is None:
        raise ValueError("pendant layer was not generated")
    robe = remove_occluded_pixels(robe, [collar, pendant_layer])
    validate_part("robe-front", robe)
    robe_output = ROOT / "public/assets/nova-pet-robe-front.png"
    robe.save(robe_output)
    print(
        f"Wrote {robe_output.relative_to(ROOT)}; "
        f"alpha bbox={robe.getchannel('A').getbbox()}"
    )


if __name__ == "__main__":
    main()
