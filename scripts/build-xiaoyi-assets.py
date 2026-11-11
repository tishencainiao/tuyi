# 生成小忆派生图片素材（头像/品牌标/favicon/立绘缩略）
# 用法：python scripts/build-xiaoyi-assets.py
# 依赖：Pillow（DSH 自带 python 运行时已含）
import os
from PIL import Image

BASE = os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', 'web', 'public', 'xiaoyi')


def load(name):
    return Image.open(os.path.join(BASE, name))


def save(img, name):
    path = os.path.join(BASE, name)
    img.save(path, optimize=True)
    print('saved', name, img.size, os.path.getsize(path), 'bytes')


# 1) 聊天头像：从 App 图标中央裁出脸部（大头像构图，脸居中偏上），缩到 192px
icon = load('app-icon.png').convert('RGBA')
w, h = icon.size
side = int(min(w, h) * 0.82)
left = (w - side) // 2
top = int((h - side) * 0.42)
crop = icon.crop((left, top, left + side, top + side))
save(crop.resize((192, 192), Image.LANCZOS), 'xiaoyi-avatar.png')

# 2) favicon：App 图标缩到 64px
save(icon.resize((64, 64), Image.LANCZOS), 'favicon.png')

# 3) 顶栏品牌标：logo 主标按高 48px 缩放
logo = load('logo.png').convert('RGBA')
lw, lh = logo.size
save(logo.resize((int(lw * 48 / lh), 48), Image.LANCZOS), 'brand-logo.png')

# 4) 登录页立绘：全身立绘按宽 320px 缩放
stand = load('xiaoyi-standing.png').convert('RGBA')
sw, sh = stand.size
save(stand.resize((320, int(sh * 320 / sw)), Image.LANCZOS), 'xiaoyi-hero.png')

print('done')
