#!/usr/bin/env python3
"""Turn the raw sprite rips in assets/src/ into engine-ready art in assets/gen/.

Nothing in assets/gen/ is hand-edited -- re-running this script must reproduce it
byte for byte. Run it from the project root:

    python3 tools/build_assets.py

It produces four things:

  atlas.png / atlas.json   every sprite, packed into one texture (Phaser JSON-Hash)
  tileset.png              the handful of terrain tiles, on a strict grid
  tiles.json               tile-index constants, so the level array stays readable
  font.png / font.xml      the SMW HUD font as an AngelCode bitmap font

Why the sheets need this much work:

  * mario-objects.png and mario-enemies.png are RGB with a colour-key, not alpha.
    Left alone they render with hot-pink and blue rectangles around every sprite.
  * The rips are 2x nearest-neighbour upscales of the 16x16 SNES originals, but
    smw-mario.png and the SMB1 sheets are 1x. Everything is normalised to 2x here
    so the game can use a single world scale.
  * Transparent pixels carry leftover background colour (MS-Paint green in the
    Mario sheet). Under any filtered sampling that bleeds a halo, so the RGB of
    transparent pixels is overwritten with their nearest opaque neighbour.
  * Nothing is on a uniform grid, so a tileset for TilemapLayer has to be
    repacked from scratch.
"""

from __future__ import annotations

import json
import os
from collections import deque

import numpy as np
from PIL import Image

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
SRC = os.path.join(ROOT, "assets", "src")
GEN = os.path.join(ROOT, "assets", "gen")

TILE = 32          # world tile size, = 16 native px at 2x
EXTRUDE = 1        # tileset edge extrusion, kills seams at fractional zoom
ATLAS_PAD = 2      # transparent gutter between packed frames


# --------------------------------------------------------------------------
# loading and cleanup
# --------------------------------------------------------------------------

def load(name: str) -> np.ndarray:
    """Load a source sheet as an RGBA uint8 array with a real alpha channel."""
    im = Image.open(os.path.join(SRC, name))
    # A PNG colour-key (tRNS) survives .convert('RGBA') as alpha=0, but the RGB
    # underneath is left as the key colour, which is exactly the bleed we strip
    # in defringe() below.
    return np.array(im.convert("RGBA"))


