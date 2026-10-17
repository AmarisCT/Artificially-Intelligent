#!/usr/bin/env python3
"""Build the owner PREVIEW of the Listening Room as a single self-contained page plus its data and audio files.

The preview is for the site owner to review before anything is published. It is NOT committed output and it never
touches the live site. Differences from the real feature, all set here and nowhere else:
  - preview mode is on, so recordings that are still 'Awaiting Audio Review' can be played (production cannot play them);
  - the draft chapter titles are shown (they are proposals until approved);
  - links to the rest of the site point at the live site, and the research index / Lexicon data are bundled copies.

Usage: build_preview.py OUT_DIR [--work DIR]
Writes OUT_DIR/index.html and prints the {published path: source path} map of supporting files as JSON on the last line."""
import argparse, json, re, shutil
from pathlib import Path
ROOT = Path(__file__).resolve().parents[2]
LR = ROOT / "listening-room"
SITE = "https://amarisct.github.io/Artificially-Intelligent/"
SCRIPTS = ["lr-util.js", "lr-store.js", "transcript-sync.js", "audio-player.js", "atmosphere.js", "app.js", "journal.js", "listen.js"]
NOTE = ("Two essays from the archive, read aloud by a synthetic voice (CMU Flite, open source, free) so that the whole experience can be tried. "
        "A person has not narrated them and you have not yet approved them. Chapter titles marked as proposed are drafts.")

def main():
    ap = argparse.ArgumentParser(); ap.add_argument("out"); ap.add_argument("--work", default="/home/claude/build/lr/work")
    a = ap.parse_args(); out = Path(a.out)
    if out.exists(): shutil.rmtree(out)
    (out / "data").mkdir(parents=True); (out / "audio").mkdir()
    files = {}
    for f in sorted((LR / "data").glob("*.json")):
        shutil.copy(f, out / "data" / f.name); files[f"data/{f.name}"] = str(out / "data" / f.name)
    for f in sorted(Path(a.work).glob("LR*.mp3")):
        shutil.copy(f, out / "audio" / f.name); files[f"audio/{f.name}"] = str(out / "audio" / f.name)
    for rel, name in [("inquiry-engine/data/research-index.json", "research-index.json"), ("lexicon/data/concepts.json", "concepts.json")]:
        shutil.copy(ROOT / rel, out / name); files[name] = str(out / name)

    css = (LR / "styles.css").read_text(encoding="utf-8")
    cfg = {"preview": True, "showProposedChapters": True, "siteRoot": SITE, "indexUrl": "research-index.json", "lexiconUrl": "concepts.json", "previewNote": NOTE}
    js = "window.LR_CONFIG = " + json.dumps(cfg) + ";\n" + "\n".join((LR / s).read_text(encoding="utf-8") for s in SCRIPTS)
    assert "</script" not in js.lower()
    src = (LR / "index.html").read_text(encoding="utf-8")
    body = re.search(r'<body>(.*?)<script src="config.js">', src, re.S).group(1).strip()
    body = body.replace('href="../"', f'href="{SITE}"')
    fonts = re.search(r'<link rel="stylesheet" href="(https://fonts.googleapis.com[^"]+)">', src).group(1)
    page = (f'<title>The Listening Room</title>\n<meta name="description" content="Owner preview of the Listening Room: narrated research with a synchronized transcript.">\n'
            f'<link rel="stylesheet" href="{fonts}">\n<style>\n{css}\n</style>\n{body}\n<script>\n{js}\nLRApp.start();\n</script>\n')
    (out / "index.html").write_text(page, encoding="utf-8")
    total = sum(Path(p).stat().st_size for p in files.values()) + len(page.encode())
    print(f"preview page {len(page.encode())/1024:.0f} KB, {len(files)} supporting files, {total/1e6:.1f} MB in all")
    print(json.dumps(files))

main()
