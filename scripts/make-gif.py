"""Assemble the frames from record-gif.mjs into an optimised GIF: python scripts/make-gif.py gif-frames docs/explorer.gif"""
import glob, sys
from PIL import Image
frames_dir, out = sys.argv[1], sys.argv[2]
files = sorted(glob.glob(f"{frames_dir}/f*.png"))
imgs = [Image.open(f).convert("RGB").resize((900, 525), Image.LANCZOS) for f in files]
pal = imgs[0].quantize(colors=128, method=Image.MEDIANCUT)
frames = [im.quantize(colors=128, palette=pal, dither=Image.FLOYDSTEINBERG) for im in imgs]
frames[0].save(out, save_all=True, append_images=frames[1:], duration=120, loop=0, optimize=True)
print(out, len(frames), "frames")
