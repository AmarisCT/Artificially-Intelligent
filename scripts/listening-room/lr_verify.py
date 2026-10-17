#!/usr/bin/env python3
"""Automated checks on a produced recording (workflow steps 7-9).

    python3 scripts/listening-room/lr_verify.py LR001 [--work DIR]

These checks prove what a machine can prove: the transcript equals the approved
article text, the MP3 is what the record says it is, and the sentence timings line
up with the sound in the *decoded MP3* (not the pre-encode audio).

They do NOT prove that the narration is pronounced correctly or sounds acceptable.
That needs a person. The result always lists what was not checked.
"""
from __future__ import annotations

import argparse
import datetime as dt
import json
import pathlib
import subprocess
import sys

import numpy as np

sys.path.insert(0, str(pathlib.Path(__file__).resolve().parent))
from lr_common import ROOT, dump_json, load_json, read_article_page, sha256_file, strip_citations  # noqa: E402

SR = 22050
WIN = int(0.010 * SR)


def decode(mp3: pathlib.Path) -> np.ndarray:
    r = subprocess.run(["ffmpeg", "-hide_banner", "-loglevel", "error", "-i", str(mp3), "-f", "f32le", "-ac", "1", "-ar", str(SR), "-"],
                       capture_output=True, check=True)
    return np.frombuffer(r.stdout, dtype=np.float32)


def rms_db(x: np.ndarray) -> float:
    if len(x) == 0:
        return -120.0
    return 20 * np.log10(max(float(np.sqrt(np.mean(x.astype(np.float64) ** 2))), 1e-7))


