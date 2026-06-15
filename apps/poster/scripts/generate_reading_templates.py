from __future__ import annotations

import base64
import math
import random
import subprocess
from pathlib import Path

from PIL import Image, ImageDraw, ImageFilter, ImageFont


ROOT = Path(__file__).resolve().parents[1]
TEMPLATE_DIR = ROOT / "public" / "templates"
FIGMA_DIR = ROOT / "design" / "figma-import"
PREVIEW_DIR = ROOT / "design" / "previews"
TMP_DIR = ROOT / ".codex-tmp" / "templates"

W, H = 736, 944
FONT_PATH = Path("/System/Library/Fonts/Hiragino Sans GB.ttc")


def ensure_dirs() -> None:
    for folder in (TEMPLATE_DIR, FIGMA_DIR, PREVIEW_DIR, TMP_DIR):
        folder.mkdir(parents=True, exist_ok=True)


def rgba(hex_value: str, alpha: int = 255) -> tuple[int, int, int, int]:
    value = hex_value.lstrip("#")
    return tuple(int(value[i : i + 2], 16) for i in (0, 2, 4)) + (alpha,)


def font(size: int, bold: bool = False) -> ImageFont.FreeTypeFont:
    return ImageFont.truetype(str(FONT_PATH), size, index=1 if bold else 0)


def text(
    draw: ImageDraw.ImageDraw,
    xy: tuple[int, int],
    value: str,
    size: int,
    fill: str | tuple[int, int, int, int],
    *,
    bold: bool = False,
    anchor: str = "la",
    spacing: int = 8,
    align: str = "left",
    stroke_width: int = 0,
    stroke_fill: str | tuple[int, int, int, int] | None = None,
) -> None:
    draw.multiline_text(
        xy,
        value,
        font=font(size, bold),
        fill=fill,
        anchor=anchor,
        spacing=spacing,
        align=align,
        stroke_width=stroke_width,
        stroke_fill=stroke_fill,
    )


def centered_text(
    draw: ImageDraw.ImageDraw,
    box: tuple[int, int, int, int],
    value: str,
    size: int,
    fill: str | tuple[int, int, int, int],
    *,
    bold: bool = False,
) -> None:
    fnt = font(size, bold)
    bbox = draw.textbbox((0, 0), value, font=fnt)
    x = box[0] + (box[2] - box[0] - (bbox[2] - bbox[0])) / 2
    y = box[1] + (box[3] - box[1] - (bbox[3] - bbox[1])) / 2 - 2
    draw.text((x, y), value, font=fnt, fill=fill)


def shadow_round_rect(
    img: Image.Image,
    box: tuple[int, int, int, int],
    radius: int,
    fill: tuple[int, int, int, int],
    *,
    shadow: tuple[int, int, int, int] = (0, 0, 0, 46),
    blur: int = 18,
    offset: tuple[int, int] = (0, 8),
) -> None:
    shadow_layer = Image.new("RGBA", img.size, (0, 0, 0, 0))
    shadow_draw = ImageDraw.Draw(shadow_layer)
    shifted = (box[0] + offset[0], box[1] + offset[1], box[2] + offset[0], box[3] + offset[1])
    shadow_draw.rounded_rectangle(shifted, radius=radius, fill=shadow)
    img.alpha_composite(shadow_layer.filter(ImageFilter.GaussianBlur(blur)))
    ImageDraw.Draw(img).rounded_rectangle(box, radius=radius, fill=fill)


def rounded_gradient(
    img: Image.Image,
    box: tuple[int, int, int, int],
    radius: int,
    top: str,
    bottom: str,
) -> None:
    width = box[2] - box[0]
    height = box[3] - box[1]
    layer = Image.new("RGBA", (width, height), (0, 0, 0, 0))
    draw = ImageDraw.Draw(layer)
    top_color = rgba(top)
    bottom_color = rgba(bottom)
    for y in range(height):
      t = y / max(height - 1, 1)
      color = tuple(int(top_color[i] * (1 - t) + bottom_color[i] * t) for i in range(4))
      draw.line([(0, y), (width, y)], fill=color)
    mask = Image.new("L", (width, height), 0)
    ImageDraw.Draw(mask).rounded_rectangle((0, 0, width, height), radius=radius, fill=255)
    img.paste(layer, (box[0], box[1]), mask)


