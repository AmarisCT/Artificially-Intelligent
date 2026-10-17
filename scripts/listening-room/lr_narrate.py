#!/usr/bin/env python3
"""Narration production for one Listening Room recording (workflow steps 2-9).

    python3 scripts/listening-room/lr_narrate.py LR001 [--work DIR]

What it does, in order:
  2. reads the approved article text from the public repository
  3. prepares a narration script (what is spoken, what is deliberately not)
  4. applies the pronunciation brief (pronunciations.json)
  5. generates narration with an AUTHORIZED engine. Here: CMU Flite, an open-source
     engine already installed in the build image. No network call, no paid service.
  6. produces the audio file (CBR mono MP3)
  7. measures it (duration, loudness, peaks)
  9. emits timing: every sentence start/end comes from the real sample counts of the
     clips that were joined, so the timing is exact by construction. verify_audio.py then
     re-checks it against the decoded MP3.

Outputs (in --work): <ID>.mp3, <ID>.narration.json (script + timing + measurements).
lr_compile.py turns those into the public data files.

The voice is a demonstration voice. Nothing produced here is an approved recording.
"""
from __future__ import annotations

import argparse
import concurrent.futures as cf
import hashlib
import json
import pathlib
import re
import subprocess
import sys
import tempfile

import numpy as np
from scipy.io import wavfile

sys.path.insert(0, str(pathlib.Path(__file__).resolve().parent))
from lr_common import (SRC_DIR, ROOT, article_slug, dump_json, load_json, long_date, manifest,  # noqa: E402
                       read_article_page, sha256_file, sha256_text, split_sentences, spoken_date, strip_citations)

SR = 22050
VOICE = "slt"
GAP_SENT, GAP_PARA, GAP_FRAME, LEAD, TAIL, PAD = 0.30, 0.90, 1.40, 0.50, 1.00, 0.030
MP3_KBPS = 48
TARGET_LUFS = -16.0
LIMIT = 0.89


def run(cmd, **kw):
    return subprocess.run(cmd, check=True, capture_output=True, text=True, **kw)


def pron_rules():
    cfg = load_json(SRC_DIR / "pronunciations.json")
    return [(re.compile(r["match"]), r["spoken"]) for r in cfg["rules"]]


def to_spoken(text: str, rules) -> str:
    s = text.replace("\u2019", "'").replace("\u2018", "'").replace("\u201c", '"').replace("\u201d", '"')
    for rx, rep in rules:
        s = rx.sub(rep, s)
    return s


def frames_for(rec_cfg: dict, art_meta: dict, title: str):
    iso = art_meta["publishedAt"]
    lead = title if title[-1] in ".?!" else title + "."   # a title that already ends in ? or ! is not given a second full stop
    opening_text = (f"Demonstration recording. This narration uses a synthetic voice and has not been reviewed. "
                    f"It is not an approved recording. {lead} An essay from Artificially Intelligent, published {long_date(iso)}.")
    opening_spoken = opening_text.replace(long_date(iso), spoken_date(iso))
    closing = "End of the essay. The sources are listed in the written article."
    return (opening_text, opening_spoken), (closing, closing)


def build_blocks(rec_cfg: dict, art: dict, art_meta: dict, rules) -> list[dict]:
    title = art_meta["title"]
    (o_text, o_spk), (c_text, c_spk) = frames_for(rec_cfg, art_meta, title)
    blocks = [{"id": "f-open", "kind": "frame", "text": o_text, "spokenSource": o_spk, "cite": []}]
    for i, p in enumerate(art["body"]):
        clean, marks = strip_citations(p)
        blocks.append({"id": f"p{i:02d}", "kind": "body", "text": p, "spokenSource": clean, "cite": marks})
    blocks.append({"id": "f-close", "kind": "frame", "text": c_text, "spokenSource": c_spk, "cite": []})
    for b in blocks:
        shown = split_sentences(strip_citations(b["text"])[0])
        said = split_sentences(b["spokenSource"])
        assert len(shown) == len(said), (b["id"], shown, said)
        b["sentences"] = [{"text": d, "tts": to_spoken(t, rules)} for d, t in zip(shown, said)]
    return blocks


