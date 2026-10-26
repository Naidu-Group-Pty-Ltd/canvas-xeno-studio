#!/usr/bin/env python3
"""The teaser's storyboard for review: one real frame from the films per beat, the teaser's own words laid over
the film's caption in the series' type, and the beat's time, picture and voice beneath it. A review aid only:
the teaser itself is drawn again from the films' scene code, with their captions off."""
import subprocess
import sys
from pathlib import Path

from PIL import Image, ImageDraw, ImageFilter, ImageFont

OUT = Path(sys.argv[1])  # e.g. docs/brands/aurixa-teaser/storyboard.jpg (saved at quality 82)
TMP = OUT.parent / "board-frames"
TMP.mkdir(parents=True, exist_ok=True)
WORK = Path("/home/user/canvas-xeno-studio/.xeno-work")
FILMS = {
    1: WORK / "e9b6fa24-2571-4cbb-83c8-18b7aabd2c9e/files/delivery/aurixa-systems-reel-1-final-1080x1920.mp4",
    2: WORK / "29ad590c-1f57-4a84-92de-f2652b78f3a3/files/delivery/aurixa-systems-reel-2-final-1080x1920.mp4",
    3: WORK / "8cf0b42c-6866-499b-8ce6-1035c66a4417/files/delivery/aurixa-systems-reel-3-final-1080x1920.mp4",
}
FONTS = WORK / "8cf0b42c-6866-499b-8ce6-1035c66a4417/files/fonts"
PF = str(FONTS / "playfair-display-500.ttf")
PFI = str(FONTS / "playfair-display-500-italic.ttf")
MONO = str(FONTS / "inconsolata-700.ttf")
INTER = "/usr/share/fonts/opentype/inter/Inter-Regular.otf"
INTER_SB = "/usr/share/fonts/opentype/inter/Inter-SemiBold.otf"

GROUND = (4, 11, 22)
NAVY = (10, 25, 47)
GOLD = (215, 179, 95)
INK = (255, 255, 255)
MUTED = (183, 193, 208)

# (number, time, title, frame source or None, its time, caption (text, emphasis), eyebrow, picture, voice)
BEATS = [
    ("1", "0:00.0–0:01.9", "The map", 1, 0.5, None, None, "film",
     "Film 1, 0:00.5–0:02.4: pins rain onto Australia, one turns gold", "None: the music"),
    ("2", "0:01.9–0:03.7", "One property", 2, 1.45, None, None, "film",
     "Film 2, 0:00.0–0:01.9: 14 Wattle Grove, the professionals lighting up", "Film 2: “One property,”"),
    ("3", "0:03.7–0:05.6", "The client waiting", 1, 28.2, None, None, "film",
     "Film 1, 0:26.8–0:28.6", "Film 1: “And the client is waiting.”"),
    ("4", "0:05.6–0:07.4", "The checks", 2, 14.7, None, None, "film",
     "Film 2, 0:13.4–0:15.3", "Film 2: “Another identity check,”"),
    ("5", "0:07.4–0:09.3", "The question", 3, 5.45, None, None, "film",
     "Film 3, 0:04.3–0:05.4, then Film 1's gold hairline in silence", "Film 3: “Can they afford it?”"),
    ("6", "0:09.3–0:13.0", "The drop", 3, 17.5, None, None, "film",
     "Film 3, 0:14.9–0:18.6: light sweeps in, the logo leaps out", "Film 3: “With Aurixa Systems, everything changes.”"),
    ("7", "0:13.0–0:16.7", "Film 1 · One system", 1, 44.3, ("designed around how property professionals actually work.", "actually work."), "FILM 1 · ONE SYSTEM", "film",
     "Film 1, 0:40.8–0:44.5: the portals around the Command Centre",
     "Film 1: “designed around how property professionals actually work.”"),
    ("8", "0:16.7–0:20.5", "Film 2 · One passport", 2, 50.3, ("One digital passport,", "One digital passport,"), "FILM 2 · ONE PASSPORT", "film",
     "Film 2, 0:49.0–0:52.7: the Passport, its clasp, its first page",
     "Film 2: “One digital passport, one organised client record,”"),
    ("9", "0:20.5–0:24.2", "Film 3 · One click", 3, 30.98, ("With just one click,", "one click,"), "FILM 3 · ONE CLICK", "film",
     "Film 3, 0:27.9–0:31.7: the press lands on the bar, the capacity counts in", "Film 3: “With just one click,”"),
    ("10", "0:24.2–0:26.0", "The whole system", 3, 94.3, None, None, "film",
     "Film 3, 1:33.0–1:34.9: the pull back to the Command Centre", "Film 3: “And that's just the beginning.”"),
    ("11", "0:26.0–0:27.9", "On the bass hit", None, None, ("One ", "property."), None, "statement",
     "New type", "None: the hit"),
    ("12", "0:27.9–0:29.8", "On the bass hit", None, None, ("Three ", "films."), None, "statement",
     "New type", "None: the hit"),
    ("13", "0:29.8–0:35.0", "The brand", 3, 122.5, None, None, "lockup",
     "Reel 1's living logo, as the films close; new type",
     "Film 3: “Aurixa Systems, the operating system for modern property professionals.”"),
]


