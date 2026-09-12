#!/usr/bin/env python3
"""Render a vendored spritesheet as a numbered contact sheet, for reading tile
indices off it.

    python3 scripts/contact-sheet.py public/tiles/kenney/roguelike-sheet.png \
        /tmp/rl.png --tile 16 --spacing 1 --zoom 2

Why this exists: the roguelike sheet is 1767 tiles with no per-tile filenames,
so choosing one means finding it by eye and reading its (col,row) off a grid.
Opening the raw PNG in a viewer does not work -- it is 16px tiles, and any
viewer that scales it smooths the pixels into mush.

Pure stdlib on purpose. This box has no PIL and no ImageMagick, and macOS `sips`
resamples smoothly, which destroys pixel art exactly when you are trying to read
it. Everything here is nearest-neighbour. Dev tooling only -- nothing in the
built world imports it.

Handles 8-bit RGB/RGBA/grey(+alpha)/palette PNGs, filter types 0-4, no interlace.
"""
import argparse
import struct, zlib, sys

def read_png(path):
    d = open(path, 'rb').read()
    assert d[:8] == b'\x89PNG\r\n\x1a\n', 'not a png'
    pos, idat, pal, trns = 8, [], None, None
    while pos < len(d):
        ln, typ = struct.unpack('>I4s', d[pos:pos+8])
        body = d[pos+8:pos+8+ln]
        if typ == b'IHDR':
            w, h, depth, color, comp, filt, inter = struct.unpack('>IIBBBBB', body)
            assert depth == 8 and inter == 0, f'unsupported depth={depth} interlace={inter}'
        elif typ == b'PLTE': pal = body
        elif typ == b'tRNS': trns = body
        elif typ == b'IDAT': idat.append(body)
        elif typ == b'IEND': break
        pos += 12 + ln
    raw = zlib.decompress(b''.join(idat))
    nch = {0:1, 2:3, 3:1, 4:2, 6:4}[color]
    stride = w * nch
    out, prev = bytearray(), bytearray(stride)
    p = 0
    for _ in range(h):
        f = raw[p]; line = bytearray(raw[p+1:p+1+stride]); p += 1 + stride
        if f == 1:
            for i in range(nch, stride): line[i] = (line[i] + line[i-nch]) & 255
        elif f == 2:
            for i in range(stride): line[i] = (line[i] + prev[i]) & 255
        elif f == 3:
            for i in range(stride):
                a = line[i-nch] if i >= nch else 0
                line[i] = (line[i] + ((a + prev[i]) >> 1)) & 255
        elif f == 4:
            for i in range(stride):
                a = line[i-nch] if i >= nch else 0
                b = prev[i]; c = prev[i-nch] if i >= nch else 0
                pp = a + b - c
                pa, pb, pc = abs(pp-a), abs(pp-b), abs(pp-c)
                pr = a if (pa <= pb and pa <= pc) else (b if pb <= pc else c)
                line[i] = (line[i] + pr) & 255
        out += line; prev = line
    # normalise to RGBA
    px = bytearray(w*h*4)
    for i in range(w*h):
        s = out[i*nch:(i+1)*nch]
        if color == 6: px[i*4:i*4+4] = s
        elif color == 2: px[i*4:i*4+3] = s; px[i*4+3] = 255
        elif color == 0: px[i*4:i*4+3] = bytes(s)*3; px[i*4+3] = 255
        elif color == 4: px[i*4:i*4+3] = bytes(s[0:1])*3; px[i*4+3] = s[1]
        else:
            j = s[0]; px[i*4:i*4+3] = pal[j*3:j*3+3]
            px[i*4+3] = trns[j] if trns and j < len(trns) else 255
    return w, h, px

def write_png(path, w, h, px):
    raw = b''.join(b'\x00' + bytes(px[y*w*4:(y+1)*w*4]) for y in range(h))
    def chunk(t, b): 
        return struct.pack('>I', len(b)) + t + b + struct.pack('>I', zlib.crc32(t+b) & 0xffffffff)
    open(path, 'wb').write(b'\x89PNG\r\n\x1a\n'
        + chunk(b'IHDR', struct.pack('>IIBBBBB', w, h, 8, 6, 0, 0, 0))
        + chunk(b'IDAT', zlib.compress(raw, 9)) + chunk(b'IEND', b''))