def synth(text: str, workdir: pathlib.Path, voice: str = VOICE) -> np.ndarray:
    key = hashlib.sha1(f"{voice}|{SR}|{text}".encode()).hexdigest()
    cache = workdir / "cache" / f"{key}.wav"
    if not cache.exists():
        cache.parent.mkdir(parents=True, exist_ok=True)
        tf = cache.with_suffix(".txt")
        tf.write_text(text, encoding="utf-8")
        run(["ffmpeg", "-hide_banner", "-loglevel", "error", "-y", "-f", "lavfi", "-i", f"flite=textfile={tf}:voice={voice}",
             "-ar", str(SR), "-ac", "1", "-acodec", "pcm_s16le", str(cache)])
    sr, data = wavfile.read(cache)
    assert sr == SR
    return data.astype(np.float32) / 32768.0


def trim(x: np.ndarray) -> np.ndarray:
    thr = max(0.004, 0.012 * float(np.abs(x).max()))
    idx = np.where(np.abs(x) > thr)[0]
    if len(idx) == 0:
        return x
    a = max(0, idx[0] - int(PAD * SR))
    b = min(len(x), idx[-1] + int(PAD * SR))
    return x[a:b]


def peak_limit(x: np.ndarray, limit: float, ms: float = 5.0) -> np.ndarray:
    """Offline, zero-latency, true-peak look-ahead limiter: gain reduction never shifts the audio in time."""
    from scipy.ndimage import minimum_filter1d, uniform_filter1d
    w = max(1, int(ms / 1000 * SR))
    from scipy.signal import resample_poly
    n = len(x)
    up = resample_poly(x, 4, 1)[: 4 * n]  # 4x oversampled so inter-sample (true) peaks are limited too
    need = np.minimum(1.0, limit / np.maximum(np.abs(up), 1e-9)).reshape(-1, 4).min(axis=1)
    g = uniform_filter1d(minimum_filter1d(need, size=4 * w + 1), size=2 * w + 1)
    return (x * g).astype(np.float32)