def envelope(x: np.ndarray) -> np.ndarray:
    n = len(x) // WIN
    return np.sqrt((x[: n * WIN].reshape(n, WIN).astype(np.float64) ** 2).mean(axis=1))


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("rec_id")
    ap.add_argument("--work", default=str(ROOT.parent.parent / "build" / "lr" / "work"))
    a = ap.parse_args()
    work = pathlib.Path(a.work)
    nar = load_json(work / f"{a.rec_id}.narration.json")
    mp3 = work / f"{a.rec_id}.mp3"
    checks, notes = [], []

    def check(name, ok, detail):
        checks.append({"name": name, "pass": bool(ok), "detail": detail})

    # 1. Transcript equals the approved article text --------------------------------------------------
    art = read_article_page(nar["article"]["slug"])
    body_blocks = [b for b in nar["blocks"] if b["kind"] == "body"]
    same_count = len(body_blocks) == len(art["body"])
    all_equal = same_count and all(b["text"] == p for b, p in zip(body_blocks, art["body"]))
    check("Transcript paragraphs equal the published article paragraphs, word for word", all_equal,
          f"{len(body_blocks)} paragraphs compared with research/published/{nar['article']['slug']}/index.html")
    sent_ok = True
    for b in body_blocks:
        clean, marks = strip_citations(b["text"])
        sent_ok &= (" ".join(s["text"] for s in b["sentences"]) == clean) and (marks == b["cite"])
    check("Sentences rebuild each paragraph exactly (only [n] citation markers are left unspoken)", sent_ok,
          f"{sum(len(b['sentences']) for b in body_blocks)} sentences")
    check("Article text has not changed since narration", art["bodyHash"] == nar["article"]["bodyHash"],
          f"body hash {art['bodyHash'][:19]}…")

    # 2. File facts ---------------------------------------------------------------------------------------
    probe = json.loads(subprocess.run(["ffprobe", "-v", "error", "-print_format", "json", "-show_format", "-show_streams", str(mp3)],
                                      capture_output=True, text=True, check=True).stdout)
    st = probe["streams"][0]
    dur = float(probe["format"]["duration"])
    check("File is MP3, mono, 22.05 kHz, constant 48 kbps", st["codec_name"] == "mp3" and st["channels"] == 1
          and int(st["sample_rate"]) == SR and abs(int(st["bit_rate"]) - 48000) < 600, f"{st['codec_name']} {st['channels']}ch {st['sample_rate']}Hz {st['bit_rate']}bps")
    check("Duration read back from the MP3 equals the recorded duration", abs(dur - nar["audio"]["durationSec"]) < 0.01, f"{dur:.3f}s")
    check("SHA-256 of the file matches the record", sha256_file(mp3) == nar["audio"]["sha256"], nar["audio"]["sha256"][:23] + "…")

    # 3. Timing against the decoded MP3 ---------------------------------------------------------------------
    x = decode(mp3)
    last_end = nar["blocks"][-1]["end"]
    exp_total = last_end + nar["gaps"]["tail"]
    check("Decoded length matches the timeline", abs(len(x) / SR - exp_total) < 0.08, f"decoded {len(x)/SR:.3f}s vs timeline {exp_total:.3f}s")

    sents = [(b["id"], s) for b in nar["blocks"] for s in b["sentences"]]
    env = envelope(x)
    mask = np.zeros(len(env))
    for _, s in sents:
        pad = nar["gaps"]["clipPad"]  # each clip carries 30 ms of lead-in/out around the first/last audible sample
        mask[int((s["start"] + pad) * SR) // WIN: int((s["end"] - pad) * SR) // WIN + 1] = 1
    # global offset by cross-correlation of the speech mask with the decoded envelope
    e = (env > 0.01).astype(float)
    best, best_lag = -1.0, 0
    for lag in range(-25, 26):  # +-250 ms in 10 ms steps
        m2 = np.roll(mask, lag)
        score = float((e * m2).sum() / max(1.0, np.sqrt(e.sum() * m2.sum())))
        if score > best:
            best, best_lag = score, lag
    check("Global timing offset between timeline and decoded MP3 is under 20 ms", abs(best_lag) <= 1,
          f"best alignment at {best_lag*10} ms (mask correlation {best:.3f})")

    # every inter-sentence gap is silent, every sentence contains sound
    gap_bad, gap_n, snd_bad, snd_n = [], 0, [], 0
    dev_on, dev_off = [], []
    for i in range(len(sents) - 1):
        (_, s0), (_, s1) = sents[i], sents[i + 1]
        g0, g1 = s0["end"] + 0.02, s1["start"] - 0.02
        if g1 - g0 < 0.1:
            continue
        gap_n += 1
        seg = x[int(g0 * SR): int(g1 * SR)]
        if rms_db(seg) > -50:
            gap_bad.append((s0["end"], round(rms_db(seg), 1)))
        # onset of speech after the gap
        w = x[int((s1["start"] - 0.05) * SR): int((s1["start"] + 0.35) * SR)]
        en = envelope(w)
        k = np.argmax(en > 0.0075) if (en > 0.0075).any() else None
        if k is not None:
            dev_on.append(((k * WIN) / SR - 0.05 - nar["gaps"]["clipPad"]) * 1000)
    for _, s in sents:
        snd_n += 1
        seg = x[int(s["start"] * SR): int(s["end"] * SR)]
        if rms_db(seg) < -45:
            snd_bad.append((s["start"], round(rms_db(seg), 1)))
    check("Every gap between sentences is silent in the decoded MP3 (below -50 dBFS)", not gap_bad,
          f"{gap_n - len(gap_bad)}/{gap_n} gaps silent" + (f"; exceptions at {gap_bad[:3]}" if gap_bad else ""))
    check("Every sentence interval contains speech in the decoded MP3 (above -45 dBFS)", not snd_bad,
          f"{snd_n - len(snd_bad)}/{snd_n} sentences carry sound" + (f"; exceptions at {snd_bad[:3]}" if snd_bad else ""))
    on = np.array(dev_on)
    check("Speech begins within 100 ms of where the timeline expects it (start + 30 ms lead-in)", bool(len(on)) and float(np.abs(on).max()) <= 100,
          f"median {np.median(on):.0f} ms, worst {np.abs(on).max():.0f} ms over {len(on)} sentence starts")
    # quiet end-of-file check (no clipped or truncated ending)
    tail = x[int((last_end + 0.1) * SR):]
    check("Recording ends in silence rather than being cut off", rms_db(tail) < -50, f"tail level {rms_db(tail):.1f} dBFS")

    notes += [
        "Pronunciation was checked only at the phoneme level (phones.py). No person has listened to this recording.",
        "Prosody, emphasis and naturalness were not assessed.",
        "Omissions are checked only as text: the transcript equals the article. That the voice actually says every word was not independently confirmed by speech recognition (no recogniser is available in the build environment).",
    ]
    out = {
        "checkedAt": dt.datetime.now(dt.timezone.utc).strftime("%Y-%m-%d"),
        "tool": "scripts/listening-room/lr_verify.py",
        "passed": sum(c["pass"] for c in checks), "total": len(checks), "checks": checks, "notChecked": notes,
        "timing": {"method": "sentence clips joined at known sample offsets; checked against the decoded MP3",
                   "globalOffsetMs": best_lag * 10, "medianOnsetMs": float(np.median(on)) if len(on) else None,
                   "worstOnsetMs": float(np.abs(on).max()) if len(on) else None},
    }
    dump_json(work / f"{a.rec_id}.verification.json", out)
    for c in checks:
        print(("PASS " if c["pass"] else "FAIL ") + c["name"] + " — " + c["detail"])
    print(f"{out['passed']}/{out['total']} automated checks passed")
    sys.exit(0 if out["passed"] == out["total"] else 1)


if __name__ == "__main__":
    main()