def zoom(w, h, px, z):
    W, H = w*z, h*z
    o = bytearray(W*H*4)
    for y in range(H):
        sr = (y//z)*w*4
        row = bytearray()
        for x in range(W):
            s = sr + (x//z)*4
            row += px[s:s+4]
        o[y*W*4:(y+1)*W*4] = row
    return W, H, o

F = {  # 3x5 digits, rows top->bottom, bit 2 = leftmost
 '0':(0b111,0b101,0b101,0b101,0b111),'1':(0b010,0b110,0b010,0b010,0b111),
 '2':(0b111,0b001,0b111,0b100,0b111),'3':(0b111,0b001,0b111,0b001,0b111),
 '4':(0b101,0b101,0b111,0b001,0b001),'5':(0b111,0b100,0b111,0b001,0b111),
 '6':(0b111,0b100,0b111,0b101,0b111),'7':(0b111,0b001,0b010,0b010,0b010),
 '8':(0b111,0b101,0b111,0b101,0b111),'9':(0b111,0b101,0b111,0b001,0b001),
}

def render(src, dst, tile=16, spacing=1, z=3, gut=22, c0=0, r0=0, cw=None, rh=None):
    w, h, px = read_png(src)
    step = tile + spacing
    ncols, nrows = (w + spacing) // step, (h + spacing) // step
    # Crop in TILE units, and keep the labels showing absolute sheet coords --
    # the whole point is reading an index you can paste into a legend, so a
    # cropped view that renumbers from zero would be actively misleading.
    cols = ncols - c0 if cw is None else min(cw, ncols - c0)
    rows = nrows - r0 if rh is None else min(rh, nrows - r0)
    tz = tile * z
    W, H = gut + cols * (tz + 1) + 1, gut + rows * (tz + 1) + 1
    out = bytearray(W * H * 4)

    def put(x, y, rgba):
        if 0 <= x < W and 0 <= y < H: out[(y*W+x)*4:(y*W+x)*4+4] = rgba
    def text(s, x, y, col=(230,230,240,255)):
        for ch in s:
            for r, bits in enumerate(F.get(ch, (0,)*5)):
                for c in range(3):
                    if bits >> (2-c) & 1:
                        for dy in range(2):
                            for dx in range(2):
                                put(x+c*2+dx, y+r*2+dy, bytes(col))
            x += 8

    for y in range(H):  # dark backdrop
        for x in range(W): put(x, y, b'\x1a\x1a\x22\xff')

    for ty in range(rows):
        for tx in range(cols):
            ox, oy = gut + tx*(tz+1) + 1, gut + ty*(tz+1) + 1
            sx, sy = (c0+tx)*step, (r0+ty)*step
            for py in range(tile):
                for pxx in range(tile):
                    i = ((sy+py)*w + sx+pxx) * 4
                    if sy+py >= h or sx+pxx >= w: continue
                    r, g, b, a = px[i], px[i+1], px[i+2], px[i+3]
                    if a < 8:  # checkerboard shows holes
                        v = 60 if ((pxx>>2) + (py>>2)) & 1 else 44
                        r = g = b = v; a = 255
                    for dy in range(z):
                        for dx in range(z):
                            put(ox+pxx*z+dx, oy+py*z+dy, bytes((r,g,b,a)))

    for tx in range(cols + 1):  # grid
        for y in range(gut, H): put(gut + tx*(tz+1), y, b'\x00\xd0\xff\x50')
    for ty in range(rows + 1):
        for x in range(gut, W): put(x, gut + ty*(tz+1), b'\x00\xd0\xff\x50')
    for tx in range(cols):
        text(str(c0+tx), gut + tx*(tz+1) + 3, 6)
    for ty in range(rows):
        text(str(r0+ty), 2, gut + ty*(tz+1) + tz//2 - 4)

    write_png(dst, W, H, out)
    print(f'{dst}  cols {c0}..{c0+cols-1}, rows {r0}..{r0+rows-1} @{tile}px sp{spacing} -> {W}x{H}')

if __name__ == '__main__':
    ap = argparse.ArgumentParser(description=__doc__.split('\n')[0])
    ap.add_argument('src'); ap.add_argument('dst')
    ap.add_argument('--tile', type=int, default=16)
    ap.add_argument('--spacing', type=int, default=1)
    ap.add_argument('--zoom', type=int, default=3)
    ap.add_argument('--col', type=int, default=0, help='first column of the crop')
    ap.add_argument('--row', type=int, default=0, help='first row of the crop')
    ap.add_argument('--cols', type=int, default=None, help='crop width in tiles')
    ap.add_argument('--rows', type=int, default=None, help='crop height in tiles')
    a = ap.parse_args()
    render(a.src, a.dst, a.tile, a.spacing, a.zoom, 22, a.col, a.row, a.cols, a.rows)
