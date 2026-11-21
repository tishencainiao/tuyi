# -*- coding: utf-8 -*-
"""把抠好的 PNG 帧序列合成动画 WebP（带 alpha，浏览器 <img> 原生循环播放）。
原因：本地可获得的所有静态 ffmpeg 构建（imageio-ffmpeg/ffmpeg-static/@ffmpeg-installer）
的 libvpx 均未启用 VP9 alpha；PyAV 的 libvpx 也静默丢弃 alpha。
动画 WebP 在 Chrome/Edge/Firefox/Safari 16+ 全部支持透明与循环播放。
用法：venv/Scripts/python.exe make_webp_anim.py
"""
import glob
import os

from PIL import Image

WORK = os.path.join(os.path.dirname(os.path.abspath(__file__)), "work")
OUT = r"E:\Learn\tuyi\web\public\xiaoyi"
FPS = 12
SIZE = 360
QUALITY = 88


def make(name):
    files = sorted(glob.glob(os.path.join(WORK, "mat", name, "*.png")))
    if not files:
        print(f"!! {name} 无帧")
        return
    frames = []
    for f in files:
        im = Image.open(f).convert("RGBA")
        im.thumbnail((SIZE, SIZE), Image.LANCZOS)
        frames.append(im)
    dst = os.path.join(OUT, name + ".webp")
    frames[0].save(dst, save_all=True, append_images=frames[1:],
                   duration=1000 // FPS, loop=0, quality=QUALITY, method=6)
    print(f"[合成] {name}.webp: {len(frames)}帧 {os.path.getsize(dst)//1024}KB")


if __name__ == "__main__":
    for d in sorted(os.listdir(os.path.join(WORK, "mat"))):
        make(d)
    print("DONE")
