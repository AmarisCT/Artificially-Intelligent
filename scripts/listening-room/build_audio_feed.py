#!/usr/bin/env python3
"""Optional podcast feed for the Listening Room.

    python3 scripts/listening-room/build_audio_feed.py [REPO_ROOT]

A podcast feed is OPTIONAL and is never created automatically. This script writes listening-room/podcast.xml only when
  1. the owner has supplied listening-room/feed-config.json (title, description, author, cover image URL, category,
     explicit flag). Nothing here is invented: no config, no feed; and
  2. at least one recording is Published Audio (status published or revision-required, AND a release date).
A feed holds only those recordings. It is separate from the research RSS feed (feed.xml). Submitting it to Apple Podcasts,
Spotify or any directory is a manual decision by the owner; this script never contacts anyone.

Transcripts: for every published recording a WebVTT file (sentence cues, timings measured from the audio) is written next
to the audio file and referenced with the Podcasting 2.0 <podcast:transcript> tag.

A synthetic voice is disclosed in each episode's description. The feed is built from public records only.
"""
from __future__ import annotations
import datetime as dt, email.utils, json, pathlib, sys
import xml.etree.ElementTree as ET

SITE = "https://amarisct.github.io/Artificially-Intelligent/"
NS = {"itunes": "http://www.itunes.com/dtds/podcast-1.0.dtd", "podcast": "https://podcastindex.org/namespace/1.0", "atom": "http://www.w3.org/2005/Atom", "content": "http://purl.org/rss/1.0/modules/content/"}
REQUIRED = ["title", "description", "author", "imageUrl", "category", "explicit"]


def vtt_time(t: float) -> str:
    ms = int(round(t * 1000)); h, ms = divmod(ms, 3600000); m, ms = divmod(ms, 60000); s, ms = divmod(ms, 1000)
    return f"{h:02d}:{m:02d}:{s:02d}.{ms:03d}"


def write_vtt(rec_id: str, transcripts: dict, out: pathlib.Path) -> None:
    lines = ["WEBVTT", "", "NOTE Sentence-level cues. Timings are measured from the audio file.", ""]
    n = 0
    for b in transcripts[rec_id]["blocks"]:
        if b.get("start") is None or not b.get("sentences"):
            continue
        for c0, c1, a, z in b["sentences"]:
            n += 1
            lines += [str(n), f"{vtt_time(a)} --> {vtt_time(z)}", b["text"][c0:c1], ""]
    out.write_text("\n".join(lines), encoding="utf-8")


