#!/usr/bin/env python
# -*- coding: utf-8 -*-
"""
prepare-assets.py — build every image the site ships.

Sources are the *real* screenshots that already exist in the local repos, so the
portfolio shows the actual product instead of mockups. Everything is re-encoded
to WebP (quality 82) and capped at 1800px wide, which is 2x the largest size the
grid ever renders.

usage:  python tools/prepare-assets.py
"""
from __future__ import print_function
import os
import sys
from PIL import Image

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
DOCS = os.path.join(ROOT, "docs")
GH = os.path.dirname(ROOT)          # D:\github  — sibling repo working copies

OUT_PROJ = os.path.join(DOCS, "assets", "img", "projects")
OUT_QR = os.path.join(DOCS, "assets", "img", "qr")
OUT_IMG = os.path.join(DOCS, "assets", "img")
BASE = OUT_IMG                     # every generated shot lives under this root

MAXW = 1800
Q = 82

# src  →  dst (relative to docs/)
SHOTS = [
    # SrcBox — Windows IPTV player
    (r"SrcBox\docs\screenshots\main.png",                 "projects/srcbox-01.webp"),
    (r"SrcBox\docs\screenshots\epg.png",                  "projects/srcbox-02.webp"),
    (r"SrcBox\docs\screenshots\multiscreen.png",          "projects/srcbox-03.webp"),
    (r"SrcBox\docs\screenshots\settings.png",             "projects/srcbox-04.webp"),
    (r"SrcBox\docs\screenshots\web-remote-full-dark.png", "projects/srcbox-05.webp"),
    # channel-sentinel — stream checker
    #   note: github.com/CGG888/Iptv-Checker is a *rename redirect* to this same
    #   repo, so it is deliberately not treated as a second project.
    (r"channel-sentinel\public\preview.png",              "projects/sentinel-01.webp"),
    (r"channel-sentinel\public\preview2.png",             "projects/sentinel-02.webp"),
]

# payment QRs live in the workspace root; they are PNG on purpose — a lossy
# re-encode is the one thing that could stop a phone from reading them.
QRS = [
    ("微信收款码.png",   "qr/wechat.png"),
    ("支付宝收款码.png", "qr/alipay.png"),
]


def ensure(p):
    d = os.path.dirname(p)
    if d and not os.path.isdir(d):
        os.makedirs(d)


def kb(path):
    return os.path.getsize(path) / 1024.0


def shoot(src, dst_rel):
    dst = os.path.join(BASE, dst_rel.replace("/", os.sep))
    ensure(dst)
    im = Image.open(src)
    im = im.convert("RGB")
    w, h = im.size
    if w > MAXW:
        im = im.resize((MAXW, max(1, round(h * MAXW / float(w)))), Image.LANCZOS)
    im.save(dst, "WEBP", quality=Q, method=6)
    print("  %-42s %5dx%-5d -> %5dx%-5d  %7.1f KB  (%s)"
          % (os.path.basename(dst_rel), w, h, im.size[0], im.size[1], kb(dst), dst_rel))


def qr(src, dst_rel):
    dst = os.path.join(BASE, dst_rel.replace("/", os.sep))
    ensure(dst)
    im = Image.open(src)
    if im.mode != "RGB":
        im = im.convert("RGB")
    w, h = im.size
    cap = 1000
    if max(w, h) > cap:
        s = cap / float(max(w, h))
        im = im.resize((round(w * s), round(h * s)), Image.LANCZOS)
    im.save(dst, "PNG", optimize=True)
    print("  %-42s %5dx%-5d -> %5dx%-5d  %7.1f KB  (%s)"
          % (os.path.basename(src), w, h, im.size[0], im.size[1], kb(dst), dst_rel))
    return dst


