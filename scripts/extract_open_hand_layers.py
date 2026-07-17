from pathlib import Path

from PIL import Image, ImageChops, ImageDraw, ImageFilter


ROOT = Path(__file__).resolve().parents[1]
SOURCE = ROOT / "public/assets/nova-pet-open-paws-source.png"
CANVAS_SIZE = (760, 760)

HAND_POLYGONS = {
    "hand-open-left": [
        (302, 447),
        (329, 444),
        (349, 449),
        (362, 458),
        (370, 472),
        (374, 490),
        (370, 508),
        (360, 524),
        (344, 536),
        (324, 540),
        (305, 535),
        (290, 525),
        (281, 510),
        (276, 492),
        (278, 475),
        (284, 460),
        (293, 451),
    ],
    "hand-open-right": [
        (536, 449),
        (559, 446),
        (581, 450),
        (599, 459),
        (608, 474),
        (612, 490),
        (608, 505),
        (599, 518),
        (586, 528),
        (567, 532),
        (549, 528),
        (534, 519),
        (524, 505),
        (518, 488),
        (519, 472),
        (525, 458),
    ],
}


def extract_hand(source: Image.Image, polygon: list[tuple[int, int]]) -> Image.Image:
    mask = Image.new("L", CANVAS_SIZE, 0)
    ImageDraw.Draw(mask).polygon(polygon, fill=255)
    mask = mask.filter(ImageFilter.GaussianBlur(radius=0.6))

    layer = source.copy()
    layer.putalpha(ImageChops.darker(layer.getchannel("A"), mask))
    return layer


def main() -> None:
    source = Image.open(SOURCE).convert("RGBA")
    source = source.resize(CANVAS_SIZE, Image.Resampling.LANCZOS)

    for name, polygon in HAND_POLYGONS.items():
        output = ROOT / f"public/assets/nova-pet-{name}.png"
        extract_hand(source, polygon).save(output)
        print(f"Wrote {output.relative_to(ROOT)}")


if __name__ == "__main__":
    main()
