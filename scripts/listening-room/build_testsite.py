#!/usr/bin/env python3
"""Assemble a throwaway test site (NOT committed output) that mirrors the live layout, so the Listening Room can be
exercised in a real browser:

  <out>/listening-room/...      the feature, with config.js overridden to preview mode
  <out>/listening-room/audio/   the demonstration MP3s from the work directory
  <out>/inquiry-engine/data/research-index.json, <out>/lexicon/data/concepts.json   copies of the real data

Usage: build_testsite.py OUT [--work DIR] [--production]   (--production keeps config.js as committed)"""
import argparse, shutil, sys
from pathlib import Path
ROOT = Path(__file__).resolve().parents[2]

def main():
    ap = argparse.ArgumentParser(); ap.add_argument("out"); ap.add_argument("--work", default="/home/claude/build/lr/work"); ap.add_argument("--production", action="store_true")
    a = ap.parse_args(); out = Path(a.out)
    out.mkdir(parents=True, exist_ok=True)
    for c in list(out.iterdir()):
        shutil.rmtree(c) if c.is_dir() else c.unlink()   # keep the directory itself: a running server may hold it
    lr = out / "listening-room"
    shutil.copytree(ROOT / "listening-room", lr)
    (lr / "audio").mkdir()
    for f in Path(a.work).glob("LR*.mp3"): shutil.copy(f, lr / "audio" / f.name)
    for rel in ["inquiry-engine/data/research-index.json", "lexicon/data/concepts.json"]:
        d = out / rel; d.parent.mkdir(parents=True, exist_ok=True); shutil.copy(ROOT / rel, d)
    if not a.production:
        (lr / "config.js").write_text('window.LR_CONFIG = {preview: true, showProposedChapters: true};\n')
    print("test site at", out)
main()
