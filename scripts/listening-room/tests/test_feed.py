#!/usr/bin/env python3
"""Podcast feed generator: fixture tests on a throwaway copy. The feed must never exist without the owner's config and a
published recording, must contain only published recordings, and must validate structurally."""
import json, re, shutil, subprocess, sys, tempfile
import xml.etree.ElementTree as ET
from pathlib import Path
REPO = Path(__file__).resolve().parents[3]
PASS = FAIL = 0
def check(desc, ok, detail=""):
    global PASS, FAIL
    PASS += bool(ok); FAIL += (not ok)
    print(("PASS " if ok else "FAIL ") + f"[T27] {desc}" + (f"  -- {detail}" if detail != "" else ""), flush=True)
def run(T):
    return subprocess.run(["python3", str(T / "scripts/listening-room/build_audio_feed.py"), str(T)], capture_output=True, text=True)

with tempfile.TemporaryDirectory() as td:
    T = Path(td) / "repo"
    shutil.copytree(REPO, T, ignore=shutil.ignore_patterns(".git", "__pycache__", "*.zip", "*.mp3"))
    feed = T / "listening-room/podcast.xml"
    r = run(T)
    check("No config, no feed: nothing is written", not feed.exists() and "has not been set up" in r.stdout, r.stdout.strip())
    cfg = {"title": "Fixture Show", "description": "Fixture description.", "author": "Fixture Author", "imageUrl": "https://example.org/cover.jpg", "category": "Science", "explicit": False}
    (T / "listening-room/feed-config.json").write_text(json.dumps({k: v for k, v in cfg.items() if k != "imageUrl"}))
    r = run(T)
    check("Config missing a required field (cover image): nothing is written and the missing field is named", not feed.exists() and "imageUrl" in r.stdout, r.stdout.strip())
    (T / "listening-room/feed-config.json").write_text(json.dumps(cfg))
    r = run(T)
    check("Config present but no recording published: nothing is written", not feed.exists() and "No recording is Published Audio" in r.stdout, r.stdout.strip())
    lib = json.loads((T / "listening-room/data/audio-library.json").read_text())
    for rec in lib["items"]:
        if rec["id"] == "LR001": rec["status"] = "published"; rec["releaseDate"] = "2026-10-20"
    (T / "listening-room/data/audio-library.json").write_text(json.dumps(lib))
    r = run(T)
    check("Published but the MP3 is not on disk: no feed (never advertise audio that is missing)", not feed.exists() and "missing" in r.stdout, r.stdout.strip())
    rec1 = next(x for x in lib["items"] if x["id"] == "LR001")
    (T / "listening-room/audio").mkdir(exist_ok=True)
    with open(T / "listening-room/audio/LR001.mp3", "wb") as fh: fh.truncate(rec1["audio"]["bytes"] - 5)
    r = run(T)
    check("Published but the MP3 size differs from its record: no feed", not feed.exists() and "bytes on disk" in r.stdout, r.stdout.strip())
    with open(T / "listening-room/audio/LR001.mp3", "wb") as fh: fh.truncate(rec1["audio"]["bytes"])
    r = run(T)
    check("FIXTURE: with a published recording the feed is written", feed.exists(), r.stdout.strip() + r.stderr[-200:])
    root = ET.parse(feed).getroot()
    items = root.findall("./channel/item")
    check("Feed is well-formed RSS 2.0 and contains only the published recording (not the other)", root.tag == "rss" and len(items) == 1 and items[0].find("title").text == "We Are All Archives Now")
    ns = {"itunes": "http://www.itunes.com/dtds/podcast-1.0.dtd", "podcast": "https://podcastindex.org/namespace/1.0"}
    it = items[0]; enc = it.find("enclosure")
    rec = next(r for r in lib["items"] if r["id"] == "LR001")
    check("Enclosure is an absolute https MP3 URL with the real byte length and type", enc.get("url") == "https://amarisct.github.io/Artificially-Intelligent/listening-room/audio/LR001.mp3" and int(enc.get("length")) == rec["audio"]["bytes"] and enc.get("type") == "audio/mpeg", dict(enc.attrib))
    check("Duration is the measured duration; GUID is a stable non-permalink", int(it.find("itunes:duration", ns).text) == round(rec["audio"]["durationSec"]) and it.find("guid").get("isPermaLink") == "false" and it.find("guid").text.endswith("#listen-LR001"))
    check("A synthetic voice is disclosed in the episode description", "synthetic voice" in it.find("description").text)
    ch = root.find("channel")
    check("Channel carries only what the owner supplied (title, author, cover, category, explicit)", ch.find("title").text == "Fixture Show" and ch.find("itunes:author", ns).text == "Fixture Author" and ch.find("itunes:image", ns).get("href") == cfg["imageUrl"] and ch.find("itunes:category", ns).get("text") == "Science" and ch.find("itunes:explicit", ns).text == "false")
    tr = it.find("podcast:transcript", ns)
    vtt = T / "listening-room/audio/LR001.vtt"
    check("A WebVTT transcript is written and referenced (Podcasting 2.0)", tr is not None and tr.get("type") == "text/vtt" and vtt.exists())
    v = vtt.read_text()
    cues = re.findall(r"(\d\d:\d\d:\d\d\.\d{3}) --> (\d\d:\d\d:\d\d\.\d{3})", v)
    sec = lambda x: int(x[:2]) * 3600 + int(x[3:5]) * 60 + int(x[6:8]) + int(x[9:]) / 1000
    check("VTT: starts WEBVTT, has one cue per sentence, and cues are ordered and non-overlapping", v.startswith("WEBVTT") and len(cues) == 112 and all(sec(a) < sec(b) for a, b in cues) and all(sec(cues[i][1]) <= sec(cues[i + 1][0]) + 1e-6 for i in range(len(cues) - 1)), len(cues))
    # audio hosted on another origin (object storage / CDN): the record carries an absolute https URL
    for x in lib["items"]:
        if x["id"] == "LR001": x["audio"]["url"] = "https://media.example.org/lr/LR001.mp3"
    (T / "listening-room/data/audio-library.json").write_text(json.dumps(lib))
    (T / "listening-room/audio/LR001.mp3").unlink(); feed.unlink()
    r = run(T)
    it2 = ET.parse(feed).getroot().find("./channel/item") if feed.exists() else None
    check("Externally hosted audio: the enclosure uses the absolute https URL as recorded", it2 is not None and it2.find("enclosure").get("url") == "https://media.example.org/lr/LR001.mp3" and int(it2.find("enclosure").get("length")) == rec1["audio"]["bytes"], r.stdout.strip())
    check("Externally hosted audio: the transcript still points at the site's own VTT file", it2 is not None and it2.find("podcast:transcript", ns).get("url") == "https://amarisct.github.io/Artificially-Intelligent/listening-room/audio/LR001.vtt")
    check("The real repository has no feed and no config (nothing is created without the owner's decision)", not (REPO / "listening-room/podcast.xml").exists() and not (REPO / "listening-room/feed-config.json").exists())
print(f"\n{PASS}/{PASS + FAIL} feed checks passed")
sys.exit(1 if FAIL else 0)