def grab(film: int, t: float) -> Image.Image:
    out = TMP / f"film{film}-{t:.1f}.png"
    if not out.exists():
        subprocess.run(["ffmpeg", "-v", "error", "-y", "-ss", str(t), "-i", str(FILMS[film]), "-frames:v", "1",
                        str(out)], check=True)
    return Image.open(out).convert("RGB")


def text_width(draw, text, font):
    return draw.textlength(text, font=font)


def caption(img: Image.Image, text: str, emphasis: str, style: str) -> None:
    """The film's caption band softened away, and the teaser's line set in its place, as the films set theirs."""
    band = (0, 1270, 1080, 1610)
    img.paste(img.crop(band).filter(ImageFilter.GaussianBlur(40)), band[:2])
    d = ImageDraw.Draw(img, "RGBA")
    f, fi = ImageFont.truetype(PF, 46), ImageFont.truetype(PFI, 46)
    # Words into lines no wider than 820 px, the emphasis set in italic.
    words, lines, line = text.split(" "), [], []
    emph = set(emphasis.split(" "))
    for w in words:
        trial = line + [w]
        width = sum(text_width(d, x + " ", fi if x in emph else f) for x in trial)
        if line and width > 820:
            lines.append(line)
            line = [w]
        else:
            line = trial
    lines.append(line)
    h = 64 * len(lines) + 44
    top = 1440 - h // 2
    if style == "light":
        d.rectangle((110, top, 970, top + h), fill=(252, 252, 253, 255))
        ink, em = (55, 65, 81), (17, 24, 39)
    else:
        d.rectangle((110, top, 970, top + h), fill=(11, 22, 44, 225), outline=(*GOLD, 90), width=2)
        ink, em = (232, 236, 242), GOLD
    y = top + 22
    for ln in lines:
        width = sum(text_width(d, x + " ", fi if x in emph else f) for x in ln)
        x = 540 - width / 2
        for w in ln:
            fnt = fi if w in emph else f
            d.text((x, y), w, font=fnt, fill=em if w in emph else ink)
            x += text_width(d, w + " ", fnt)
        y += 64


def eyebrow(img: Image.Image, text: str) -> None:
    d = ImageDraw.Draw(img, "RGBA")
    f = ImageFont.truetype(MONO, 34)
    spaced = [(c, text_width(d, c, f) + 9) for c in text]
    width = sum(w for _, w in spaced)
    x = 540 - width / 2
    d.rectangle((540 - width / 2 - 28, 1218, 540 + width / 2 + 28, 1280), fill=(4, 11, 22, 210))
    for c, w in spaced:
        d.text((x, 1230), c, font=f, fill=GOLD)
        x += w
    d.line((540 - 60, 1290, 540 + 60, 1290), fill=(*GOLD, 200), width=2)


def labelled_caption(img: Image.Image, label: str, text: str, emphasis: str) -> None:
    """The film's label set inside the caption's own glass panel: the zone the films keep clear of picture."""
    d = ImageDraw.Draw(img, "RGBA")
    f, fi, m = ImageFont.truetype(PF, 46), ImageFont.truetype(PFI, 46), ImageFont.truetype(MONO, 30)
    emph = set(emphasis.split(" "))
    words, lines, line = text.split(" "), [], []
    for w in words:
        trial = line + [w]
        width = sum(text_width(d, x + " ", fi if x in emph else f) for x in trial)
        if line and width > 800:
            lines.append(line)
            line = [w]
        else:
            line = trial
    lines.append(line)
    h = 22 + 36 + 16 + 64 * len(lines) + 20
    top = 1440 - h // 2
    d.rectangle((100, top, 980, top + h), fill=(11, 22, 44, 255), outline=(*GOLD, 110), width=2)
    spaced = [(c, text_width(d, c, m) + 8) for c in label]
    x = 540 - sum(w for _, w in spaced) / 2
    for c, w in spaced:
        d.text((x, top + 22), c, font=m, fill=GOLD)
        x += w
    y = top + 22 + 36 + 16
    for ln in lines:
        width = sum(text_width(d, x + " ", fi if x in emph else f) for x in ln)
        x = 540 - width / 2
        for w in ln:
            fnt = fi if w in emph else f
            d.text((x, y), w, font=fnt, fill=GOLD if w in emph else (232, 236, 242))
            x += text_width(d, w + " ", fnt)
        y += 64


