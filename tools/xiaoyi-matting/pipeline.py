# -*- coding: utf-8 -*-
"""小忆素材抠透明管线（本地离线）：
① 从 6 段 MP4 抽帧（12fps，宽 480）
② rembg 批量抠透明 → PNG 帧
③ 帧序列合成透明 WebM（VP9 + yuva420p）
④ 立绘/logo PNG 抠透明
用法：venv/Scripts/python.exe pipeline.py [--only-frames|--only-mat|--only-webm|--only-png]
"""
import os
import sys
import shutil
import subprocess
import glob
import tempfile

BASE = os.path.dirname(os.path.abspath(__file__))
# 本地模型（已下载 models/u2net.onnx），不走默认 ~/.u2net 下载
os.environ.setdefault("U2NET_HOME", os.path.join(BASE, "models"))
SRC = r"E:\Learn\sc\tuyi"
OUT = r"E:\Learn\tuyi\web\public\xiaoyi"
WORK = os.path.join(BASE, "work")
FRAMES = os.path.join(WORK, "frames")

# 6 段视频 → 目标文件名映射（按文件名关键数字识别）
VIDEO_MAP = {
    "1969": "idle-nap",
    "2792": "work-hand-plan",
    "2865": "idle-spin",
    "4242": "work-map",
    "9342": "idle-milktea",
    "9401": "work-typing",
}
FPS = 12
FRAME_W = 480


def get_ffmpeg():
    import imageio_ffmpeg
    return imageio_ffmpeg.get_ffmpeg_exe()


def list_videos():
    vids = {}
    for f in os.listdir(SRC):
        if f.lower().endswith(".mp4"):
            # jimeng-YYYY-MM-DD-NNNN-描述.mp4 → NNNN 是第 5 段
            key = f.split("-")[4]
            if key in VIDEO_MAP:
                vids[VIDEO_MAP[key]] = os.path.join(SRC, f)
    return vids


def extract_frames():
    ff = get_ffmpeg()
    vids = list_videos()
    if not vids:
        print("!! 没有找到 6 段视频，检查 SRC:", SRC)
        return False
    for name, path in sorted(vids.items()):
        d = os.path.join(FRAMES, name)
        if os.path.isdir(d):
            shutil.rmtree(d)
        os.makedirs(d, exist_ok=True)
        cmd = [ff, "-y", "-i", path, "-vf", f"fps={FPS},scale={FRAME_W}:-2",
               os.path.join(d, "%04d.png")]
        r = subprocess.run(cmd, capture_output=True, text=True)
        n = len(glob.glob(os.path.join(d, "*.png")))
        print(f"[抽帧] {name}: {n} 帧 {'' if r.returncode == 0 else 'FAIL ' + r.stderr[-300:]}")
    return True


def mat_frames():
    from rembg import remove, new_session
    session = new_session("u2net")
    dirs = [d for d in sorted(os.listdir(FRAMES)) if os.path.isdir(os.path.join(FRAMES, d))]
    total = sum(len(glob.glob(os.path.join(FRAMES, d, "*.png"))) for d in dirs)
    done = 0
    for d in dirs:
        indir = os.path.join(FRAMES, d)
        outdir = os.path.join(WORK, "mat", d)
        os.makedirs(outdir, exist_ok=True)
        for f in sorted(os.listdir(indir)):
            if not f.endswith(".png"):
                continue
            src = os.path.join(indir, f)
            dst = os.path.join(outdir, f)
            if os.path.exists(dst):
                done += 1
                continue
            with open(src, "rb") as fh:
                data = fh.read()
            out = remove(data, session=session,
                         post_process_mask=False)  # 卡通硬边，不做 alpha matting 毛边
            with open(dst, "wb") as fh:
                fh.write(out)
            done += 1
            if done % 20 == 0:
                print(f"[抠图] {done}/{total}")
    print(f"[抠图] 完成 {done}/{total}")


def make_webm():
    ff = get_ffmpeg()
    for d in sorted(os.listdir(os.path.join(WORK, "mat"))):
        indir = os.path.join(WORK, "mat", d)
        n = len(glob.glob(os.path.join(indir, "*.png")))
        if n == 0:
            print(f"!! {d} 无帧")
            continue
        dst = os.path.join(OUT, d + ".webm")
        # -r {FPS} 输入帧率；libvpx-vp9 + yuva420p 透明；crf 35 控体积
        # 关键：vf format=yuva420p 强制保留 alpha（image2 读 PNG 序列默认丢 alpha）
        cmd = [ff, "-y", "-framerate", str(FPS), "-i",
               os.path.join(indir, "%04d.png"),
               "-vf", "format=yuva420p",
               "-c:v", "libvpx-vp9", "-pix_fmt", "yuva420p",
               "-crf", "35", "-b:v", "0", "-an", dst]
        r = subprocess.run(cmd, capture_output=True, text=True)
        size = os.path.getsize(dst) if os.path.exists(dst) else 0
        print(f"[合成] {d}.webm: {n}帧 {size//1024}KB {'' if r.returncode == 0 else 'FAIL ' + r.stderr[-300:]}")


def mat_png():
    from rembg import remove, new_session
    session = new_session("u2net")
    # 立绘（源目录 4119）+ logo 主标（6627）；App 图标不抠（拍板）
    jobs = {
        "4119": "xiaoyi-standing.png",
        "6627": "logo.png",
    }
    for f in os.listdir(SRC):
        if f.lower().endswith(".png"):
            key = f.split("-")[4]
            if key in jobs:
                with open(os.path.join(SRC, f), "rb") as fh:
                    out = remove(fh.read(), session=session, post_process_mask=False)
                dst = os.path.join(OUT, jobs[key])
                with open(dst, "wb") as fh:
                    fh.write(out)
                print(f"[抠图] {jobs[key]} ← {f} ({len(out)//1024}KB)")


if __name__ == "__main__":
    mode = sys.argv[1] if len(sys.argv) > 1 else "all"
    if mode in ("all", "frames"):
        extract_frames()
    if mode in ("all", "mat"):
        mat_frames()
    if mode in ("all", "webm"):
        make_webm()
    if mode in ("all", "png"):
        mat_png()
    print("DONE", mode)