def defringe(a: np.ndarray, passes: int = 4) -> np.ndarray:
    """Overwrite the RGB of transparent pixels with their nearest opaque colour.

    Alpha is untouched -- this only changes pixels you cannot see, so that
    bilinear sampling at the sprite edge blends toward the sprite's own colour
    instead of toward leftover magenta or MS-Paint green.
    """
    a = a.copy()
    rgb, alpha = a[..., :3], a[..., 3]
    known = alpha > 0
    for _ in range(passes):
        if known.all():
            break
        # Sum the colour of known neighbours in the 4 cardinal directions.
        total = np.zeros(rgb.shape, np.uint16)
        count = np.zeros(alpha.shape, np.uint8)
        for dy, dx in ((-1, 0), (1, 0), (0, -1), (0, 1)):
            sh_rgb = np.roll(rgb, (dy, dx), (0, 1))
            sh_known = np.roll(known, (dy, dx), (0, 1))
            total += sh_rgb * sh_known[..., None]
            count += sh_known
        fill = (count > 0) & ~known
        with np.errstate(invalid="ignore"):
            avg = (total // np.maximum(count, 1)[..., None]).astype(np.uint8)
        rgb[fill] = avg[fill]
        known |= fill
    a[..., :3] = rgb
    return a


def upscale(a: np.ndarray, factor: int = 2) -> np.ndarray:
    """Exact nearest-neighbour upscale (no resampling, no new colours)."""
    return a.repeat(factor, axis=0).repeat(factor, axis=1)


def chroma(a: np.ndarray, colour: tuple[int, int, int]) -> np.ndarray:
    """Knock out a flat background colour that was saved as opaque pixels."""
    a = a.copy()
    a[..., 3] = np.where((a[..., :3] == colour).all(axis=-1), 0, a[..., 3])
    return a


# smw-mario.png was ripped in two sittings and carries two near-identical
# palettes. Most of the poses the game uses are in the first, but small Mario's
# sprint lean (band 0, c0/c7) is in the second, so animating it against its
# neighbours shifted Mario's whole tone. These twelve entries alias the second
# palette onto the first. Ten of them move only 3-9 units; the outline black
# ((41,41,41) -> pure black) and the two overall-button yellows move much
# further, which is exactly why this is a written-out table and not a
# nearest-colour snap -- no single distance threshold catches those three
# without also eating the near-greys and near-reds of the other power-ups.
SMW_MARIO_ALIASES = {
    (41, 41, 41): (0, 0, 0),            # outline
    (140, 90, 24): (143, 88, 31),       # boots / hair
    (255, 214, 198): (255, 208, 192),   # skin
    (255, 115, 107): (255, 112, 111),   # cap highlight
    (255, 255, 255): (255, 248, 255),   # gloves
    (181, 41, 99): (176, 40, 96),       # cap shadow
    (66, 132, 156): (64, 128, 159),     # overalls shadow
    (255, 66, 115): (255, 64, 112),     # cap
    (33, 49, 140): (32, 48, 143),       # overalls
    (132, 222, 206): (128, 216, 207),   # shirt
    (255, 255, 156): (255, 216, 112),   # buttons highlight
    (255, 222, 0): (223, 160, 63),      # buttons
}


def realias(a: np.ndarray, aliases: dict) -> np.ndarray:
    """Fold duplicate palette entries onto one canonical colour.

    Exact matches only, and alpha is untouched, so frame bounds and therefore
    the packed atlas layout are unaffected -- only pixel colour changes.

    Every match is tested against the *original* pixels, so adding an entry
    whose destination is another entry's source cannot double-map and the
    result does not depend on the order the table is written in.
    """
    out = a.copy()
    src_rgb, dst_rgb = a[..., :3], out[..., :3]
    for src, dst in aliases.items():
        dst_rgb[(src_rgb == src).all(axis=-1)] = dst
    return out


def sheet(name: str, scale: int = 1, key: tuple[int, int, int] | None = None,
          aliases: dict | None = None) -> np.ndarray:
    a = load(name)
    if key is not None:
        a = chroma(a, key)
    if aliases:
        a = realias(a, aliases)
    a = defringe(a)
    return upscale(a, scale) if scale > 1 else a


# --------------------------------------------------------------------------
# frame extraction
# --------------------------------------------------------------------------

def tight(a: np.ndarray, x: int, y: int, w: int, h: int) -> tuple[int, int, int, int]:
    """Shrink a rect to the bounding box of its opaque pixels."""
    sub = a[y:y + h, x:x + w, 3] > 0
    if not sub.any():
        return x, y, w, h
    rows, cols = np.where(sub.any(axis=1))[0], np.where(sub.any(axis=0))[0]
    return (x + int(cols[0]), y + int(rows[0]),
            int(cols[-1] - cols[0]) + 1, int(rows[-1] - rows[0]) + 1)


def blob_at(a: np.ndarray, sx: int, sy: int, search: int = 40) -> tuple[int, int, int, int]:
    """Bounding box of the connected opaque blob nearest to a seed point.

    Lets the tables below name a rough coordinate and get an exact rect, so the
    numbers stay readable and stay correct if a rect is off by a pixel or two.
    """
    op = a[..., 3] > 0
    H, W = op.shape
    if not op[sy, sx]:  # walk outward to the closest opaque pixel
        best = None
        for dy in range(-search, search + 1):
            for dx in range(-search, search + 1):
                ny, nx = sy + dy, sx + dx
                if 0 <= ny < H and 0 <= nx < W and op[ny, nx]:
                    d = dy * dy + dx * dx
                    if best is None or d < best[0]:
                        best = (d, ny, nx)
        if best is None:
            raise ValueError(f"no opaque pixel near ({sx},{sy})")
        sy, sx = best[1], best[2]
    seen = np.zeros_like(op)
    q = deque([(sy, sx)])
    seen[sy, sx] = True
    x0 = x1 = sx
    y0 = y1 = sy
    while q:
        cy, cx = q.popleft()
        x0, x1 = min(x0, cx), max(x1, cx)
        y0, y1 = min(y0, cy), max(y1, cy)
        for dy in (-1, 0, 1):
            for dx in (-1, 0, 1):
                ny, nx = cy + dy, cx + dx
                if 0 <= ny < H and 0 <= nx < W and op[ny, nx] and not seen[ny, nx]:
                    seen[ny, nx] = True
                    q.append((ny, nx))
    return x0, y0, x1 - x0 + 1, y1 - y0 + 1


def row_bands(a: np.ndarray) -> list[tuple[int, int]]:
    """Split a sheet into horizontal bands separated by fully transparent rows."""
    rows = (a[..., 3] > 0).any(axis=1)
    bands, start = [], None
    for y, filled in enumerate(rows):
        if filled and start is None:
            start = y
        elif not filled and start is not None:
            bands.append((start, y - 1))
            start = None
    if start is not None:
        bands.append((start, len(rows) - 1))
    return bands


def col_runs(a: np.ndarray, top: int, bottom: int) -> list[tuple[int, int]]:
    """Split a band into sprites separated by fully transparent columns."""
    cols = (a[top:bottom + 1, :, 3] > 0).any(axis=0)
    runs, start = [], None
    for x, filled in enumerate(cols):
        if filled and start is None:
            start = x
        elif not filled and start is not None:
            runs.append((start, x - start))
            start = None
    if start is not None:
        runs.append((start, len(cols) - start))
    return runs


def grid_slice(a: np.ndarray, prefix: str, min_px: int = 12) -> dict:
    """Slice a sheet into every sprite it contains, named <prefix>_r<band>_c<col>.

    Pose identification lives in src/frames.js instead of here -- this stays
    mechanical so it never needs revisiting when the game wants a new pose.
    """
    frames = {}
    for bi, (top, bottom) in enumerate(row_bands(a)):
        for ci, (x, w) in enumerate(col_runs(a, top, bottom)):
            if w < min_px or (bottom - top + 1) < min_px:
                continue
            frames[f"{prefix}_r{bi}_c{ci}"] = tight(a, x, top, w, bottom - top + 1)
    return frames


# --------------------------------------------------------------------------
# what to extract
# --------------------------------------------------------------------------

# Explicit rects on the 2x SMW object sheet. Verified against the pixels: the
# spinning coin occupies y 0..31 and the ? block y 33..64 (a 1px gap, not 2).
OBJECT_RECTS = {
    **{f"coin_{i + 1}": (32 * i, 0, 32, 32) for i in range(4)},
    **{f"qblock_{i + 1}": (32 * i, 33, 32, 32) for i in range(4)},
}

# Seed points -- resolved to exact rects by blob_at().
OBJECT_SEEDS = {
    "qblock_used": (524, 208),
    "mushroom": (598, 74),
    "mushroom_1up": (632, 74),
}

# The green warp pipe is not on the 32px lattice, so it is carried as sprites
# with their own static bodies rather than as tilemap tiles.
PIPE_RECTS = {
    "pipe_top": (0, 358, 62, 32),
    "pipe_body": (0, 390, 62, 32),
}

# Terrain that goes into the strict-grid tileset. Index order is the tile index
# used by level1.js, starting at 1 (0 stays empty).
TILESET = [
    ("ground_top", (104, 256)),   # grass crust over dirt
    ("ground_fill", (104, 290)),  # plain dirt, for everything below the crust
    ("stone", (2, 256)),          # grey rock, for floating platforms
    ("brick", (104, 222)),        # brown block, the bumpable-looking one
]


def build_flag(scale: int = 2) -> np.ndarray:
    """The SMB1 flag triangle, drawn rather than ripped.

    It is absent from the SMB1 tileset (it lives in a sprite sheet we do not
    have) and it is a 16x16 two-colour triangle, so drawing it is both smaller
    and cleaner than sourcing another file.
    """
    cream = (252, 252, 216, 255)
    dark = (32, 56, 32, 255)
    a = np.zeros((16, 16, 4), np.uint8)
    for y in range(16):
        # Pennant: flat vertical edge against the pole, tapering to a point on
        # the right at mid-height.
        span = 15 - int(abs(y * 2 - 15))
        if span <= 1:
            continue
        a[y, 0:span] = cream
        a[y, span - 1] = dark      # outline along the diagonal
    a[:, 0] = np.where(a[:, 0, 3:4] > 0, dark, a[:, 0])  # pole-side edge
    return upscale(a, scale)


def build_pole(ball: np.ndarray, scale: int = 2) -> np.ndarray:
    """One 16px segment of flagpole shaft, colour-matched to the ball sprite."""
    # Reuse the two brightest greens from the real SMB1 ball so the generated
    # shaft cannot drift out of palette.
    px = ball.reshape(-1, 4)
    px = px[px[:, 3] > 0]
    uniq, counts = np.unique(px, axis=0, return_counts=True)
    greens = sorted(uniq[np.argsort(-counts)][:4].tolist(), key=lambda c: -sum(c[:3]))
    light = tuple(greens[0])
    dark = tuple(greens[-1])
    a = np.zeros((16, 16, 4), np.uint8)
    a[:, 6] = dark
    a[:, 7:9] = light
    a[:, 9] = dark
    return upscale(a, scale)


# --------------------------------------------------------------------------
# packing
# --------------------------------------------------------------------------

def pack(frames: dict[str, np.ndarray]) -> tuple[np.ndarray, dict]:
    """Shelf-pack frames into one square-ish atlas. Deterministic given the input."""
    items = sorted(frames.items(), key=lambda kv: (-kv[1].shape[0], kv[0]))
    total = sum((f.shape[0] + ATLAS_PAD) * (f.shape[1] + ATLAS_PAD) for _, f in items)
    width = 1
    while width * width < total * 1.25:
        width *= 2
    width = max(width, max(f.shape[1] for _, f in items) + ATLAS_PAD * 2)

    placed, x, y, shelf_h = {}, ATLAS_PAD, ATLAS_PAD, 0
    for name, img in items:
        h, w = img.shape[:2]
        if x + w + ATLAS_PAD > width:
            x = ATLAS_PAD
            y += shelf_h + ATLAS_PAD
            shelf_h = 0
        placed[name] = (x, y, w, h)
        x += w + ATLAS_PAD
        shelf_h = max(shelf_h, h)
    height = y + shelf_h + ATLAS_PAD

    out = np.zeros((height, width, 4), np.uint8)
    for name, (px, py, w, h) in placed.items():
        out[py:py + h, px:px + w] = frames[name]

    meta = {
        "frames": {
            name: {
                "frame": {"x": px, "y": py, "w": w, "h": h},
                "sourceSize": {"w": w, "h": h},
                "spriteSourceSize": {"x": 0, "y": 0, "w": w, "h": h},
                "rotated": False,
                "trimmed": False,
            }
            for name, (px, py, w, h) in sorted(placed.items())
        },
        "meta": {
            "image": "atlas.png",
            "format": "RGBA8888",
            "size": {"w": width, "h": height},
            "scale": "1",
            "generator": "tools/build_assets.py",
        },
    }
    return out, meta


def build_tileset(objects: np.ndarray) -> tuple[np.ndarray, dict]:
    """Repack terrain into a strict grid with extruded edges.

    Phaser's addTilesetImage() needs a uniform grid, which none of the rips are.
    Each tile is copied into a cell padded by EXTRUDE px of duplicated edge
    pixels, so a tile sampled at a fractional scale factor can never pick up its
    neighbour and show a seam.
    """
    cell = TILE + EXTRUDE * 2
    out = np.zeros((cell, cell * len(TILESET), 4), np.uint8)
    index = {}
    for i, (name, (x, y)) in enumerate(TILESET):
        src = objects[y:y + TILE, x:x + TILE]
        ox = i * cell
        out[EXTRUDE:EXTRUDE + TILE, ox + EXTRUDE:ox + EXTRUDE + TILE] = src
        # Duplicate the outer ring outward.
        out[0:EXTRUDE, ox + EXTRUDE:ox + EXTRUDE + TILE] = src[0]
        out[cell - EXTRUDE:cell, ox + EXTRUDE:ox + EXTRUDE + TILE] = src[-1]
        out[EXTRUDE:EXTRUDE + TILE, ox:ox + EXTRUDE] = src[:, :1]
        out[EXTRUDE:EXTRUDE + TILE, ox + cell - EXTRUDE:ox + cell] = src[:, -1:]
        out[0:EXTRUDE, ox:ox + EXTRUDE] = src[0, 0]
        out[0:EXTRUDE, ox + cell - EXTRUDE:ox + cell] = src[0, -1]
        out[cell - EXTRUDE:cell, ox:ox + EXTRUDE] = src[-1, 0]
        out[cell - EXTRUDE:cell, ox + cell - EXTRUDE:ox + cell] = src[-1, -1]
        index[name] = i + 1  # tile index 0 is reserved for empty
    return out, index


# --------------------------------------------------------------------------
# bitmap font
# --------------------------------------------------------------------------

FONT_CHARS = "0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ.,x-!"
FONT_KEY = (0, 158, 0)


def build_font(scale: int = 2):
    """Slice the yellow SMW status-bar face into an AngelCode bitmap font.

    The sheet is chroma-keyed green and carries three colour variants (red,
    yellow, green) of the same 41 glyphs. Each variant is an exact 8x8 grid,
    16 glyphs per row over three rows, so it is read positionally rather than
    by scanning -- the glyph rows touch, with no transparent gap to split on.
    """
    raw = np.array(Image.open(os.path.join(SRC, "smw-font.png")).convert("RGB"))
    alpha = np.where((raw == FONT_KEY).all(axis=-1), 0, 255).astype(np.uint8)
    a = defringe(np.dstack([raw, alpha]))

    ox, oy, cell, per_row = 285, 115, 8, 16
    glyphs = [
        (ox + (i % per_row) * cell, oy + (i // per_row) * cell, cell, cell)
        for i in range(len(FONT_CHARS))
    ]

    line_h = cell * scale
    imgs = {ch: upscale(a[gy:gy + gh, gx:gx + gw], scale)
            for ch, (gx, gy, gw, gh) in zip(FONT_CHARS, glyphs)}
    page, placed = pack(imgs)

    chars = []
    # The rip has no space glyph, so synthesise one: zero-sized, but it still
    # advances the pen. Without it every string renders as one run-on word.
    chars.append(
        f'    <char id="32" x="0" y="0" width="0" height="0" '
        f'xoffset="0" yoffset="{line_h}" xadvance="{cell * scale // 2}" page="0" chnl="15" />'
    )
    for ch in FONT_CHARS:
        px, py, w, h = (placed["frames"][ch]["frame"][k] for k in ("x", "y", "w", "h"))
        chars.append(
            f'    <char id="{ord(ch)}" x="{px}" y="{py}" width="{w}" height="{h}" '
            f'xoffset="0" yoffset="{line_h - h}" xadvance="{w + scale}" page="0" chnl="15" />'
        )
    xml = (
        '<?xml version="1.0"?>\n<font>\n'
        f'  <info face="SMW" size="{line_h}" bold="0" italic="0" />\n'
        f'  <common lineHeight="{line_h}" base="{line_h}" '
        f'scaleW="{page.shape[1]}" scaleH="{page.shape[0]}" pages="1" />\n'
        '  <pages>\n    <page id="0" file="font.png" />\n  </pages>\n'
        f'  <chars count="{len(chars)}">\n' + "\n".join(chars) + "\n  </chars>\n</font>\n"
    )
    return page, xml


def _runs(mask) -> list[tuple[int, int]]:
    out, start = [], None
    for i, v in enumerate(mask):
        if v and start is None:
            start = i
        elif not v and start is not None:
            out.append((start, i - start))
            start = None
    if start is not None:
        out.append((start, len(mask) - start))
    return out


# --------------------------------------------------------------------------

def save_png(a: np.ndarray, path: str) -> None:
    Image.fromarray(a, "RGBA").save(path, optimize=True)


def main() -> None:
    os.makedirs(GEN, exist_ok=True)

    objects = sheet("mario-objects.png")       # already 2x
    enemies = sheet("mario-enemies.png")       # already 2x
    mario = sheet("smw-mario.png", 2, aliases=SMW_MARIO_ALIASES)   # 1x -> 2x
    smb1 = sheet("smb1-tileset.png", 2)        # 1x -> 2x
    # castle.png ships its sky as opaque blue rather than alpha.
    castle = sheet("smb1-castle.png", 2, key=(99, 173, 255))
    # The title rip is a full 256x224 screen on a green chroma key; only the
    # USA/Europe logo is wanted, composited over our own background. Its
    # background green (0,128,0) is distinct from the logo's letter green
    # (0,200,0), so keying it does not punch holes in the type.
    title = sheet("smw-title.png", 2, key=(0, 128, 0))

    frames: dict[str, np.ndarray] = {}

    def add(name: str, src: np.ndarray, rect) -> None:
        x, y, w, h = rect
        frames[name] = src[y:y + h, x:x + w].copy()

    for name, rect in OBJECT_RECTS.items():
        add(name, objects, rect)
    for name, seed in OBJECT_SEEDS.items():
        add(name, objects, blob_at(objects, *seed))
    for name, rect in PIPE_RECTS.items():
        add(name, objects, tight(objects, *rect))

    for name, rect in grid_slice(mario, "mario").items():
        add(name, mario, rect)
    for name, rect in grid_slice(enemies, "enemy").items():
        add(name, enemies, rect)

    # Flagpole: real ball from the SMB1 rip, generated shaft and flag. The ball
    # and shaft are one connected blob, so keep only the rows wide enough to be
    # the ball itself.
    bx, by, bw, bh = blob_at(smb1, 302 * 2, 157 * 2)
    widths = (smb1[by:by + bh, bx:bx + bw, 3] > 0).sum(axis=1)
    ball_rows = int((widths >= widths.max() * 0.6).cumsum().argmax()) + 1
    add("pole_ball", smb1, (bx, by, bw, ball_rows))
    frames["pole_shaft"] = build_pole(frames["pole_ball"])
    frames["flag"] = build_flag()
    frames["castle"] = castle
    add("title_logo", title, tight(title, 100, 100, 400, 160))

    atlas, meta = pack(frames)
    save_png(atlas, os.path.join(GEN, "atlas.png"))
    with open(os.path.join(GEN, "atlas.json"), "w") as fh:
        json.dump(meta, fh, indent=1, sort_keys=True)
        fh.write("\n")

    tiles, index = build_tileset(objects)
    save_png(tiles, os.path.join(GEN, "tileset.png"))
    with open(os.path.join(GEN, "tiles.json"), "w") as fh:
        json.dump(
            {"tileWidth": TILE, "tileHeight": TILE,
             "margin": EXTRUDE, "spacing": EXTRUDE * 2, "index": index},
            fh, indent=1, sort_keys=True)
        fh.write("\n")

    page, xml = build_font()
    save_png(page, os.path.join(GEN, "font.png"))
    with open(os.path.join(GEN, "font.xml"), "w") as fh:
        fh.write(xml)

    print(f"atlas.png    {atlas.shape[1]}x{atlas.shape[0]}  {len(frames)} frames")
    print(f"tileset.png  {tiles.shape[1]}x{tiles.shape[0]}  {len(index)} tiles: "
          f"{', '.join(f'{k}={v}' for k, v in index.items())}")
    print(f"font.png     {page.shape[1]}x{page.shape[0]}  {len(FONT_CHARS)} glyphs")


if __name__ == "__main__":
    main()