def statement(first: str, key: str) -> Image.Image:
    img = Image.new("RGB", (1080, 1920), GROUND)
    glow = Image.new("RGB", (1080, 1920), NAVY).filter(ImageFilter.GaussianBlur(1))
    mask = Image.new("L", (1080, 1920), 0)
    ImageDraw.Draw(mask).ellipse((40, 560, 1040, 1360), fill=150)
    img = Image.composite(glow, img, mask.filter(ImageFilter.GaussianBlur(160)))
    d = ImageDraw.Draw(img)
    f, fi = ImageFont.truetype(PF, 118), ImageFont.truetype(PFI, 118)
    w = text_width(d, first, f) + text_width(d, key, fi)
    x = 540 - w / 2
    d.text((x, 890), first, font=f, fill=INK)
    d.text((x + text_width(d, first, f), 890), key, font=fi, fill=GOLD)
    return img


def lockup(frame: Image.Image) -> Image.Image:
    img = frame.copy()
    d = ImageDraw.Draw(img, "RGBA")
    f = ImageFont.truetype(PF, 50)
    for i, ln in enumerate(["The operating system for", "modern property professionals."]):
        d.text((540 - text_width(d, ln, f) / 2, 1300 + i * 66), ln, font=f, fill=INK)
    m = ImageFont.truetype(MONO, 32)
    rl = "THREE FILMS · [YOUR RELEASE LINE]"
    spaced = [(c, text_width(d, c, m) + 7) for c in rl]
    x = 540 - sum(w for _, w in spaced) / 2
    for c, w in spaced:
        d.text((x, 1480), c, font=m, fill=GOLD)
        x += w
    return img


CELL_W, CELL_H, TEXT_H, PAD = 360, 640, 250, 22
COLS = 5
rows = (len(BEATS) + COLS - 1) // COLS
W = COLS * (CELL_W + PAD) + PAD
H = 170 + rows * (CELL_H + TEXT_H + PAD) + PAD
board = Image.new("RGB", (W, H), GROUND)
d = ImageDraw.Draw(board)
d.text((PAD, 34), "Aurixa Systems · Teaser · storyboard for review", font=ImageFont.truetype(PF, 44), fill=INK)
d.text((PAD, 104), "One frame per beat, from the films themselves: each film's own caption is the line the teaser takes from it.",
       font=ImageFont.truetype(INTER, 24), fill=MUTED)

for i, (num, t, title, film, ft, cap, eb, style, pic, voice) in enumerate(BEATS):
    if style == "statement":
        img = statement(*cap)
    else:
        img = grab(film, ft)
        if style == "lockup":
            img = lockup(img)
        elif eb:
            labelled_caption(img, eb, cap[0], cap[1])
    x = PAD + (i % COLS) * (CELL_W + PAD)
    y = 170 + (i // COLS) * (CELL_H + TEXT_H + PAD)
    board.paste(img.resize((CELL_W, CELL_H), Image.LANCZOS), (x, y))
    d.rectangle((x - 1, y - 1, x + CELL_W, y + CELL_H), outline=(40, 58, 88), width=1)
    ty = y + CELL_H + 14
    d.text((x, ty), f"{num} · {t}", font=ImageFont.truetype(MONO, 22), fill=GOLD)
    d.text((x, ty + 32), title, font=ImageFont.truetype(INTER_SB, 22), fill=INK)
    small = ImageFont.truetype(INTER, 17)

    def wrap(text, top):
        words, line, yy = text.split(" "), "", top
        for w in words:
            trial = (line + " " + w).strip()
            if d.textlength(trial, font=small) > CELL_W:
                d.text((x, yy), line, font=small, fill=MUTED)
                yy += 22
                line = w
            else:
                line = trial
        d.text((x, yy), line, font=small, fill=MUTED)
        return yy + 22

    yy = wrap("Picture: " + pic, ty + 66)
    wrap("Voice: " + voice, yy + 6)

board.save(OUT, quality=88)
print(OUT, board.size)
