# v3.11.0：从站姿立绘生成「闭眼版」（眨眼用）。除眼睛区域外像素与立绘完全一致。
from PIL import Image
from collections import deque
import statistics

SRC = r'E:/Learn/tuyi/web/public/xiaoyi/xiaoyi-standing.png'
DST = r'E:/Learn/tuyi/web/public/xiaoyi/xiaoyi-blink.png'

im = Image.open(SRC).convert('RGBA')
w, h = im.size
px = im.load()

def bright(p):
    r, g, b, a = p
    if a < 128: return 255
    return (r * 299 + g * 587 + b * 114) // 1000

# 1) 找深色连通块（步长 2）
seen = set()
comps = []
for y in range(0, h, 2):
    for x in range(0, w, 2):
        if (x, y) in seen or bright(px[x, y]) > 70:
            continue
        q = deque([(x, y)]); seen.add((x, y))
        xs, ys = [], []
        while q:
            cx, cy = q.popleft(); xs.append(cx); ys.append(cy)
            for dx, dy in ((1,0),(-1,0),(0,1),(0,-1)):
                nx, ny = cx+dx, cy+dy
                if 0 <= nx < w and 0 <= ny < h and (nx, ny) not in seen and bright(px[nx, ny]) <= 70:
                    seen.add((nx, ny)); q.append((nx, ny))
        comps.append((min(xs), min(ys), max(xs), max(ys), len(xs)))

# 2) 眼睛 = 面积前二、位于面部上部的深色块
eyes = sorted([c for c in comps if c[4] > 1500 and c[2]-c[0] > 20 and c[3]-c[1] > 20 and 700 < (c[1]+c[3])//2 < 1000],
              key=lambda c: -c[4])[:2]
eyes.sort(key=lambda c: c[0])  # 左→右
print('eyes:', eyes)

# 3) 皮肤色 = 每个眼睛 bbox 外扩 6px 一圈的非深色像素中位色
out = im.copy()
opx = out.load()
for (x0, y0, x1, y1, _) in eyes:
    pad = 6
    ring = []
    for x in range(max(0, x0-pad), min(w, x1+pad)):
        for y in (y0-pad, y1+pad):
            if 0 <= y < h and bright(px[x, y]) > 90:
                ring.append(px[x, y])
    for y in range(max(0, y0-pad), min(h, y1+pad)):
        for x in (x0-pad, x1+pad):
            if 0 <= x < w and bright(px[x, y]) > 90:
                ring.append(px[x, y])
    skin = tuple(round(statistics.median(v)) for v in zip(*ring)) if ring else (255, 255, 255, 255)
    print('skin color:', skin)

    # 4) 眼睛区域填皮肤色，中间画一条 ∩ 形细弧线（闭眼）
    xc, yc = (x0 + x1) / 2, (y0 + y1) / 2
    half = (x1 - x0) / 2
    for x in range(x0 - 2, x1 + 3):
        for y in range(y0 - 2, y1 + 3):
            if 0 <= x < w and 0 <= y < h:
                t = (x - xc) / half
                lid = yc - 3 * (1 - t * t)  # ∩ 弧线，两端在 yc、中间上抬 3px
                if abs(y - lid) <= 2:
                    opx[x, y] = (70, 60, 55, 255)   # 深棕眼线
                else:
                    opx[x, y] = skin

out.save(DST)

# 5) 验证：除眼睛区域外与原图完全一致
diff = 0
for y in range(0, h, 4):
    for x in range(0, w, 4):
        if any(x0 - 8 <= x <= x1 + 8 and y0 - 8 <= y <= y1 + 8 for (x0, y0, x1, y1, _) in eyes):
            continue
        if px[x, y] != opx[x, y]:
            diff += 1
print('outside-eye diffs:', diff)
print('saved', DST)
