# -*- coding: utf-8 -*-
"""用 PyAV 把抠好的 PNG 帧序列合成透明 WebM（VP9 + yuva420p）。
imageio-ffmpeg 的静态 ffmpeg 构建不支持 alpha 编码，改用 PyAV（支持 yuva420p）。
用法：venv/Scripts/python.exe make_webm_av.py
"""
import glob
import os

import av
import numpy as np
from PIL import Image

WORK = os.path.join(os.path.dirname(os.path.abspath(__file__)), "work")
OUT = r"E:\Learn\tuyi\web\public\xiaoyi"
FPS = 12


def encode(name):
    indir = os.path.join(WORK, "mat", name)
    files = sorted(glob.glob(os.path.join(indir, "*.png")))
    if not files:
        print(f"!! {name} 无帧")
        return
    dst = os.path.join(OUT, name + ".webm")
    container = av.open(dst, mode="w")
    stream = container.add_stream("libvpx-vp9", rate=FPS)
    stream.width = 480
    stream.height = 480
    stream.codec_context.pix_fmt = "yuva420p"
    stream.options = {"crf": "35", "b:v": "0"}
    for f in files:
        # 关键：PyAV from_image/to_image 都丢 alpha，用 ndarray(RGBA) 路线
        arr = np.array(Image.open(f).convert("RGBA"))
        frame = av.VideoFrame.from_ndarray(arr, format="rgba").reformat(format="yuva420p")
        for packet in stream.encode(frame):
            container.mux(packet)
    for packet in stream.encode():
        container.mux(packet)
    container.close()
    print(f"[合成] {name}.webm: {len(files)}帧 {os.path.getsize(dst)//1024}KB")


if __name__ == "__main__":
    for d in sorted(os.listdir(os.path.join(WORK, "mat"))):
        encode(d)
    print("DONE")
