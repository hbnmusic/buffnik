"""Builds tests/fixtures/sheet-aa.png: a synthetic character sheet with anti-aliased edges, dark outlines and
JPEG-style noise, plus sheet-aa.json describing what the slicer should find. Not art; shapes only."""
import json, math, random
from PIL import Image, ImageDraw, ImageFilter
import io

random.seed(3)
W, H, S = 1600, 900, 4
BG = (255, 0, 255)
img = Image.new('RGB', (W * S, H * S), BG)
d = ImageDraw.Draw(img)
OUT = (40, 24, 48)
expected = {'character': None, 'outfits': [], 'items': []}

def rr(x0, y0, x1, y1, fill, r=10):
    d.rounded_rectangle([x0 * S, y0 * S, x1 * S, y1 * S], radius=r * S, fill=OUT)
    d.rounded_rectangle([(x0 + 3) * S, (y0 + 3) * S, (x1 - 3) * S, (y1 - 3) * S], radius=max(1, (r - 2)) * S, fill=fill)

def circ(cx, cy, r, fill):
    d.ellipse([(cx - r) * S, (cy - r) * S, (cx + r) * S, (cy + r) * S], fill=OUT)
    d.ellipse([(cx - r + 3) * S, (cy - r + 3) * S, (cx + r - 3) * S, (cy + r - 3) * S], fill=fill)

def figure(x, fill, head):
    circ(x + 60, 80, 34, head)
    rr(x + 20, 110, x + 100, 250, fill)
    rr(x + 25, 240, x + 55, 330, fill, 6)
    rr(x + 65, 240, x + 95, 330, fill, 6)
    return (x + 20, 46, 80 + 20, 330 - 46 + 46)

colors = [(200, 40, 40), (40, 160, 70), (40, 90, 210), (230, 170, 20), (20, 170, 170), (120, 60, 180), (160, 110, 60), (90, 90, 90), (240, 120, 40),
          (30, 120, 90), (180, 40, 120), (70, 70, 160), (150, 190, 40), (210, 90, 90), (60, 150, 200), (130, 80, 40), (100, 200, 120), (190, 150, 220)]

figure(60, (60, 70, 90), (240, 210, 190))
for k, x in enumerate([300, 500, 700, 900]):
    figure(x, colors[k + 5], (240, 210, 190))

items = []
for i in range(18):
    row, col = divmod(i, 6)
    cx, cy = 130 + col * 260, 480 + row * 150
    c = colors[i]
    kind = i % 6
    if kind == 0: rr(cx - 55, cy - 45, cx + 55, cy + 45, c)
    elif kind == 1: circ(cx, cy, 45, c)
    elif kind == 2:
        circ(cx, cy, 50, c)
        d.ellipse([(cx - 22) * S, (cy - 22) * S, (cx + 22) * S, (cy + 22) * S], fill=BG)  # hole
    elif kind == 3:
        rr(cx - 52, cy - 40, cx - 6, cy + 40, c, 8)
        rr(cx + 6, cy - 40, cx + 52, cy + 40, c, 8)  # a pair with a 12 px gap
    elif kind == 4:
        a = math.radians(35); L = 75; w = 6
        pts = [(cx - L * math.cos(a) - w * math.sin(a), cy - L * math.sin(a) + w * math.cos(a)), (cx + L * math.cos(a) - w * math.sin(a), cy + L * math.sin(a) + w * math.cos(a)),
               (cx + L * math.cos(a) + w * math.sin(a), cy + L * math.sin(a) - w * math.cos(a)), (cx - L * math.cos(a) + w * math.sin(a), cy - L * math.sin(a) - w * math.cos(a))]
        d.polygon([(px * S, py * S) for px, py in pts], fill=c, outline=OUT, width=2 * S)
    else: rr(cx - 35, cy - 62, cx + 35, cy + 62, c)
    items.append({'color': c, 'cx': cx, 'cy': cy})
for (x, y) in [(40, 420), (1500, 860), (700, 380), (1450, 370)]:
    d.ellipse([x * S, y * S, (x + 3) * S, (y + 3) * S], fill=(10, 10, 10))  # specks

small = img.resize((W, H), Image.LANCZOS)
buf = io.BytesIO(); small.save(buf, 'JPEG', quality=88); buf.seek(0)
final = Image.open(buf).convert('RGB')
final.save('tests/fixtures/sheet-aa.png', optimize=True)
json.dump({'width': W, 'height': H, 'items': items, 'outfitColors': [list(colors[k + 5]) for k in range(4)]}, open('tests/fixtures/sheet-aa.json', 'w'))
print('ok')