def build(root: pathlib.Path) -> str | None:
    lr = root / "listening-room"
    cfg_path = lr / "feed-config.json"
    if not cfg_path.exists():
        print("No listening-room/feed-config.json: the podcast feed is optional and has not been set up. Nothing written.")
        return None
    cfg = json.loads(cfg_path.read_text(encoding="utf-8"))
    missing = [k for k in REQUIRED if cfg.get(k) in (None, "")]
    if missing:
        print("feed-config.json is missing: " + ", ".join(missing) + ". Nothing written.")
        return None
    lib = json.loads((lr / "data" / "audio-library.json").read_text(encoding="utf-8"))["items"]
    recs = [r for r in lib if r.get("status") in ("published", "revision-required") and r.get("releaseDate")]
    if not recs:
        print("No recording is Published Audio yet. Nothing written.")
        return None
    # An enclosure must point at a real file of exactly the recorded size; otherwise the feed would advertise audio that is not there.
    bad = []
    for r in recs:
        if r["audio"]["url"].startswith("https://"):
            continue   # hosted elsewhere: this script cannot see the file; check it with `curl -I` (size, type, byte ranges) before release
        f = lr / r["audio"]["url"]
        if not f.exists() or f.stat().st_size != r["audio"]["bytes"]:
            bad.append(f"{r['id']} ({r['audio']['url']}: " + ("missing" if not f.exists() else f"{f.stat().st_size} bytes on disk, {r['audio']['bytes']} recorded") + ")")
    if bad:
        print("The audio file does not match its library record, so no feed was written: " + "; ".join(bad))
        return None
    tr = {t["recordingId"]: t for t in json.loads((lr / "data" / "audio-transcripts.json").read_text(encoding="utf-8"))["items"]}
    for p, u in NS.items():
        ET.register_namespace(p, u)
    rss = ET.Element("rss", {"version": "2.0"})
    ch = ET.SubElement(rss, "channel")
    def t(parent, tag, text=None, attrs=None):
        e = ET.SubElement(parent, tag, attrs or {})
        if text is not None:
            e.text = str(text)
        return e
    t(ch, "title", cfg["title"]); t(ch, "link", SITE + "listening-room/"); t(ch, "description", cfg["description"]); t(ch, "language", cfg.get("language", "en"))
    t(ch, "{%s}link" % NS["atom"], None, {"href": SITE + "listening-room/podcast.xml", "rel": "self", "type": "application/rss+xml"})
    t(ch, "{%s}author" % NS["itunes"], cfg["author"]); t(ch, "{%s}explicit" % NS["itunes"], "true" if cfg["explicit"] else "false")
    t(ch, "{%s}image" % NS["itunes"], None, {"href": cfg["imageUrl"]}); t(ch, "{%s}category" % NS["itunes"], None, {"text": cfg["category"]})
    if cfg.get("owner_email"):
        o = t(ch, "{%s}owner" % NS["itunes"]); t(o, "{%s}name" % NS["itunes"], cfg["author"]); t(o, "{%s}email" % NS["itunes"], cfg["owner_email"])
    for rec in sorted(recs, key=lambda r: r["releaseDate"], reverse=True):
        a = rec["audio"]; page = SITE + f"listening-room/#listen-{rec['id']}"
        external = a["url"].startswith("https://")
        url = a["url"] if external else SITE + "listening-room/" + a["url"]
        # the transcript file is always published with the site, next to the records, whichever host serves the audio
        vtt_path = root / "listening-room" / "audio" / (rec["id"] + ".vtt")
        vtt_url = SITE + "listening-room/audio/" + rec["id"] + ".vtt"
        vtt_path.parent.mkdir(parents=True, exist_ok=True)
        write_vtt(rec["id"], tr, vtt_path)
        disc = "" if rec["narration"]["type"] == "human" else " " + "Narrated with a synthetic voice (" + rec["narration"]["narrator"] + "), reviewed and approved by the author."
        it = t(ch, "item")
        t(it, "title", rec["title"]); t(it, "link", page)
        t(it, "description", rec["description"] + disc + " The written essay: " + rec["source"]["url"])
        t(it, "guid", page, {"isPermaLink": "false"})
        t(it, "pubDate", email.utils.format_datetime(dt.datetime.fromisoformat(rec["releaseDate"]).replace(hour=9, tzinfo=dt.timezone.utc)))
        t(it, "enclosure", None, {"url": url, "length": str(a["bytes"]), "type": a["format"]})
        t(it, "{%s}duration" % NS["itunes"], str(int(round(a["durationSec"])))); t(it, "{%s}explicit" % NS["itunes"], "false"); t(it, "{%s}episodeType" % NS["itunes"], "full")
        t(it, "{%s}transcript" % NS["podcast"], None, {"url": vtt_url, "type": "text/vtt", "language": "en"})
    ET.indent(rss, space="  ")
    xml = '<?xml version="1.0" encoding="UTF-8"?>\n' + ET.tostring(rss, encoding="unicode") + "\n"
    (lr / "podcast.xml").write_text(xml, encoding="utf-8")
    print(f"Wrote listening-room/podcast.xml with {len(recs)} episode(s). It has NOT been submitted anywhere.")
    return xml


if __name__ == "__main__":
    build(pathlib.Path(sys.argv[1]).resolve() if len(sys.argv) > 1 else pathlib.Path(__file__).resolve().parents[2])