def clear_round_rect(img: Image.Image, box: tuple[int, int, int, int], radius: int) -> None:
    mask = Image.new("L", img.size, 0)
    ImageDraw.Draw(mask).rounded_rectangle(box, radius=radius, fill=255)
    img.paste((0, 0, 0, 0), (0, 0), mask)


def clear_ellipse(img: Image.Image, box: tuple[int, int, int, int]) -> None:
    mask = Image.new("L", img.size, 0)
    ImageDraw.Draw(mask).ellipse(box, fill=255)
    img.paste((0, 0, 0, 0), (0, 0), mask)


def star_points(cx: int, cy: int, r_outer: int, r_inner: int, points: int = 5) -> list[tuple[float, float]]:
    result = []
    for i in range(points * 2):
        angle = -math.pi / 2 + i * math.pi / points
        radius = r_outer if i % 2 == 0 else r_inner
        result.append((cx + math.cos(angle) * radius, cy + math.sin(angle) * radius))
    return result


def draw_book_icon(draw: ImageDraw.ImageDraw, x: int, y: int, scale: float = 1.0) -> None:
    w, h = int(86 * scale), int(64 * scale)
    draw.rounded_rectangle((x, y + 10, x + w, y + h), radius=int(12 * scale), fill=rgba("#FFFFFF"))
    draw.polygon([(x + 6, y + 12), (x + w // 2, y), (x + w // 2, y + h - 6), (x + 6, y + h)], fill=rgba("#4FD4A8"))
    draw.polygon([(x + w - 6, y + 12), (x + w // 2, y), (x + w // 2, y + h - 6), (x + w - 6, y + h)], fill=rgba("#6EA7FF"))
    draw.line((x + w // 2, y + 6, x + w // 2, y + h - 4), fill=rgba("#161616", 125), width=max(2, int(3 * scale)))


def draw_logo(draw: ImageDraw.ImageDraw, x: int, y: int, light: bool = False) -> None:
    draw.rounded_rectangle((x, y, x + 54, y + 54), radius=15, fill=rgba("#FFF7BF"))
    draw.ellipse((x + 13, y + 17, x + 23, y + 27), fill=rgba("#191919"))
    draw.ellipse((x + 31, y + 17, x + 41, y + 27), fill=rgba("#191919"))
    draw.arc((x + 15, y + 18, x + 39, y + 42), start=20, end=160, fill=rgba("#FF7B37"), width=4)
    text(draw, (x + 68, y + 10), "叫叫App", 28, "#FFFFFF" if light else "#151515", bold=True)


def draw_metric_chip(draw: ImageDraw.ImageDraw, box: tuple[int, int, int, int], label: str, value: str, fill: str, ink: str) -> None:
    draw.rounded_rectangle(box, radius=24, fill=rgba(fill, 232))
    text(draw, (box[0] + 22, box[1] + 14), label, 18, ink, bold=True)
    text(draw, (box[0] + 22, box[1] + 40), value, 27, ink, bold=True)


def template_04() -> Image.Image:
    img = Image.new("RGBA", (W, H), (0, 0, 0, 0))
    draw = ImageDraw.Draw(img)
    draw.rounded_rectangle((8, 8, W - 8, H - 8), radius=34, outline=rgba("#FFFFFF"), width=9)
    shadow_round_rect(img, (70, 42, 666, 136), 48, rgba("#FFE25C"), shadow=rgba("#6C4E00", 58), blur=14, offset=(0, 8))
    draw_book_icon(draw, 88, 56, 0.72)
    text(draw, (178, 62), "今日阅读 28 分钟", 42, "#191919", bold=True)
    draw_metric_chip(draw, (52, 166, 238, 244), "新词", "18 个", "#FFFFFF", "#151515")
    draw_metric_chip(draw, (500, 174, 684, 252), "连读", "12 天", "#151515", "#FFFFFF")
    for cx, cy, color in [(594, 312, "#FFE25C"), (95, 318, "#7AE7C7"), (650, 520, "#FFFFFF")]:
        draw.polygon(star_points(cx, cy, 24, 10), fill=rgba(color, 238))
    shadow_round_rect(img, (42, 594, 694, 892), 34, rgba("#101010", 242), shadow=rgba("#000000", 80), blur=24, offset=(0, 12))
    draw.rounded_rectangle((68, 620, 250, 666), radius=23, fill=rgba("#7AE7C7"))
    centered_text(draw, (68, 620, 250, 666), "理解力 +1", 22, "#101010", bold=True)
    text(draw, (72, 694), "故事\n读进眼睛里", 75, "#FFFFFF", bold=True, spacing=2)
    text(draw, (78, 842), "每一次看见，都是新的想象力", 25, "#FFE25C", bold=True)
    return img


def template_05() -> Image.Image:
    img = Image.new("RGBA", (W, H), (0, 0, 0, 0))
    rounded_gradient(img, (12, 12, 724, 932), 34, "#2A61F2", "#73E3FE")
    draw = ImageDraw.Draw(img)
    clear_round_rect(img, (62, 218, 674, 640), 42)
    draw.rounded_rectangle((62, 218, 674, 640), radius=42, outline=rgba("#FFFFFF"), width=10)
    draw.ellipse((58, 58, 112, 112), fill=rgba("#FFFFFF", 230))
    text(draw, (128, 68), "李瑞克", 27, "#FFFFFF", bold=True)
    draw_logo(draw, 474, 57, light=True)
    text(draw, (54, 142), "阅读 4234 字", 62, "#FFFFFF", bold=True)
    text(draw, (76, 682), "今天的故事库存", 26, "#FFFFFF", bold=True)
    metric_boxes = [
        ((76, 728, 244, 846), "生字", "18"),
        ((284, 728, 452, 846), "金句", "3"),
        ((492, 728, 660, 846), "表达", "9"),
    ]
    for box, label, value in metric_boxes:
        draw.rounded_rectangle(box, radius=24, fill=rgba("#FFFFFF", 235))
        text(draw, (box[0] + 24, box[1] + 22), label, 22, "#2763EF", bold=True)
        text(draw, (box[0] + 24, box[1] + 53), value, 45, "#101010", bold=True)
    draw.rounded_rectangle((420, 646, 658, 700), radius=27, fill=rgba("#101010", 210))
    centered_text(draw, (420, 646, 658, 700), "周四午间 · 家中", 23, "#FFFFFF", bold=True)
    return img


def template_06() -> Image.Image:
    img = Image.new("RGBA", (W, H), (0, 0, 0, 0))
    rounded_gradient(img, (12, 12, 724, 932), 34, "#FFF3B5", "#FF7C61")
    draw = ImageDraw.Draw(img)
    clear_round_rect(img, (368, 80, 684, 740), 38)
    draw.rounded_rectangle((368, 80, 684, 740), radius=38, outline=rgba("#101010"), width=7)
    draw.rounded_rectangle((50, 56, 222, 112), radius=28, fill=rgba("#FFFFFF", 220))
    centered_text(draw, (50, 56, 222, 112), "阅读成就", 23, "#151515", bold=True)
    text(draw, (56, 156), "连续\n阅读", 66, "#151515", bold=True, spacing=4)
    text(draw, (56, 318), "100 天", 76, "#FFFFFF", bold=True, stroke_width=4, stroke_fill=rgba("#151515"))
    text(draw, (60, 430), "这一页，\n是孩子自己翻过去的。", 30, "#151515", bold=True, spacing=10)
    for i in range(7):
        x = 58 + i * 42
        y = 558 + (i % 2) * 24
        draw.rounded_rectangle((x, y, x + 32, y + 32), radius=9, fill=rgba("#FFFFFF", 225))
        draw.line((x + 9, y + 17, x + 15, y + 23, x + 25, y + 10), fill=rgba("#FF6C4A"), width=4)
    draw.rounded_rectangle((54, 692, 326, 850), radius=28, fill=rgba("#151515", 230))
    text(draw, (78, 718), "本周完成", 23, "#FFD95B", bold=True)
    text(draw, (78, 760), "5 本绘本", 47, "#FFFFFF", bold=True)
    text(draw, (78, 823), "2026 · 06 · 24", 22, "#FFFFFF", bold=True)
    draw.polygon(star_points(626, 814, 54, 24), fill=rgba("#FFE25C"))
    text(draw, (574, 786), "棒", 43, "#151515", bold=True)
    return img


def dotted_line(draw: ImageDraw.ImageDraw, points: list[tuple[int, int]], fill: tuple[int, int, int, int], width: int = 6) -> None:
    for start, end in zip(points, points[1:]):
        sx, sy = start
        ex, ey = end
        length = math.hypot(ex - sx, ey - sy)
        steps = max(1, int(length // 18))
        for i in range(steps):
            if i % 2:
                continue
            t0 = i / steps
            t1 = min((i + 1) / steps, 1)
            draw.line((sx + (ex - sx) * t0, sy + (ey - sy) * t0, sx + (ex - sx) * t1, sy + (ey - sy) * t1), fill=fill, width=width)


def template_07() -> Image.Image:
    img = Image.new("RGBA", (W, H), (0, 0, 0, 0))
    draw = ImageDraw.Draw(img)
    draw.rounded_rectangle((8, 8, W - 8, H - 8), radius=34, outline=rgba("#FFFFFF"), width=9)
    shadow_round_rect(img, (46, 44, 690, 134), 45, rgba("#2FD68F"), shadow=rgba("#063D29", 70), blur=16, offset=(0, 8))
    text(draw, (80, 64), "本周阅读 5 本", 40, "#0C291E", bold=True)
    draw.rounded_rectangle((500, 66, 650, 112), radius=23, fill=rgba("#FFFFFF", 235))
    centered_text(draw, (500, 66, 650, 112), "路线图", 22, "#0C291E", bold=True)
    path = [(118, 220), (276, 300), (180, 438), (398, 512), (592, 438), (524, 612)]
    dotted_line(draw, path, rgba("#FFFFFF", 230), width=8)
    for index, (x, y) in enumerate(path, 1):
        draw.ellipse((x - 28, y - 28, x + 28, y + 28), fill=rgba("#FFE25C"))
        centered_text(draw, (x - 28, y - 28, x + 28, y + 28), str(index), 25, "#151515", bold=True)
    shadow_round_rect(img, (42, 670, 694, 890), 32, rgba("#FFFFFF", 238), shadow=rgba("#000000", 78), blur=20, offset=(0, 10))
    text(draw, (72, 702), "我在故事里走了 8 站", 45, "#151515", bold=True)
    text(draw, (74, 770), "最远的一站：森林里的月亮邮局", 27, "#3A7162", bold=True)
    draw.rounded_rectangle((74, 824, 274, 864), radius=20, fill=rgba("#2FD68F"))
    centered_text(draw, (74, 824, 274, 864), "想象力 +8", 21, "#0C291E", bold=True)
    draw.rounded_rectangle((304, 824, 544, 864), radius=20, fill=rgba("#FFE25C"))
    centered_text(draw, (304, 824, 544, 864), "表达欲正在上线", 21, "#151515", bold=True)
    return img


def template_08() -> Image.Image:
    img = Image.new("RGBA", (W, H), (0, 0, 0, 0))
    rounded_gradient(img, (12, 12, 724, 932), 34, "#16205C", "#8456FF")
    draw = ImageDraw.Draw(img)
    clear_ellipse(img, (66, 190, 670, 794))
    for offset, color, width in [(0, "#FFE25C", 8), (22, "#FFFFFF", 3), (44, "#FFE25C", 2)]:
        draw.ellipse((66 - offset, 190 - offset, 670 + offset, 794 + offset), outline=rgba(color, 230), width=width)
    text(draw, (64, 60), "安静阅读", 35, "#FFFFFF", bold=True)
    text(draw, (64, 102), "21 分钟", 64, "#FFE25C", bold=True)
    draw.rounded_rectangle((488, 64, 666, 126), radius=31, fill=rgba("#FFFFFF", 230))
    centered_text(draw, (488, 64, 666, 126), "专注值 96", 24, "#1B2362", bold=True)
    draw.rounded_rectangle((58, 754, 678, 888), radius=32, fill=rgba("#FFFFFF", 240))
    text(draw, (88, 786), "最喜欢的一句", 24, "#7166C5", bold=True)
    text(draw, (88, 824), "月亮也在听故事", 43, "#151515", bold=True)
    for cx, cy in [(116, 202), (604, 214), (636, 740), (92, 712)]:
        draw.polygon(star_points(cx, cy, 22, 9), fill=rgba("#FFE25C", 230))
    return img


TEMPLATES = [
    ("reading-template-04", "阅读分钟", template_04),
    ("reading-template-05", "字数实验室", template_05),
    ("reading-template-06", "连读成就", template_06),
    ("reading-template-07", "故事路线", template_07),
    ("reading-template-08", "安静阅读", template_08),
]


def export_webp(name: str, img: Image.Image) -> Path:
    png_path = TMP_DIR / f"{name}.png"
    webp_path = TEMPLATE_DIR / f"{name}.webp"
    img.save(png_path)
    subprocess.run(
        ["cwebp", "-quiet", "-q", "82", "-alpha_q", "92", "-m", "6", "-metadata", "none", str(png_path), "-o", str(webp_path)],
        check=True,
    )
    return webp_path


def cover(img: Image.Image, size: tuple[int, int]) -> Image.Image:
    src = img.convert("RGBA")
    sw, sh = src.size
    tw, th = size
    sr = sw / sh
    tr = tw / th
    if sr > tr:
        nw = int(sh * tr)
        left = (sw - nw) // 2
        src = src.crop((left, 0, left + nw, sh))
    else:
        nh = int(sw / tr)
        top = (sh - nh) // 2
        src = src.crop((0, top, sw, top + nh))
    return src.resize(size, Image.Resampling.LANCZOS)


def save_preview(generated: list[tuple[str, str, Image.Image]]) -> None:
    samples = [
        Image.open(TEMPLATE_DIR / "source-01.webp"),
        Image.open(TEMPLATE_DIR / "source-02.webp"),
        Image.open(TEMPLATE_DIR / "source-03.webp"),
        Image.open(TEMPLATE_DIR / "source-01.webp"),
        Image.open(TEMPLATE_DIR / "source-02.webp"),
    ]
    thumb_w = 220
    thumb_h = round(thumb_w * H / W)
    margin = 30
    sheet = Image.new("RGBA", (margin * 6 + thumb_w * 5, thumb_h + 96), rgba("#F6F0E7"))
    sheet_draw = ImageDraw.Draw(sheet)
    for index, ((name, label, template), sample) in enumerate(zip(generated, samples)):
        x = margin + index * (thumb_w + margin)
        y = 30
        base = cover(sample, (W, H))
        base.alpha_composite(template)
        thumb = base.resize((thumb_w, thumb_h), Image.Resampling.LANCZOS)
        sheet.alpha_composite(thumb, (x, y))
        text(sheet_draw, (x, y + thumb_h + 16), f"{index + 4}. {label}", 20, "#171717", bold=True)
    sheet.save(PREVIEW_DIR / "reading-template-pack-preview.png")


def save_figma_sources(generated: list[tuple[str, str, Image.Image]]) -> None:
    individual = []
    for name, label, _ in generated:
        png_path = TMP_DIR / f"{name}.png"
        data = base64.b64encode(png_path.read_bytes()).decode("ascii")
        svg = f'''<svg width="{W}" height="{H}" viewBox="0 0 {W} {H}" fill="none" xmlns="http://www.w3.org/2000/svg">
  <title>{label}</title>
  <image width="{W}" height="{H}" href="data:image/png;base64,{data}" />
</svg>
'''
        path = FIGMA_DIR / f"{name}.svg"
        path.write_text(svg, encoding="utf-8")
        individual.append((name, label, data))

    gap = 48
    label_h = 54
    pack_w = W * len(individual) + gap * (len(individual) - 1)
    pack_h = H + label_h
    groups = []
    for index, (name, label, data) in enumerate(individual):
        x = index * (W + gap)
        groups.append(
            f'''  <g id="{name}" transform="translate({x} 0)">
    <image width="{W}" height="{H}" href="data:image/png;base64,{data}" />
    <text x="0" y="{H + 36}" fill="#171717" font-family="PingFang SC, Hiragino Sans GB, sans-serif" font-size="24" font-weight="700">{index + 4}. {label}</text>
  </g>'''
        )
    pack_svg = f'''<svg width="{pack_w}" height="{pack_h}" viewBox="0 0 {pack_w} {pack_h}" fill="none" xmlns="http://www.w3.org/2000/svg">
  <title>阅读打卡海报新增五套模板</title>
{chr(10).join(groups)}
</svg>
'''
    (FIGMA_DIR / "reading-template-pack.svg").write_text(pack_svg, encoding="utf-8")


def main() -> None:
    ensure_dirs()
    random.seed(7)
    generated = []
    for name, label, factory in TEMPLATES:
        img = factory()
        export_webp(name, img)
        generated.append((name, label, img))
    save_preview(generated)
    save_figma_sources(generated)


if __name__ == "__main__":
    main()