def measure_lufs(wav_path: pathlib.Path) -> tuple[float, float]:
    r = subprocess.run(["ffmpeg", "-hide_banner", "-nostats", "-i", str(wav_path), "-af", "ebur128=peak=true", "-f", "null", "-"],
                       capture_output=True, text=True)
    tail = r.stderr.split("Summary:")[-1]
    i = float(re.search(r"I:\s+(-?[\d.]+) LUFS", tail).group(1))
    pk = float(re.search(r"Peak:\s+(-?[\d.]+) dBFS", tail).group(1))
    return i, pk


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("rec_id")
    ap.add_argument("--work", default=str(ROOT.parent.parent / "build" / "lr" / "work"))
    ap.add_argument("--config", default=str(SRC_DIR / "editorial.json"))
    a = ap.parse_args()
    work = pathlib.Path(a.work)
    work.mkdir(parents=True, exist_ok=True)

    cfg = load_json(a.config)
    rec = next(r for r in cfg["recordings"] if r["id"] == a.rec_id)
    mani = {article_slug(x): x for x in manifest()["articles"]}
    meta = mani[rec["slug"]]
    art = read_article_page(rec["slug"])
    assert art, "article page not found"
    rules = pron_rules()
    blocks = build_blocks(rec, art, meta, rules)

    # --- synthesis (parallel, cached) -------------------------------------------------
    flat = [(bi, si, s["tts"]) for bi, b in enumerate(blocks) for si, s in enumerate(b["sentences"])]
    with cf.ThreadPoolExecutor(max_workers=2) as ex:
        clips = list(ex.map(lambda t: trim(synth(t[2], work)), flat))
    clip_of = {(bi, si): c for (bi, si, _), c in zip(flat, clips)}

    # --- assembly with known offsets ----------------------------------------------------
    out, pos = [np.zeros(int(LEAD * SR), np.float32)], int(LEAD * SR)
    for bi, b in enumerate(blocks):
        for si, s in enumerate(b["sentences"]):
            c = clip_of[(bi, si)]
            s["startSample"], s["endSample"] = pos, pos + len(c)
            out.append(c)
            pos += len(c)
            last_in_block = si == len(b["sentences"]) - 1
            nxt_frame = bi + 1 < len(blocks) and blocks[bi + 1]["kind"] == "frame" or b["kind"] == "frame"
            gap = (GAP_FRAME if nxt_frame else GAP_PARA) if last_in_block else GAP_SENT
            if last_in_block and bi == len(blocks) - 1:
                gap = TAIL
            g = np.zeros(int(round(gap * SR)), np.float32)
            out.append(g)
            pos += len(g)
        b["start"] = round(b["sentences"][0]["startSample"] / SR, 3)
        b["end"] = round(b["sentences"][-1]["endSample"] / SR, 3)
    audio = np.concatenate(out)

    # --- loudness: gain to target, then a zero-delay look-ahead peak limiter ------------------
    tmp_wav = work / f"{a.rec_id}.raw.wav"
    wavfile.write(tmp_wav, SR, (np.clip(audio, -1, 1) * 32767).astype(np.int16))
    lufs0, _ = measure_lufs(tmp_wav)
    gain_db = TARGET_LUFS - lufs0
    audio = peak_limit(audio * (10 ** (gain_db / 20)), LIMIT)
    final_wav = work / f"{a.rec_id}.wav"
    wavfile.write(final_wav, SR, (np.clip(audio, -1, 1) * 32767).astype(np.int16))
    lufs, tp = measure_lufs(final_wav)

    # --- MP3 -------------------------------------------------------------------------------
    mp3 = work / f"{a.rec_id}.mp3"
    run(["ffmpeg", "-hide_banner", "-loglevel", "error", "-y", "-i", str(final_wav), "-ac", "1", "-ar", str(SR),
         "-c:a", "libmp3lame", "-b:a", f"{MP3_KBPS}k", "-write_xing", "1", "-id3v2_version", "3",
         "-metadata", f"title={meta['title']}", "-metadata", "artist=Artificially Intelligent (synthetic demonstration voice)",
         "-metadata", "album=The Listening Room", "-metadata", f"date={meta['publishedAt'][:4]}",
         "-metadata", "comment=Demonstration recording with a synthetic voice (CMU Flite). Not reviewed or approved.",
         str(mp3)])
    probe = json.loads(run(["ffprobe", "-v", "error", "-print_format", "json", "-show_format", "-show_streams", str(mp3)]).stdout)
    dur = float(probe["format"]["duration"])

    # --- waveform overview (300 buckets, 0-100) -----------------------------------------------
    n = 300
    edges = np.linspace(0, len(audio), n + 1).astype(int)
    pk = np.array([np.abs(audio[edges[i]:edges[i + 1]]).max() if edges[i + 1] > edges[i] else 0 for i in range(n)])
    pk = pk / max(pk.max(), 1e-9)
    wave = [int(round(100 * float(v) ** 0.7)) for v in pk]

    # --- script + timing record ------------------------------------------------------------------
    for b in blocks:
        for s in b["sentences"]:
            s["start"], s["end"] = round(s.pop("startSample") / SR, 3), round(s.pop("endSample") / SR, 3)
    spoken_words = sum(len(s["tts"].split()) for b in blocks for s in b["sentences"])
    res = {
        "id": a.rec_id,
        "generatedBy": "scripts/listening-room/lr_narrate.py",
        "engine": {"name": "CMU Flite", "version": run(["ffmpeg", "-version"]).stdout.splitlines()[0], "voice": VOICE,
                   "network": False, "paid": False},
        "article": {"slug": rec["slug"], "bodyHash": art["bodyHash"], "sourcesHash": art["sourcesHash"], "bodyWords": art["bodyWords"],
                    "publishedAt": meta["publishedAt"]},
        "gaps": {"sentence": GAP_SENT, "paragraph": GAP_PARA, "frame": GAP_FRAME, "lead": LEAD, "tail": TAIL, "clipPad": PAD},
        "audio": {"file": mp3.name, "bytes": mp3.stat().st_size, "durationSec": round(dur, 3), "sampleRate": SR, "channels": 1,
                  "bitrate": MP3_KBPS * 1000, "codec": "mp3 (CBR)", "loudnessLUFS": round(lufs, 1), "truePeakDBTP": round(tp, 1),
                  "gainAppliedDB": round(float(gain_db), 1), "limiter": "zero-latency true-peak look-ahead, ceiling -1 dBTP", "sha256": sha256_file(mp3), "format": "audio/mpeg"},
        "speech": {"spokenWords": spoken_words, "wordsPerMinute": round(spoken_words / (dur / 60), 1)},
        "waveform": wave,
        "blocks": blocks,
    }
    dump_json(work / f"{a.rec_id}.narration.json", res)
    print(json.dumps({k: res[k] for k in ("audio", "speech")}, indent=1))
    print("blocks:", len(blocks), "sentences:", sum(len(b["sentences"]) for b in blocks))


if __name__ == "__main__":
    main()