def og_card(dst):
    """1200x630 Open Graph card, drawn in the same cyberpunk-neon key as the site:
    near-black ground, cyan/magenta glow, monospace latin, bold han headline."""
    from PIL import ImageDraw, ImageFont, ImageFilter

    W, H = 1200, 630
    BG = (10, 10, 15)          # --bg   #0a0a0f
    CY = (0, 255, 255)         # --cy
    MG = (255, 0, 255)         # --mg
    FG = (233, 247, 255)       # --fg
    DIM = (120, 150, 165)
    GRID = (22, 46, 52)

    im = Image.new("RGBA", (W, H), BG + (255,))
    d = ImageDraw.Draw(im)

    # engineering grid
    for x in range(0, W, 60):
        d.line([(x, 0), (x, H)], fill=GRID + (255,), width=1)
    for y in range(0, H, 60):
        d.line([(0, y), (W, y)], fill=GRID + (255,), width=1)

    def pick(*cands):
        for c in cands:
            if c and os.path.isfile(c):
                return c
        raise SystemExit("no usable font among %s" % (cands,))

    WINFONTS = r"C:\Windows\Fonts"
    han = ImageFont.truetype(pick(os.path.join(WINFONTS, "msyhbd.ttc"),
                                 os.path.join(WINFONTS, "simhei.ttf"),
                                 os.path.join(WINFONTS, "simsun.ttc")), 86)
    han_s = ImageFont.truetype(pick(os.path.join(WINFONTS, "msyh.ttc"),
                                   os.path.join(WINFONTS, "simsun.ttc")), 26)
    mono = ImageFont.truetype(pick(os.path.join(WINFONTS, "consola.ttf"),
                                  os.path.join(WINFONTS, "cour.ttf")), 21)
    mono_s = ImageFont.truetype(pick(os.path.join(WINFONTS, "consola.ttf"),
                                    os.path.join(WINFONTS, "cour.ttf")), 17)

    def neon(xy, text, font, color, blur=16, anchor=None, strength=190):
        layer = Image.new("RGBA", (W, H), (0, 0, 0, 0))
        ImageDraw.Draw(layer).text(xy, text, font=font, fill=color + (strength,), anchor=anchor)
        im.alpha_composite(layer.filter(ImageFilter.GaussianBlur(blur)))
        ImageDraw.Draw(im).text(xy, text, font=font, fill=color + (255,), anchor=anchor)

    M = 68
    # top rule + labels
    d.line([(M, 96), (W - M, 96)], fill=(0, 255, 255, 70), width=1)
    d.text((M, 62), "MTOO.VIP", font=mono, fill=CY + (255,))
    d.text((W - M, 62), "SELF-PORTRAIT / 001", font=mono, fill=DIM + (255,), anchor="ra")

    # headline, two lines, second one indented
    neon((M, 150), "别人笑我太疯癫", han, CY, blur=20)
    neon((M + 74, 262), "我笑他人看不穿", han, MG, blur=20)

    # bottom rule + meta
    d.line([(M, 470), (W - M, 470)], fill=(0, 255, 255, 70), width=1)
    d.text((M, 496), "CGG888 · 超哥哥", font=han_s, fill=FG + (255,))
    d.text((M, 536), "IPTV · STREAMING · SELF-HOSTED", font=mono_s, fill=DIM + (255,))
    d.text((W - M, 540), "NO ADS · NO ACCOUNTS · OPEN SOURCE", font=mono_s, fill=DIM + (255,), anchor="ra")

    ensure(dst)
    im.convert("RGB").save(dst, "PNG", optimize=True)
    print("  %-42s %5dx%-5d -> %5dx%-5d  %7.1f KB  (og card)"
          % ("(generated)", W, H, W, H, kb(dst)))


def main():
    print("· project shots")
    for rel, dst in SHOTS:
        src = os.path.join(GH, rel)
        if not os.path.isfile(src):
            print("  ! missing source: %s" % src)
            continue
        shoot(src, dst)

    print("· payment QRs")
    for rel, dst in QRS:
        src = os.path.join(ROOT, rel)
        if not os.path.isfile(src):
            print("  ! missing source: %s" % src)
            continue
        qr(src, dst)

    print("· open graph")
    og_card(os.path.join(OUT_IMG, "og.png"))

    contact_sheet()
    print("· done")


def contact_sheet():
    """One labelled overview of every shot, for a fast human eyeball.
       Written to tools/ so it never ships with the site."""
    from PIL import ImageDraw, ImageFont
    files = sorted(os.listdir(OUT_PROJ))
    if not files:
        return
    cols, cw, ch, pad, cap = 4, 420, 250, 14, 22
    rows = (len(files) + cols - 1) // cols
    sheet = Image.new("RGB", (cols * (cw + pad) + pad, rows * (ch + cap + pad) + pad), (10, 10, 15))
    d = ImageDraw.Draw(sheet)
    f = ImageFont.truetype(os.path.join(r"C:\Windows\Fonts", "consola.ttf"), 17)
    for i, name in enumerate(files):
        im = Image.open(os.path.join(OUT_PROJ, name)).convert("RGB")
        im.thumbnail((cw, ch), Image.LANCZOS)
        x = pad + (i % cols) * (cw + pad)
        y = pad + (i // cols) * (ch + cap + pad)
        sheet.paste(im, (x, y + (ch - im.size[1]) // 2))
        d.text((x, y + ch + 4), name, font=f, fill=(0, 255, 255))
    out = os.path.join(ROOT, "tools", "_contact-sheet.png")
    sheet.save(out, "PNG", optimize=True)
    print("  contact sheet -> %s (%d shots)" % (os.path.relpath(out, ROOT), len(files)))


if __name__ == "__main__":
    main()
