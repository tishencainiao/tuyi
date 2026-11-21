
from PIL import Image
import collections
im = Image.open(r'E:/Learn/tuyi/web/public/xiaoyi/xiaoyi-standing.png').convert('RGBA')
w, h = im.size
px = im.load()
# 找深色像素连通块（亮度低）
from collections import deque
def brightness(p):
    r,g,b,a = p
    if a < 128: return 255
    return (r*299+g*587+b*114)//1000
seen = set()
comps = []
for y in range(0, h, 2):
    for x in range(0, w, 2):
        if (x,y) in seen: continue
        p = px[x,y]
        if brightness(p) > 70: continue
        q = deque([(x,y)]); seen.add((x,y))
        xs=[]; ys=[]
        while q:
            cx,cy = q.popleft(); xs.append(cx); ys.append(cy)
            for dx,dy in ((1,0),(-1,0),(0,1),(0,-1)):
                nx,ny = cx+dx, cy+dy
                if 0<=nx<w and 0<=ny<h and (nx,ny) not in seen:
                    if brightness(px[nx,ny]) <= 70:
                        seen.add((nx,ny)); q.append((nx,ny))
        comps.append((min(xs),min(ys),max(xs),max(ys),len(xs)))
comps.sort(key=lambda c:-c[4])
print('size', w, h)
for i,c in enumerate(comps[:12]):
    print(i, 'bbox', c[:4], 'area', c[4], 'center', ((c[0]+c[2])//2,(c[1]+c[3])//2))
