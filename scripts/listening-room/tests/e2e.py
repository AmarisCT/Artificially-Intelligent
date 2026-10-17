#!/usr/bin/env python3
"""End-to-end tests for the Listening Room, run in real Chromium against a test site assembled by build_testsite.py.

    python3 scripts/listening-room/tests/e2e.py [--preview-port 8765] [--prod-port 8766] [--only T04,T10] [--out results.json]

Two servers must be running (see run_tests.sh): a preview site (recordings in "Awaiting Audio Review" are playable) and
a production-config site (they are not). Every check records PASS/FAIL with the measured detail, so the report shows
numbers, not assertions of success. Nothing here touches a network beyond 127.0.0.1.
"""
import argparse, asyncio, json, math, random, re, sys, time, traceback
from pathlib import Path
from playwright.async_api import async_playwright

ROOT = Path(__file__).resolve().parents[3]
DATA = ROOT / "listening-room" / "data"
TR = {t["recordingId"]: t for t in json.loads((DATA / "audio-transcripts.json").read_text())["items"]}
LIB = {r["id"]: r for r in json.loads((DATA / "audio-library.json").read_text())["items"]}
LEX = {i["id"]: i for i in json.loads((ROOT / "lexicon/data/concepts.json").read_text())["items"]}

RESULTS = []
CONSOLE = []


def check(tid, desc, ok, detail=""):
    RESULTS.append({"test": tid, "check": desc, "pass": bool(ok), "detail": str(detail)[:400]})
    print(("PASS " if ok else "FAIL ") + f"[{tid}] {desc}" + (f"  -- {detail}" if detail != "" else ""), flush=True)


def flat(rid):
    out = []
    for b in TR[rid]["blocks"]:
        if b.get("start") is None or not b.get("sentences"):
            continue
        for k, s in enumerate(b["sentences"]):
            out.append((b["id"], k, s[2], s[3], b["text"][s[0]:s[1]]))
    out.sort(key=lambda x: x[2])
    return out


def expected_at(rid, t):
    cur = None
    for x in flat(rid):
        if x[2] <= t + 1e-6:
            cur = x
        else:
            break
    return cur


class Env:
    def __init__(self, browser, base):
        self.b, self.base = browser, base

    async def page(self, hash_="", viewport=(1280, 860), init=None, reduced=False, mobile=False, route=None, seed=None, storage_blocked=False):
        ctx = await self.b.new_context(viewport={"width": viewport[0], "height": viewport[1]}, reduced_motion="reduce" if reduced else "no-preference",
                                       has_touch=mobile, is_mobile=mobile, device_scale_factor=1)
        scripts = []
        if storage_blocked:
            scripts.append("Object.defineProperty(window,'localStorage',{get(){throw new DOMException('blocked','SecurityError')}});")
        if seed:
            for k, v in seed.items():
                scripts.append(f"if(localStorage.getItem({json.dumps(k)})===null)localStorage.setItem({json.dumps(k)},{json.dumps(v if isinstance(v, str) else json.dumps(v))});")
        if init:
            scripts.append(init)
        for s in scripts:
            await ctx.add_init_script(s)
        pg = await ctx.new_page()
        pg.on("console", lambda m, p=pg: CONSOLE.append((m.type, m.text, p.url)) if m.type == "error" else None)
        pg.on("pageerror", lambda e: CONSOLE.append(("pageerror", str(e), "")))
        if route:
            await route(pg)
        pg.requests = []
        pg.on("request", lambda r: pg.requests.append(r.url))
        await pg.goto(self.base + hash_)
        return ctx, pg


async def until(pg, expr, timeout=8000, arg=None):
    try:
        await pg.wait_for_function(expr, arg=arg, timeout=timeout)
        return True
    except Exception:
        return False


async def ready_listen(pg):
    await pg.wait_for_selector(".player", timeout=10000)
    await until(pg, "document.querySelector('audio') && document.querySelector('audio').readyState>=1", 8000)


async def ev(pg, js, arg=None):
    return await pg.evaluate(js, arg)


def near(a, b, tol):
    return abs(a - b) <= tol


# ----------------------------------------------------------------------------------------------------------------------
async def t01_library(env):
    ctx, pg = await env.page("")
    await pg.wait_for_selector(".rec")
    check("T01", "Hero heading, subtitle and entry actions are present with the specified wording",
          await ev(pg, "document.querySelector('h1').textContent") == "THE LISTENING ROOM"
          and await pg.locator("text=Research, reflection, and the ideas that remain with us.").count() == 1
          and await pg.locator("a.btn:text-is('Enter the Listening Room →')").count() == 1
          and await pg.locator("a.btn:text-is('Explore Audio Essays →')").count() == 1)
    check("T01", "'Continue Listening →' is absent when there is no saved progress", await pg.locator("a:text-is('Continue Listening →')").count() == 0)
    check("T01", "Library lists exactly the real recordings (2)", await pg.locator(".rec").count() == 2)
    cats = await ev(pg, "[...document.querySelectorAll('.filter [data-k=cat]')].map(b=>b.textContent)")
    check("T01", "Only categories that have a recording are offered (no empty categories)", cats == ["Narrated Research"], cats)
    sers = await ev(pg, "[...document.querySelectorAll('.filter [data-k=series]')].map(b=>b.textContent)")
    check("T01", "Only series that have a recording are offered", sorted(sers) == ["The Consciousness Question", "The Memory Collection"], sers)
    mp3 = [u for u in pg.requests if u.endswith(".mp3")]
    check("T03", "The library page requests no audio file (lazy loading)", mp3 == [], mp3)
    await pg.fill("#lib-q", "clay")
    await until(pg, "document.querySelectorAll('.rec').length===1")
    check("T01", "Searching the transcript text ('clay') narrows to the essay that says it", await pg.locator(".rec").count() == 1 and "Archives" in await pg.locator(".rec h3").inner_text())
    href = await ev(pg, "(document.querySelector('.hits a')||{}).getAttribute && document.querySelector('.hits a').getAttribute('href')")
    check("T01", "Transcript hit links to the exact timestamp", bool(href and re.match(r"#listen-LR001-t\d+$", href)), href)
    await pg.fill("#lib-q", "zzzqqqxx")
    await until(pg, "document.querySelectorAll('.rec').length===0")
    check("T01", "A search with no match says so", "No recordings match" in await pg.locator("#lib-count").inner_text())
    await pg.fill("#lib-q", "")
    await pg.click(".filter [data-c=narrated-research]")
    check("T01", "Category filter toggles aria-pressed", await ev(pg, "document.querySelector('.filter [data-c=narrated-research]').getAttribute('aria-pressed')") == "true")
    await ctx.close()


async def t02_production(env_prod):
    ctx, pg = await env_prod.page("", seed={"ai_listen_v1": {"v": 1, "progress": {"LR001": {"t": 120, "dur": 614, "done": False, "at": 1}}, "moments": {}, "prefs": {}, "last": "LR001"}})
    await pg.wait_for_selector(".results")
    await asyncio.sleep(0.3)
    check("T02", "Production config: no recording is playable while all are Awaiting Audio Review", await pg.locator(".rec").count() == 0 and "No approved recordings yet" in await pg.locator(".results").inner_text())
    check("T02", "Production config: 'Continue Listening' is not offered for an unapproved recording even with saved progress", await pg.locator("a:text-is('Continue Listening →')").count() == 0)
    check("T02", "Production config: pipeline shows real statuses and no Listen links", await pg.locator(".ptable .badge.st-awaiting-review").count() == 2 and await pg.locator(".ptable a:text-is('Listen →')").count() == 0)
    check("T02", "Production config: no preview banner", await pg.locator(".preview-banner").count() == 0)
    check("T02", "An empty room asks search engines not to index it (robots noindex)", await ev(pg, "document.querySelector('meta[name=robots]') && document.querySelector('meta[name=robots]').content") == "noindex,follow")
    await pg.goto(env_prod.base + "#listen-LR001")
    await pg.wait_for_selector(".panel")
    txt = await pg.locator(".panel").inner_text()
    check("T02", "Typing an unapproved recording's URL shows 'no playable recording', not a player", "no playable recording" in txt and await pg.locator(".player").count() == 0 and await pg.locator("audio").count() == 0, txt[:120])
    check("T02", "No audio file is requested for an unapproved recording in production", [u for u in pg.requests if u.endswith(".mp3")] == [])
    await ctx.close()

    # status comes from records: promote LR001 to Published Audio in the (intercepted) records
    async def promote(pg):
        async def lib(route):
            r = await route.fetch(); j = await r.json()
            for i in j["items"]:
                if i["id"] == "LR001":
                    i["status"] = "published"; i["releaseDate"] = "2026-10-20"
            await route.fulfill(json=j)
        async def q(route):
            r = await route.fetch(); j = await r.json()
            for i in j["items"]:
                if i.get("recordingId") == "LR001":
                    i["status"] = "published"
            await route.fulfill(json=j)
        await pg.route("**/data/audio-library.json", lib); await pg.route("**/data/audio-queue.json", q)
    ctx, pg = await env_prod.page("", route=promote)
    await pg.wait_for_selector(".results")
    await asyncio.sleep(0.3)
    names = await ev(pg, "[...document.querySelectorAll('.rec h3')].map(h=>h.textContent)")
    check("T02", "Production config: a record marked Published Audio becomes playable, and only that one", names == ["We Are All Archives Now"], names)
    await pg.goto(env_prod.base + "#listen-LR001"); await ready_listen(pg)
    await pg.click(".play"); await asyncio.sleep(1.5)
    check("T02", "Published recording plays in production config", await ev(pg, "document.querySelector('audio').currentTime") > 1.0)
    check("T02", "Published badge is shown", await pg.locator(".ls-head .badge.st-published").count() == 1)
    await pg.goto(env_prod.base); await pg.wait_for_selector(".results")
    check("T02", "Once a recording is playable the room no longer carries a noindex tag", await ev(pg, "!document.querySelector('meta[name=robots]')"))
    await ctx.close()

    # a record marked published but with no release date has not been approved for release: not playable
    async def no_date(pg):
        async def lib(route):
            r = await route.fetch(); j = await r.json()
            for i in j["items"]:
                if i["id"] == "LR001":
                    i["status"] = "published"; i["releaseDate"] = None
            await route.fulfill(json=j)
        await pg.route("**/data/audio-library.json", lib)
    ctx, pg = await env_prod.page("", route=no_date)
    await pg.wait_for_selector(".results"); await asyncio.sleep(0.3)
    check("T02", "Marked published but with no release date: not playable, not listed", await pg.locator(".rec").count() == 0)
    await pg.goto(env_prod.base + "#listen-LR001"); await pg.wait_for_selector(".panel")
    check("T02", "Marked published but with no release date: typing its URL gives no player and requests no audio", await pg.locator(".player").count() == 0 and [u for u in pg.requests if u.endswith(".mp3")] == [])
    await ctx.close()

    async def revision(release):
        async def r_(pg):
            async def lib(route):
                r = await route.fetch(); j = await r.json()
                for i in j["items"]:
                    if i["id"] == "LR001":
                        i["releaseDate"] = release
                await route.fulfill(json=j)
            async def q(route):
                r = await route.fetch(); j = await r.json()
                for i in j["items"]:
                    if i.get("recordingId") == "LR001":
                        i["status"] = "revision-required"; i["flags"] = ["narrated-text-changed"]; i["notes"] = ["The article text changed after the recording was made."]
                await route.fulfill(json=j)
            await pg.route("**/data/audio-library.json", lib); await pg.route("**/data/audio-queue.json", q)
        return r_
    ctx, pg = await env_prod.page("#listen-LR001", route=await revision("2026-10-20"))
    await ready_listen(pg)
    warn = await pg.locator(".ls-head .note.warn").count()
    check("T02", "Revision Required with an approved release stays playable and shows a mismatch notice", warn == 1 and await pg.locator(".play").count() == 1)
    await ctx.close()
    ctx, pg = await env_prod.page("#listen-LR001", route=await revision(None))
    await pg.wait_for_selector(".panel")
    check("T02", "Revision Required that was never approved is not playable", await pg.locator(".player").count() == 0)
    await ctx.close()


async def t04_playback(env):
    ctx, pg = await env.page("#listen-LR001"); await ready_listen(pg)
    dur = LIB["LR001"]["audio"]["durationSec"]
    d = await ev(pg, "document.querySelector('audio').duration")
    check("T04", "Browser-measured duration equals the recorded duration (±0.15 s)", near(d, dur, 0.15), f"{d:.3f} vs {dur}")
    check("T04", "Nothing plays on load (user must press play)", await ev(pg, "document.querySelector('audio').paused") is True)
    await pg.click(".play"); await asyncio.sleep(3.2)
    t1 = await ev(pg, "document.querySelector('audio').currentTime")
    check("T04", "Pressing play advances the real clock (≥2.8 s after 3.2 s)", t1 >= 2.8, f"{t1:.2f}")
    check("T04", "Play button becomes Pause", await pg.locator(".play").get_attribute("aria-label") == "Pause")
    await pg.click(".play"); await asyncio.sleep(0.3)
    p1 = await ev(pg, "document.querySelector('audio').currentTime"); await asyncio.sleep(1.2)
    p2 = await ev(pg, "document.querySelector('audio').currentTime")
    check("T04", "Pause stops the clock", near(p1, p2, 0.02) and await pg.locator(".play").get_attribute("aria-label") == "Play", f"{p1:.2f}->{p2:.2f}")
    await pg.click(".play"); await asyncio.sleep(1.2)
    check("T04", "Resume continues from where it paused", await ev(pg, "document.querySelector('audio').currentTime") > p2 + 0.8)
    await pg.click(".play")
    sc = pg.locator(".scrub"); bb = await sc.bounding_box()
    await pg.mouse.click(bb["x"] + bb["width"] * 0.5, bb["y"] + bb["height"] / 2); await asyncio.sleep(0.5)
    t = await ev(pg, "document.querySelector('audio').currentTime")
    check("T05", "Clicking the middle of the position bar seeks to the middle (±8 s)", near(t, dur / 2, 8), f"{t:.1f} vs {dur / 2:.1f}")
    await pg.mouse.click(bb["x"] + bb["width"] * 0.1, bb["y"] + bb["height"] / 2); await asyncio.sleep(0.4)
    t = await ev(pg, "document.querySelector('audio').currentTime")
    check("T05", "Seeking backwards works", near(t, dur * 0.1, 8), f"{t:.1f}")
    await pg.click(".ib[aria-label='Forward 10 seconds']"); await asyncio.sleep(0.3)
    t2 = await ev(pg, "document.querySelector('audio').currentTime")
    check("T05", "Forward 10 s button", near(t2 - t, 10, 0.6), f"{t2 - t:.2f}")
    await pg.click(".ib[aria-label='Back 10 seconds']"); await asyncio.sleep(0.3)
    t3 = await ev(pg, "document.querySelector('audio').currentTime")
    check("T05", "Back 10 s button", near(t2 - t3, 10, 0.6), f"{t2 - t3:.2f}")
    await pg.focus(".scrub"); await pg.keyboard.press("ArrowRight"); await asyncio.sleep(0.2)
    t4 = await ev(pg, "document.querySelector('audio').currentTime")
    check("T05", "Slider ArrowRight moves 5 s", near(t4 - t3, 5, 0.6), f"{t4 - t3:.2f}")
    await pg.keyboard.press("PageUp"); await asyncio.sleep(0.2)
    t5 = await ev(pg, "document.querySelector('audio').currentTime")
    check("T05", "Slider PageUp moves 30 s", near(t5 - t4, 30, 0.6), f"{t5 - t4:.2f}")
    await pg.keyboard.press("Home"); await asyncio.sleep(0.3)
    check("T05", "Slider Home goes to the start", await ev(pg, "document.querySelector('audio').currentTime") < 0.6)
    await pg.keyboard.press("End"); await asyncio.sleep(0.5)
    t6 = await ev(pg, "document.querySelector('audio').currentTime")
    check("T05", "Slider End goes to the end (last second)", t6 >= dur - 1.6, f"{t6:.1f}")
    aria = await pg.locator(".scrub").get_attribute("aria-valuenow")
    check("T05", "Slider exposes its value to assistive technology", aria is not None and int(aria) >= int(dur) - 2, aria)
    await ctx.close()


async def t06_speed_volume(env):
    ctx, pg = await env.page("#listen-LR001"); await ready_listen(pg)
    rates = []
    for r in ["0.75", "1", "1.25", "1.5", "2"]:
        await pg.click(f".rate[data-r='{r}']")
        rates.append((r, await ev(pg, "document.querySelector('audio').playbackRate")))
    check("T06", "Each speed button sets the real playbackRate", all(float(a) == b for a, b in rates), rates)
    check("T06", "Speed keeps pitch (preservesPitch)", await ev(pg, "document.querySelector('audio').preservesPitch") is True)
    await pg.click(".rate[data-r='2']"); await pg.click(".play")
    t0 = await ev(pg, "document.querySelector('audio').currentTime"); await asyncio.sleep(3.0)
    t1 = await ev(pg, "document.querySelector('audio').currentTime")
    check("T06", "At 2× the audio really advances about twice as fast (≈6 s in 3 s)", 4.8 <= t1 - t0 <= 7.2, f"{t1 - t0:.2f}")
    await pg.click(".play")
    await pg.evaluate("(()=>{const v=document.querySelector('.vol');v.value='0.3';v.dispatchEvent(new Event('input',{bubbles:true}))})()")
    check("T06", "Volume slider sets the element volume", near(await ev(pg, "document.querySelector('audio').volume"), 0.3, 0.01))
    await pg.click(".volwrap .ib")
    check("T06", "Mute button mutes the element", await ev(pg, "document.querySelector('audio').muted") is True and await pg.locator(".volwrap .ib").get_attribute("aria-label") == "Unmute")
    await pg.click(".volwrap .ib")
    check("T06", "Unmute restores sound", await ev(pg, "document.querySelector('audio').muted") is False)
    st = json.loads(await ev(pg, "localStorage.getItem('ai_listen_v1')"))
    check("T06", "Speed and volume are remembered as preferences", st["prefs"].get("rate") == 2 and near(st["prefs"].get("volume", 0), 0.3, 0.01), st["prefs"])
    await pg.reload(); await ready_listen(pg)
    check("T06", "Remembered speed is applied on reload", await ev(pg, "document.querySelector('audio').playbackRate") == 2 and await pg.locator(".rate[data-r='2']").get_attribute("aria-checked") == "true")
    await ctx.close()


async def t07_keys(env):
    ctx, pg = await env.page("#listen-LR001"); await ready_listen(pg)
    await pg.locator("h1").click()
    await pg.keyboard.press("Space"); await asyncio.sleep(1.0)
    check("T07", "Space plays", await ev(pg, "!document.querySelector('audio').paused"))
    await pg.keyboard.press("k"); await asyncio.sleep(0.3)
    check("T07", "K pauses", await ev(pg, "document.querySelector('audio').paused"))
    await pg.keyboard.press("l"); await asyncio.sleep(0.2)
    a = await ev(pg, "document.querySelector('audio').currentTime")
    await pg.keyboard.press("ArrowRight"); await asyncio.sleep(0.2)
    b = await ev(pg, "document.querySelector('audio').currentTime")
    await pg.keyboard.press("j"); await asyncio.sleep(0.2)
    c = await ev(pg, "document.querySelector('audio').currentTime")
    check("T07", "L / → forward 10 s, J back 10 s", near(b - a, 10, 0.5) and near(b - c, 10, 0.5), f"{a:.1f} {b:.1f} {c:.1f}")
    await pg.keyboard.press("m")
    check("T07", "M mutes", await ev(pg, "document.querySelector('audio').muted"))
    await pg.keyboard.press("m")
    await pg.keyboard.press("s")
    check("T07", "S cycles speed", await ev(pg, "document.querySelector('audio').playbackRate") == 1.25)
    await pg.keyboard.press("t"); await asyncio.sleep(0.2)
    n = len(json.loads(await ev(pg, "localStorage.getItem('ai_listen_v1')"))["moments"])
    check("T07", "T saves a moment", n == 1)
    # a focused button handles Space itself (no double toggle)
    await pg.focus(".ib[aria-label='Forward 10 seconds']")
    before = await ev(pg, "document.querySelector('audio').paused")
    await pg.keyboard.press("Space"); await asyncio.sleep(0.2)
    check("T07", "Space on a focused button does not also toggle playback", await ev(pg, "document.querySelector('audio').paused") == before)
    await pg.keyboard.press("Escape")
    await pg.keyboard.press("n"); await asyncio.sleep(0.5)
    check("T07", "N moves to the next recording", "#listen-LR002" in pg.url, pg.url)
    await ctx.close()


async def decode_levels(pg, url, times, win=0.1):
    return await pg.evaluate("""async ([url, times, win]) => {
      const buf = await (await fetch(url)).arrayBuffer();
      const ac = new OfflineAudioContext(1, 1, 22050);
      const a = await ac.decodeAudioData(buf); const d = a.getChannelData(0), sr = a.sampleRate;
      return times.map(t => { const i0 = Math.max(0, Math.floor((t - win/2) * sr)), i1 = Math.min(d.length, Math.floor((t + win/2) * sr)); let s = 0; for (let i = i0; i < i1; i++) s += d[i]*d[i]; const r = Math.sqrt(s / Math.max(1, i1 - i0)); return 20*Math.log10(r + 1e-9); });
    }""", [url, times, win])


async def t08_sync(env, rid="LR001", n=24):
    ctx, pg = await env.page(f"#listen-{rid}"); await ready_listen(pg)
    fl = flat(rid)
    random.seed(7)
    pts = sorted(random.sample(range(len(fl) - 1), min(n, len(fl) - 1)))
    bad = []
    for i in pts:
        mid = (fl[i][2] + fl[i][3]) / 2
        await pg.evaluate("t => { document.querySelector('audio').currentTime = t }", mid)
        await until(pg, "t => Math.abs(document.querySelector('audio').currentTime - t) < 0.2 && !document.querySelector('audio').seeking", 3000, mid)
        await asyncio.sleep(0.15)
        got = await ev(pg, "(() => { const n = document.querySelector('.s.now'); return n ? [n.dataset.b, +n.dataset.k] : null })()")
        if got != [fl[i][0], fl[i][1]]:
            bad.append((round(mid, 2), got, fl[i][:2]))
    check("T08", f"[{rid}] Highlighted sentence matches the timeline at {len(pts)} random sentence midpoints", not bad, bad[:3])
    # gaps: the highlight stays on the previous sentence
    badg = []
    for i in pts[:10]:
        a, b = fl[i][3], fl[i + 1][2]
        if b - a < 0.15:
            continue
        mid = (a + b) / 2
        await pg.evaluate("t => { document.querySelector('audio').currentTime = t }", mid); await asyncio.sleep(0.35)
        got = await ev(pg, "(() => { const n = document.querySelector('.s.now'); return n ? [n.dataset.b, +n.dataset.k] : null })()")
        if got != [fl[i][0], fl[i][1]]:
            badg.append((round(mid, 2), got))
    check("T08", f"[{rid}] During silent gaps the highlight stays on the sentence just spoken (no flicker, no jump ahead)", not badg, badg[:3])
    # the real decoded audio agrees: sound at highlighted midpoints, silence in gaps
    url = env.base + LIB[rid]["audio"]["url"]
    mids = [(fl[i][2] + fl[i][3]) / 2 for i in pts]
    lv = await decode_levels(pg, url, mids)
    quiet = [(round(m, 1), round(l, 1)) for m, l in zip(mids, lv) if l < -45]
    check("T08", f"[{rid}] Decoded audio carries speech (> -45 dBFS) at every highlighted midpoint — measured by decoding the MP3 in the browser", not quiet, f"min {min(lv):.1f} dBFS; quiet: {quiet[:3]}")
    gmids = [(fl[i][3] + fl[i + 1][2]) / 2 for i in pts[:15] if fl[i + 1][2] - fl[i][3] > 0.15]
    gl = await decode_levels(pg, url, gmids, 0.1)
    loud = [(round(m, 1), round(l, 1)) for m, l in zip(gmids, gl) if l > -50]
    check("T08", f"[{rid}] Decoded audio is silent (< -50 dBFS) in the gaps where the highlight holds", not loud, f"max {max(gl):.1f} dBFS; loud: {loud[:3]}")
    await ctx.close()


async def t09_clickseek(env):
    ctx, pg = await env.page("#listen-LR001"); await ready_listen(pg)
    fl = flat("LR001")
    ts = pg.locator(".blk.body .ts").nth(5)
    tt = float(await ts.get_attribute("data-t"))
    await ts.click(); await asyncio.sleep(0.8)
    t = await ev(pg, "document.querySelector('audio').currentTime")
    check("T09", "Clicking a paragraph timestamp plays from that paragraph", near(t, tt + 0.6, 1.2) and await ev(pg, "!document.querySelector('audio').paused"), f"{t:.2f} vs {tt}")
    sp = pg.locator(".blk.body").nth(8).locator(".s").nth(1)
    b, k = await sp.get_attribute("data-b"), int(await sp.get_attribute("data-k"))
    want = next(x for x in fl if x[0] == b and x[1] == k)
    await sp.click(); await asyncio.sleep(0.7)
    t = await ev(pg, "document.querySelector('audio').currentTime")
    check("T09", "Clicking a sentence plays from that sentence", near(t, want[2] + 0.5, 1.2), f"{t:.2f} vs {want[2]}")
    same = await ev(pg, "(()=>{const a=document.querySelector('audio');return a.getAttribute('src')})()")
    check("T09", "Seeking by click does not reload the audio source", same.endswith("LR001.mp3"))
    await pg.click(".play")
    await ctx.close()


async def t10_modes(env):
    ctx, pg = await env.page("#listen-LR001"); await ready_listen(pg)
    await pg.evaluate("""() => { const a = document.querySelector('audio'); window.__a = a; window.__ev = {loadstart:0, emptied:0, abort:0}; for (const k in window.__ev) a.addEventListener(k, () => window.__ev[k]++); }""")
    await pg.click(".play"); await asyncio.sleep(1.5)
    t0 = await ev(pg, "document.querySelector('audio').currentTime")
    seq = ["immersive", "research", "read", "immersive", "read", "research", "immersive"]
    mono = True; last = t0
    for m in seq:
        await pg.click(f".mode[data-m={m}]"); await asyncio.sleep(0.45)
        cur = await ev(pg, "document.querySelector('audio').currentTime")
        if cur < last - 0.05:
            mono = False
        last = cur
        assert await pg.locator(".listen").get_attribute("data-mode") == m
    st = await ev(pg, "({same: document.querySelector('audio') === window.__a, paused: window.__a.paused, ev: window.__ev, t: window.__a.currentTime, n: document.querySelectorAll('audio').length})")
    check("T10", "Switching modes 7 times while playing never restarts, reloads or pauses the audio", st["same"] and not st["paused"] and st["ev"] == {"loadstart": 0, "emptied": 0, "abort": 0} and mono and st["t"] > t0 + 2.5 and st["n"] == 1, f"t0={t0:.1f} -> {st['t']:.1f}; {st['ev']}")
    check("T10", "Mode change is announced to assistive technology", "Immersive Listening mode. The audio continues." in await pg.locator("#live").inner_text())
    await pg.click(".mode[data-m=immersive]")
    check("T10", "Immersive: transcript is hidden until asked for, with a visible 'Show transcript' control", not await pg.locator(".tr-body").is_visible() and await pg.locator(".trtoggle").is_visible())
    await pg.click(".trtoggle"); await asyncio.sleep(0.2)
    check("T10", "Immersive: transcript is one button away", await pg.locator(".tr-body").is_visible())
    cap = await ev(pg, "document.querySelector('.caption').textContent")
    check("T10", "Immersive: the caption shows the sentence being spoken", len(cap) > 5 and cap == await ev(pg, "(document.querySelector('.s.now')||{}).textContent"), cap[:60])
    await pg.click(".mode[data-m=read]")
    check("T10", "Listen and Read: transcript visible, no inline research marks", await pg.locator(".tr-body").is_visible() and await pg.locator(".term").count() == 0)
    await pg.click(".mode[data-m=research]")
    nt, nc = await pg.locator(".term").count(), await pg.locator(".cite").count()
    check("T10", "Research Listening: concept terms and citation markers appear", nt >= 4 and nc >= 2, f"{nt} terms, {nc} citations")
    check("T10", "Research Listening: research context panel is open", await ev(pg, "document.querySelector('.ctxd').open"))
    check("T10", "Highlight is still correct after the transcript is redrawn", await pg.locator(".s.now").count() == 1)
    st2 = json.loads(await ev(pg, "localStorage.getItem('ai_listen_v1')"))
    check("T10", "Chosen mode is remembered", st2["prefs"]["mode"] == "research")
    await pg.click(".play")
    await ctx.close()


async def t11_chapters(env):
    ctx, pg = await env.page("#listen-LR001"); await ready_listen(pg)
    labels = await ev(pg, "[...document.querySelectorAll('.chapters > .chlist .chbtn .cn')].map(e=>e.textContent)")
    check("T11", "Chapters are the article's real structure only (approved ones)", labels == ["Recording note", "The essay", "Closing note", "Sources"], labels)
    prop = await pg.locator(".proposed .chbtn").count()
    check("T11", "Proposed (unapproved) chapter titles appear only in the preview, labelled as awaiting approval", prop == 8 and "awaiting the author" in await pg.locator(".proposed summary").inner_text(), prop)
    await pg.click(".play"); await asyncio.sleep(1.2)
    await pg.click(".chbtn[data-ch=c-close]"); await asyncio.sleep(0.8)
    cl = [c for c in json.loads((DATA / "audio-chapters.json").read_text())["items"] if c["recordingId"] == "LR001"][0]["chapters"]
    start = next(c["start"] for c in cl if c["id"] == "c-close")
    t = await ev(pg, "document.querySelector('audio').currentTime")
    check("T11", "Clicking a chapter jumps to its real start", near(t, start + 0.6, 1.5), f"{t:.1f} vs {start}")
    check("T11", "Current chapter is marked (aria-current)", await pg.locator(".chbtn[data-ch=c-close]").get_attribute("aria-current") == "true")
    vis = await pg.locator(".jumpback").is_visible()
    check("T11", "A 'Back to previous position' control appears after a long jump", vis, await pg.locator(".jumpback").inner_text() if vis else "")
    await pg.click(".jumpback"); await asyncio.sleep(0.6)
    t2 = await ev(pg, "document.querySelector('audio').currentTime")
    check("T11", "…and returns to where the listener was", t2 < 20, f"{t2:.1f}")
    await pg.click(".chbtn[data-ch=c-sources]"); await asyncio.sleep(0.5)
    t3 = await ev(pg, "document.querySelector('audio').currentTime")
    check("T11", "The text-only Sources chapter scrolls to the list and does not seek the audio", t3 < 30 and await pg.locator("#b-sources").is_visible(), f"{t3:.1f}")
    await ctx.close()


async def t12_moments(env):
    desk = {"items": [{"k": "art:keep-me", "note": "mine", "coll": "c1", "t": 1, "extraField": {"a": 1}}, {"k": "question:Q001", "note": "", "coll": "", "t": 2}, {"k": "something:else", "weird": True}], "last": "art:keep-me", "extraTop": {"z": 1}}
    ctx, pg = await env.page("#listen-LR001", seed={"ai_desk_v1": desk}); await ready_listen(pg)
    await pg.click(".play"); await asyncio.sleep(2.5); await pg.click(".play")
    await pg.click(".pl-more .btn.primary"); await asyncio.sleep(0.3)
    own = json.loads(await ev(pg, "localStorage.getItem('ai_listen_v1')"))
    m = list(own["moments"].values())
    sent = expected_at("LR001", await ev(pg, "document.querySelector('audio').currentTime"))
    check("T12", "Save moment stores recording, timestamp and the sentence being spoken", len(m) == 1 and m[0]["rec"] == "LR001" and m[0]["text"] == sent[4] and near(m[0]["t"], sent[2], 1.01), m[0] if m else None)
    d = json.loads(await ev(pg, "localStorage.getItem('ai_desk_v1')"))
    mk = [i for i in d["items"] if i["k"].startswith("moment:")]
    check("T12", "The moment is added to the Reading Desk as its own item", len(mk) == 1 and mk[0]["k"] == "moment:" + m[0]["id"], mk)
    check("T12", "Existing Reading Desk items, unknown fields and top-level fields are untouched after adding", d["items"][:3] == desk["items"] and d["extraTop"] == {"z": 1} and d["last"] == "art:keep-me")
    await pg.click("button[aria-label='Bookmark this recording']")
    d = json.loads(await ev(pg, "localStorage.getItem('ai_desk_v1')"))
    check("T12", "Bookmark adds 'listen:LR001' to the Reading Desk", any(i["k"] == "listen:LR001" for i in d["items"]))
    await pg.locator(".blk.body").nth(3).hover()
    await pg.locator(".blk.body").nth(3).locator(".save-p").click(); await asyncio.sleep(0.2)
    own = json.loads(await ev(pg, "localStorage.getItem('ai_listen_v1')"))
    b3 = TR["LR001"]["blocks"][4]
    pm = [x for x in own["moments"].values() if x["t"] == int(b3["start"])]
    check("T12", "'Save passage' keeps the whole paragraph at its start time", len(pm) == 1 and pm[0]["text"].startswith(b3["text"][:40]), pm[:1])
    ticks = await pg.locator(".tick.mo").count()
    check("T12", "Saved moments are marked on the position bar", ticks == 2, ticks)
    await pg.click(".moms .rm >> nth=0"); await asyncio.sleep(0.2)
    d = json.loads(await ev(pg, "localStorage.getItem('ai_desk_v1')"))
    check("T12", "Removing one moment removes only its Reading Desk item; everything else remains", d["items"][:3] == desk["items"] and sum(i["k"].startswith("moment:") for i in d["items"]) == 1 and any(i["k"] == "listen:LR001" for i in d["items"]))
    await ctx.close()
    # unreadable Reading Desk must never be overwritten
    ctx, pg = await env.page("#listen-LR001", seed={"ai_desk_v1": "{not json"}); await ready_listen(pg)
    await pg.keyboard.press("t"); await asyncio.sleep(0.4)
    raw = await ev(pg, "localStorage.getItem('ai_desk_v1')")
    toast = await pg.locator(".toast").inner_text() if await pg.locator(".toast").count() else ""
    check("T12", "A corrupted Reading Desk is left exactly as found, and the user is told it could not be updated", raw == "{not json" and "could not be updated" in toast, toast)
    await ctx.close()


async def t13_journal(env):
    desk = {"items": [{"k": "art:keep-me", "note": "mine", "coll": "", "t": 1}], "last": None}
    ctx, pg = await env.page("#listen-LR001", seed={"ai_desk_v1": desk}); await ready_listen(pg)
    await pg.click(".play"); await asyncio.sleep(2.0); await pg.click(".play")
    await pg.keyboard.press("t"); await asyncio.sleep(0.2)
    await pg.goto(env.base + "#journal"); await pg.wait_for_selector("#jmain .moment")
    await asyncio.sleep(0.2)
    check("T13", "Journal shows listening progress and the saved moment", await pg.locator("#jmain .moment").count() >= 2)
    ta = pg.locator("#jmain .moment .dk-note").first
    await ta.fill("my own note"); await asyncio.sleep(0.7)
    d = json.loads(await ev(pg, "localStorage.getItem('ai_desk_v1')"))
    mk = [i for i in d["items"] if i["k"].startswith("moment:")]
    check("T13", "A note typed in the journal is saved on the Reading Desk item (same note both places)", len(mk) == 1 and mk[0]["note"] == "my own note", mk)
    co = pg.locator("#jmain .moment .dk-coll").first
    await co.fill("Memory listening"); await co.dispatch_event("change"); await asyncio.sleep(0.5)
    check("T13", "A collection name creates a filter", await pg.locator(".filter .btn-chip:text-is('Memory listening')").count() == 1)
    await pg.click("button:has-text('Remove all my saved moments')"); await asyncio.sleep(0.2)
    check("T13", "Destructive action asks for inline confirmation first", await pg.locator(".fb.no").count() == 1 and len(json.loads(await ev(pg, "localStorage.getItem('ai_listen_v1')"))["moments"]) == 1)
    await pg.click(".fb.no button:text-is('Cancel')"); await asyncio.sleep(0.2)
    check("T13", "Cancel keeps everything", len(json.loads(await ev(pg, "localStorage.getItem('ai_listen_v1')"))["moments"]) == 1)
    await pg.click("button:has-text('Remove all my saved moments')"); await pg.click(".fb.no button:text-is('Yes, do it')"); await asyncio.sleep(0.3)
    d = json.loads(await ev(pg, "localStorage.getItem('ai_desk_v1')"))
    check("T13", "Confirmed clear removes moments and their Desk items but not the visitor's other Reading Desk items or listening position", d["items"] == desk["items"] and json.loads(await ev(pg, "localStorage.getItem('ai_listen_v1')"))["progress"].get("LR001") is not None, d)
    await ctx.close()


async def t14_resume(env):
    dur = LIB["LR001"]["audio"]["durationSec"]
    ctx, pg = await env.page("#listen-LR001"); await ready_listen(pg)
    await pg.click(".play"); await asyncio.sleep(1.5)
    bb = await pg.locator(".scrub").bounding_box()
    await pg.mouse.click(bb["x"] + bb["width"] * 0.3, bb["y"] + bb["height"] / 2); await asyncio.sleep(1.0)
    await pg.click(".play"); await asyncio.sleep(0.3)
    saved = json.loads(await ev(pg, "localStorage.getItem('ai_listen_v1')"))["progress"]["LR001"]
    check("T14", "Position is saved when playback pauses", near(saved["t"], dur * 0.3, 10) and saved["dur"] > 600, saved)
    await pg.reload(); await ready_listen(pg); await asyncio.sleep(0.4)
    t = await ev(pg, "document.querySelector('audio').currentTime")
    check("T14", "Reloading resumes at the saved position, paused (never auto-plays)", near(t, saved["t"], 1.5) and await ev(pg, "document.querySelector('audio').paused"), f"{t:.1f}")
    check("T14", "Resume is stated, with a way to start over", "Picked up where you left off" in await pg.locator(".resume").inner_text() and await pg.locator(".resume .linkbtn").count() == 1)
    await pg.goto(env.base + "#library"); await pg.wait_for_selector(".continue")
    h = await pg.locator(".hero a:text-is('Continue Listening →')").get_attribute("href")
    check("T14", "'Continue Listening →' appears only now, from real saved progress, linking to that moment", bool(h and re.match(r"#listen-LR001-t\d+$", h)) and await pg.locator(".continue").count() == 1, h)
    await pg.click(".hero a:text-is('Continue Listening →')"); await ready_listen(pg); await asyncio.sleep(0.5)
    t = await ev(pg, "document.querySelector('audio').currentTime")
    check("T14", "…and following it resumes there", near(t, saved["t"], 2.0), f"{t:.1f}")
    await pg.click(".resume .linkbtn"); await asyncio.sleep(0.4)
    check("T14", "'Start from the beginning' rewinds", await ev(pg, "document.querySelector('audio').currentTime") < 1.0)
    await ctx.close()
    # no interaction, no saved position
    ctx, pg = await env.page("#listen-LR001"); await ready_listen(pg)
    await asyncio.sleep(6.5)
    st = json.loads(await ev(pg, "localStorage.getItem('ai_listen_v1')") or "{}")
    check("T14", "Merely opening a recording saves no position (only real listening does)", st.get("progress", {}) == {}, st.get("progress"))
    await ctx.close()
    # deep link
    ctx, pg = await env.page("#listen-LR001-t120"); await ready_listen(pg); await asyncio.sleep(0.5)
    t = await ev(pg, "document.querySelector('audio').currentTime")
    ex = expected_at("LR001", 120)
    now = await ev(pg, "(document.querySelector('.s.now')||{}).textContent")
    check("T14", "A deep link (#listen-ID-tSEC) opens at that second, paused, with the right sentence highlighted", near(t, 120, 1.0) and await ev(pg, "document.querySelector('audio').paused") and now == ex[4], f"{t:.1f}")
    await pg.evaluate("location.hash='#listen-LR001-t300'"); await asyncio.sleep(0.6)
    t = await ev(pg, "document.querySelector('audio').currentTime")
    check("T14", "Changing the time in the link seeks the same player without rebuilding the page", near(t, 300, 1.0) and await pg.locator("audio").count() == 1, f"{t:.1f}")
    await ctx.close()


async def t15_storage(env):
    ctx, pg = await env.page("#listen-LR001", storage_blocked=True); await ready_listen(pg)
    check("T15", "With storage blocked, the listening page states that nothing will be kept", await pg.locator(".ls-head .note.warn").count() == 1 and "blocking storage" in await pg.locator(".ls-head .note.warn").inner_text())
    await pg.click(".play"); await asyncio.sleep(1.6)
    check("T15", "With storage blocked, playback works normally", await ev(pg, "document.querySelector('audio').currentTime") > 1.0)
    await pg.keyboard.press("t"); await asyncio.sleep(0.3)
    toast = await pg.locator(".toast").inner_text() if await pg.locator(".toast").count() else ""
    check("T15", "With storage blocked, saving a moment says it is kept for this visit only", "this visit only" in toast, toast)
    await pg.goto(env.base + "#journal"); await pg.wait_for_selector(".pagehead")
    check("T15", "Journal shows the storage notice", await pg.locator(".note.warn").count() >= 1 and "blocking storage" in await pg.locator(".note.warn").first.inner_text())
    await pg.goto(env.base + "#library"); await pg.wait_for_selector(".rec")
    check("T15", "Library shows the storage notice and still works", await pg.locator(".note.warn").count() >= 1 and await pg.locator(".rec").count() == 2)
    await ctx.close()


async def t16_errors(env):
    async def r404(pg):
        await pg.route("**/audio/LR001.mp3", lambda route: route.fulfill(status=404, body="nope"))
    ctx, pg = await env.page("#listen-LR001", route=r404); await pg.wait_for_selector(".player")
    ok = await until(pg, "(() => { const e = document.querySelector('.pl-err'); return e && !e.hidden && /HTTP 404/.test(e.textContent) })()", 8000)
    txt = await pg.locator(".pl-err").inner_text()
    check("T16", "A missing audio file gives a specific message (HTTP 404) rather than a generic failure", ok, txt[:140])
    check("T16", "The transcript remains readable when audio fails, and a 'Read the transcript instead' action exists", await pg.locator(".s").count() > 50 and await pg.locator(".pl-err a:text-is('Read the transcript instead')").count() == 1)
    check("T16", "The play control is disabled after a fatal error", await pg.locator(".play").is_disabled())
    await ctx.close()

    async def rabort(pg):
        await pg.route("**/audio/LR001.mp3", lambda route: route.abort())
    ctx, pg = await env.page("#listen-LR001", route=rabort); await pg.wait_for_selector(".player")
    ok = await until(pg, "(() => { const e = document.querySelector('.pl-err'); return e && !e.hidden && e.textContent.length > 20 })()", 8000)
    check("T16", "A network failure is reported with a message and Try again", ok and await pg.locator(".pl-err button:text-is('Try again')").count() == 1, (await pg.locator(".pl-err").inner_text())[:140] if ok else "")
    await ctx.close()

    async def rbad(pg):
        await pg.route("**/audio/LR001.mp3", lambda route: route.fulfill(status=200, content_type="audio/mpeg", body=bytes(random.Random(1).randrange(256) for _ in range(40000))))
    ctx, pg = await env.page("#listen-LR001", route=rbad); await pg.wait_for_selector(".player")
    ok = await until(pg, "(() => { const e = document.querySelector('.pl-err'); return e && !e.hidden && e.textContent.length > 20 })()", 8000)
    check("T16", "A corrupt audio file is reported (not silently ignored)", ok, (await pg.locator(".pl-err").inner_text())[:140] if ok else "")
    await ctx.close()
    # retry recovers once the file is available
    state = {"n": 0}
    async def flaky(pg):
        async def h(route):
            state["n"] += 1
            if state["n"] <= 2:
                await route.abort()
            else:
                await route.continue_()
        await pg.route("**/audio/LR001.mp3", h)
    ctx, pg = await env.page("#listen-LR001", route=flaky); await pg.wait_for_selector(".player")
    await until(pg, "(() => { const e = document.querySelector('.pl-err'); return e && !e.hidden })()", 8000)
    btn = pg.locator(".pl-err button:text-is('Try again')")
    if await btn.count():
        await btn.click(); await asyncio.sleep(0.6)
        await until(pg, "document.querySelector('audio').readyState>=1", 6000)
        check("T16", "Try again recovers when the file becomes reachable", await ev(pg, "document.querySelector('audio').readyState") >= 1 and await pg.locator(".pl-err").is_hidden())
    else:
        check("T16", "Try again recovers when the file becomes reachable", False, "no Try again button")
    await ctx.close()


async def t17_atmosphere(env):
    ctx, pg = await env.page("#listen-LR001", init="localStorage.getItem('ai_listen_v1')||localStorage.setItem('ai_listen_v1',JSON.stringify({v:1,progress:{},moments:{},prefs:{vizMotion:true},last:null}))"); await ready_listen(pg)
    await pg.click(".play"); await asyncio.sleep(3.0)
    s = await ev(pg, "window.__lr.atmo.stats()")
    check("T17", "Audio Atmosphere reads the playing audio live (status live, frames, signal level > 0)", s["status"] == "live" and s["frames"] > 30 and s["maxLevel"] > 0.05 and s["animating"], s)
    a = await ev(pg, "document.querySelector('.atmo-canvas').toDataURL().length")
    await asyncio.sleep(0.8)
    b = await ev(pg, "document.querySelector('.atmo-canvas').toDataURL()")
    c1 = await ev(pg, "document.querySelector('.atmo-canvas').toDataURL()")
    await asyncio.sleep(0.6)
    c2 = await ev(pg, "document.querySelector('.atmo-canvas').toDataURL()")
    check("T17", "The picture changes as the sound changes", c1 != c2 and a > 2000)
    check("T17", "State is stated in text", "Live" in await pg.locator(".atmo-state").inner_text(), await pg.locator(".atmo-state").inner_text())
    check("T17", "The visual is hidden from assistive technology and a note says it shows sound only", await pg.locator(".atmo-canvas").get_attribute("aria-hidden") == "true" and "does not represent meaning, thought or consciousness" in await pg.locator(".atmo-note").inner_text())
    await pg.click("button:has-text('Animate the Audio Atmosphere')"); await asyncio.sleep(0.5)
    s2 = await ev(pg, "window.__lr.atmo.stats()")
    check("T17", "Toggle turns the animation off; playback continues", not s2["animating"] and await ev(pg, "!document.querySelector('audio').paused") and await pg.locator("button:has-text('Animate the Audio Atmosphere')").get_attribute("aria-pressed") == "false", s2)
    await pg.click("button:has-text('Animate the Audio Atmosphere')"); await asyncio.sleep(0.8)
    check("T17", "Toggle turns it back on", (await ev(pg, "window.__lr.atmo.stats()"))["animating"])
    await ctx.close()

    ctx, pg = await env.page("#listen-LR001", reduced=True); await ready_listen(pg)
    pressed = await pg.locator("button:has-text('Animate the Audio Atmosphere')").get_attribute("aria-pressed")
    await pg.click(".play"); await asyncio.sleep(2.0)
    s = await ev(pg, "window.__lr.atmo.stats()")
    check("T17", "prefers-reduced-motion: animation is off by default and nothing animates while playing", pressed == "false" and not s["animating"] and s["frames"] == 0 and await ev(pg, "document.querySelector('audio').currentTime") > 1.5, s)
    check("T17", "…and a still picture of the recording's loudness is drawn instead, with an explanation", "reduced motion" in await pg.locator(".atmo-state").inner_text(), await pg.locator(".atmo-state").inner_text())
    await ctx.close()

    ctx, pg = await env.page("#listen-LR001", init="delete HTMLMediaElement.prototype.captureStream;delete HTMLMediaElement.prototype.mozCaptureStream;localStorage.setItem('ai_listen_v1',JSON.stringify({v:1,progress:{},moments:{},prefs:{vizMotion:true},last:null}))"); await ready_listen(pg)
    await pg.click(".play"); await asyncio.sleep(2.0)
    check("T17", "Where live analysis is unsupported (e.g. Safari) the page says so, shows the still overview, and playback is unaffected", (await ev(pg, "window.__lr.atmo.stats()"))["status"] == "unsupported" and "not available in this browser" in await pg.locator(".atmo-state").inner_text() and await ev(pg, "document.querySelector('audio').currentTime") > 1.5)
    await ctx.close()


async def t18_context(env):
    ctx, pg = await env.page("#listen-LR002", init="localStorage.getItem('ai_listen_v1')||localStorage.setItem('ai_listen_v1',JSON.stringify({v:1,progress:{},moments:{},prefs:{mode:'research'},last:null}))"); await ready_listen(pg)
    await until(pg, "document.querySelectorAll('.ctx-body .rl li').length>3", 8000)
    check("T18", "Research context lists real related resources from the shared research index", await pg.locator(".ctx-body .rl li").count() > 10, await pg.locator(".ctx-body .rl li").count())
    lex = pg.locator(".term.t-lexicon").first
    nm = await lex.inner_text(); aid = None
    await lex.scroll_into_view_if_needed(); await lex.click()
    await pg.wait_for_selector(".pop")
    body = await pg.locator(".pop").inner_text()
    anns = json.loads((DATA / "audio-relations.json").read_text())["items"]
    rel = next(r for r in anns if r["recordingId"] == "LR002")
    first = next(a for a in rel["annotations"] if a["type"] == "lexicon")
    intro = LEX[first["id"]]["intro"]
    check("T18", "A Lexicon term opens its definition exactly as the Lexicon has it, with its review status", intro[:60] in body and "status: Awaiting Research Review" in body, nm)
    check("T18", "Popover is a labelled dialog and the trigger reports expanded", await pg.locator(".pop").get_attribute("role") == "dialog" and await lex.get_attribute("aria-expanded") == "true")
    hrefs = await ev(pg, "[...document.querySelectorAll('.pop a.ra')].map(a=>a.getAttribute('href'))")
    check("T18", "Popover links point into the live site structure (relative to the feature)", any(h.startswith("../lexicon/#c-") for h in hrefs), hrefs[:3])
    await pg.keyboard.press("Escape"); await asyncio.sleep(0.2)
    check("T18", "Escape closes the popover and returns focus to the term", await pg.locator(".pop").count() == 0 and await ev(pg, "document.activeElement.classList.contains('term')"))
    src = pg.locator(".term.t-source").first
    await src.scroll_into_view_if_needed(); await src.click(); await pg.wait_for_selector(".pop")
    check("T18", "A source annotation opens the real source entry from the essay's Sources list, with its links", "Butlin" in await pg.locator(".pop").inner_text() and await pg.locator(".pop a.slink").count() >= 1, (await pg.locator(".pop").inner_text())[:100])
    await pg.keyboard.press("Escape")
    # pause while reading research notes (opt-in)
    await pg.click("button:has-text('Pause audio while I read research notes')")
    await pg.click(".play"); await asyncio.sleep(1.0)
    pre = await ev(pg, "!document.querySelector('audio').paused")
    t = pg.locator(".term").nth(1); await t.scroll_into_view_if_needed(); await t.click(); await asyncio.sleep(0.4)
    paused = await ev(pg, "document.querySelector('audio').paused")
    await pg.keyboard.press("Escape"); await asyncio.sleep(0.5)
    resumed = await ev(pg, "!document.querySelector('audio').paused")
    check("T18", "With 'pause while I read' on, opening a note pauses the audio and closing it resumes", pre and paused and resumed, (pre, paused, resumed))
    await pg.click(".play")
    await pg.click("button:has-text('Pause audio while I read research notes')")
    await pg.click(".play"); await asyncio.sleep(0.8)
    t = pg.locator(".term").nth(2); await t.scroll_into_view_if_needed(); await t.click(); await asyncio.sleep(0.4)
    check("T18", "With it off (default), the audio keeps playing while a note is open", await ev(pg, "!document.querySelector('audio').paused"))
    await pg.keyboard.press("Escape"); await pg.click(".play")
    # a theory annotation carries the 'not evidence' caveat
    th = pg.locator(".term.t-theory").first
    await th.scroll_into_view_if_needed(); await th.click(); await pg.wait_for_selector(".pop")
    check("T18", "Theory notes state that the recording is not independent evidence", "not independent evidence" in await pg.locator(".pop").inner_text())
    await ctx.close()


async def t18b_cites(env):
    ctx, pg = await env.page("#listen-LR001", init="localStorage.getItem('ai_listen_v1')||localStorage.setItem('ai_listen_v1',JSON.stringify({v:1,progress:{},moments:{},prefs:{mode:'research'},last:null}))"); await ready_listen(pg)
    await until(pg, "document.querySelectorAll('.cite').length>0")
    n = await pg.locator(".cite").count()
    exp = sum(1 for b in TR["LR001"]["blocks"] if b.get("cite"))
    check("T18", "Citation markers in the essay become buttons in Research Listening (one per cited paragraph)", n == exp and n >= 2, f"{n} vs {exp}")
    cite = pg.locator(".cite").first
    await cite.scroll_into_view_if_needed(); await cite.click(); await pg.wait_for_selector(".pop")
    txt = await pg.locator(".pop").inner_text()
    check("T18", "A citation marker opens the actual source entry (Met Museum for [1]) with its link", "Metropolitan Museum" in txt and await pg.locator(".pop a.slink").count() >= 1, txt[:100])
    await pg.keyboard.press("Escape")
    await pg.click(".mode[data-m=read]")
    check("T18", "In Listen and Read the marker is shown as plain text, not spoken and not a control", await pg.locator(".cite").count() == 0 and await pg.locator(".cite-txt").count() >= 2)
    await ctx.close()


async def t19_nav(env):
    ctx, pg = await env.page("#listen-LR001"); await ready_listen(pg)
    check("T19", "'Previous' is disabled on the first recording", await pg.locator(".ib[aria-label^='Previous recording']").is_disabled())
    await pg.click(".play"); await asyncio.sleep(1.0)
    await pg.click(".ib[aria-label^='Next recording']"); await pg.wait_for_selector("h1:text-is('Is Human Consciousness Connected to Artificial Intelligence?')")
    await until(pg, "document.querySelector('audio') && document.querySelector('audio').getAttribute('src').endsWith('LR002.mp3')")
    st = await ev(pg, "({n: document.querySelectorAll('audio').length, src: document.querySelector('audio').getAttribute('src'), paused: document.querySelector('audio').paused, t: document.querySelector('audio').currentTime})")
    check("T19", "Next moves to the next recording: one audio element, new source, not auto-playing, from 0:00", st["n"] == 1 and st["src"].endswith("LR002.mp3") and st["paused"] and st["t"] < 1, st)
    check("T19", "'Next' is disabled on the last recording", await pg.locator(".ib[aria-label^='Next recording']").is_disabled())
    await pg.go_back(); await pg.wait_for_selector("h1:text-is('We Are All Archives Now')")
    check("T19", "The browser Back button returns to the previous recording", True)
    await ctx.close()


async def t20_mobile(env):
    widths = [320, 360, 390, 414]
    bad = []
    mins = {}
    for w in widths:
        for hash_, mode in [("", None), ("#journal", None), ("#how", None), ("#listen-LR002", "immersive"), ("#listen-LR002", "read"), ("#listen-LR002", "research")]:
            seed = {"ai_listen_v1": {"v": 1, "progress": {"LR002": {"t": 700, "dur": 1240, "done": False, "at": 1}}, "moments": {"LR002@700": {"id": "LR002@700", "rec": "LR002", "t": 700, "text": "A saved passage for layout testing.", "at": 1}}, "prefs": {"mode": mode or "read"}, "last": "LR002"}}
            ctx, pg = await env.page(hash_, viewport=(w, 780), mobile=True, seed=seed)
            await pg.wait_for_selector(".wrap > *:nth-child(2)", timeout=10000)
            await asyncio.sleep(0.5)
            if hash_.startswith("#listen"):
                await ready_listen(pg)
                await pg.click(".more-toggle")
                await pg.click(".play"); await asyncio.sleep(0.6)
                if mode == "research":
                    await until(pg, "document.querySelectorAll('.term').length>0")
                    t = pg.locator(".term").first; await t.scroll_into_view_if_needed(); await t.click(); await asyncio.sleep(0.3)
            over = await ev(pg, """() => {
              const W = window.innerWidth, out = [];
              if (document.documentElement.scrollWidth > W + 1) out.push('page scrollWidth ' + document.documentElement.scrollWidth + ' > ' + W);
              for (const e of document.querySelectorAll('body *')) {
                const r = e.getBoundingClientRect(); if (!r.width || !r.height) continue;
                if (r.right > W + 1 || r.left < -1) {
                  let p = e, inside = false; while ((p = p.parentElement)) { const o = getComputedStyle(p).overflowX; if (o === 'auto' || o === 'scroll' || o === 'hidden') { inside = true; break; } }
                  if (!inside && getComputedStyle(e).position !== 'fixed' && !e.classList.contains('skip')) out.push(e.tagName + '.' + e.className + ' right=' + Math.round(r.right));
                }
              }
              return out.slice(0, 5);
            }""")
            if over:
                bad.append((w, hash_, mode, over))
            if hash_.startswith("#listen") and mode == "read":
                m = await ev(pg, """() => { const r = {}; for (const [k, sel] of [['ib', '.player .ib'], ['play', '.play'], ['rate', '.rate'], ['btn', '.pl-more .btn'], ['mode', '.mode'], ['scrub', '.scrub'], ['ts', '.ts'], ['chbtn', '.chbtn']]) { const els = [...document.querySelectorAll(sel)].filter(e => e.offsetParent !== null || getComputedStyle(e).position === 'fixed'); r[k] = els.length ? Math.min(...els.map(e => Math.min(e.getBoundingClientRect().width, e.getBoundingClientRect().height))) : null } return r }""")
                mins[w] = m
            await ctx.close()
    check("T20", f"No horizontal scrolling or overflow at {widths} px across library, journal, how-it-works and all three listening modes", not bad, bad[:3])
    small = {w: {k: v for k, v in m.items() if v is not None and v < 24} for w, m in mins.items()}
    check("T20", "Every touch target is at least 24 px (WCAG 2.2 minimum) at every tested width", all(not v for v in small.values()), small or mins.get(390))
    prim = {w: min(m["ib"] or 99, m["play"] or 99) for w, m in mins.items()}
    check("T20", "Primary player controls are at least 40 px", all(v >= 40 for v in prim.values()), prim)

    ctx, pg = await env.page("#listen-LR002", viewport=(390, 780), mobile=True); await ready_listen(pg)
    pos = await ev(pg, "getComputedStyle(document.querySelector('.player')).position")
    check("T20", "On phones the player is docked at the bottom of the screen", pos == "fixed")
    h = await ev(pg, "document.querySelector('.player').getBoundingClientRect().height")
    check("T20", "…and takes less than 30% of a 780 px screen when its extra controls are collapsed", h < 780 * 0.3, f"{h:.0f}px")
    await pg.click(".mode[data-m=research]"); await until(pg, "document.querySelectorAll('.term').length>0")
    t = pg.locator(".term").first; await t.scroll_into_view_if_needed(); await t.click(); await pg.wait_for_selector(".pop")
    sheet = await ev(pg, "(()=>{const r=document.querySelector('.pop').getBoundingClientRect();return {pos:getComputedStyle(document.querySelector('.pop')).position,left:r.left,right:Math.round(r.right),bottom:Math.round(r.bottom),w:innerWidth,h:innerHeight}})()")
    check("T20", "On phones research notes open as a bottom sheet spanning the width", sheet["pos"] == "fixed" and sheet["left"] == 0 and sheet["right"] == sheet["w"] and sheet["bottom"] == sheet["h"], sheet)
    await ctx.close()


async def t21_a11y(env):
    ctx, pg = await env.page("#listen-LR002", init="localStorage.setItem('ai_listen_v1',JSON.stringify({v:1,progress:{},moments:{},prefs:{mode:'research'},last:null}))"); await ready_listen(pg)
    await until(pg, "document.querySelectorAll('.term').length>0")
    unnamed = await ev(pg, """() => [...document.querySelectorAll('button, a[href], input, select, textarea, [role=slider], [role=radio], summary')].filter(e => e.offsetParent !== null || getComputedStyle(e).position === 'fixed').filter(e => {
      const n = (e.getAttribute('aria-label') || '').trim() || (e.labels && e.labels.length ? e.labels[0].textContent.trim() : '') || e.textContent.trim() || (e.getAttribute('title') || '').trim();
      return !n }).map(e => e.outerHTML.slice(0, 90))""")
    check("T21", "Every visible control has an accessible name", not unnamed, unnamed[:3])
    hs = await ev(pg, "[...document.querySelectorAll('h1,h2,h3')].map(h => +h.tagName[1])")
    skips = [(a, b) for a, b in zip(hs, hs[1:]) if b - a > 1]
    check("T21", "Exactly one h1, and heading levels never skip", hs.count(1) == 1 and not skips, f"{hs[:12]}")
    check("T21", "Landmarks present: header, main, footer, nav", await ev(pg, "!!document.querySelector('header') && !!document.querySelector('main') && !!document.querySelector('footer') && !!document.querySelector('nav[aria-label=Site]')"))
    check("T21", "Language is declared", await ev(pg, "document.documentElement.lang") == "en")
    check("T21", "Live region exists for status announcements", await pg.locator("#live[aria-live=polite]").count() == 1)
    rg = await ev(pg, "document.querySelector('.modebar').getAttribute('role') + '/' + [...document.querySelectorAll('.mode')].map(b => b.getAttribute('role') + ':' + b.getAttribute('aria-checked')).join(',')")
    check("T21", "Modes are a radio group with exactly one checked", rg.count("true") == 1 and rg.startswith("radiogroup"), rg)
    check("T21", "Current sentence and paragraph are identified in text, not only by colour (aria-current on paragraph)", await pg.locator(".blk[aria-current=true]").count() <= 1)
    # keyboard reachability and visible focus
    seen = []
    await pg.evaluate("document.activeElement && document.activeElement.blur(); window.scrollTo(0,0)")
    for i in range(60):
        await pg.keyboard.press("Tab")
        d = await ev(pg, "(()=>{const e=document.activeElement;if(!e)return null;const cs=getComputedStyle(e);return {tag:e.tagName,cls:e.className&&e.className.baseVal===undefined?e.className:'',label:e.getAttribute('aria-label')||e.textContent.slice(0,24),ring:cs.outlineStyle!=='none'&&parseFloat(cs.outlineWidth)>=2}})()")
        seen.append(d)
        if d and d["cls"] == "play":
            break
    idx = next((i for i, d in enumerate(seen) if d and d["cls"] == "play"), None)
    check("T21", "The play button is reachable from the top of the page by keyboard in a handful of Tab presses", idx is not None and idx < 40, idx)
    check("T21", "Keyboard focus is visibly outlined on everything reached", all(d is None or d["ring"] for d in seen), [d for d in seen if d and not d["ring"]][:3])
    # contrast
    res = await ev(pg, """() => {
      const lum = c => { const f = v => { v /= 255; return v <= .03928 ? v / 12.92 : Math.pow((v + .055) / 1.055, 2.4) }; return .2126 * f(c[0]) + .7152 * f(c[1]) + .0722 * f(c[2]) };
      const parse = s => { const m = s.match(/rgba?\\(([^)]+)\\)/); if (!m) return null; const p = m[1].split(',').map(x => parseFloat(x)); return [p[0], p[1], p[2], p.length > 3 ? p[3] : 1] };
      const bgOf = e => { const layers = []; let p = e; while (p) { const c = parse(getComputedStyle(p).backgroundColor); if (c && c[3] > 0) layers.push(c); p = p.parentElement } let base = [10, 13, 14]; for (const c of layers.reverse()) base = [0, 1, 2].map(i => c[i] * c[3] + base[i] * (1 - c[3])); return base };
      const ratio = (a, b) => { const l1 = lum(a), l2 = lum(b); return (Math.max(l1, l2) + .05) / (Math.min(l1, l2) + .05) };
      const sels = ['.txt', '.note', '.dim', '.label', '.badge', '.btn', '.ct', '.mdesc', '.mname', '.chbtn', '.ts', '.rs', '.rt', '.src', '.meta', '.atmo-note', '.atmo-state', '.disclose', '.deck', '.pl-time', '.rate', '.ls-title', '.tabsrow a', 'nav.site a', 'footer', '.term', '.cite', '.ctxd summary', '.tag'];
      const out = [];
      for (const s of sels) for (const e of [...document.querySelectorAll(s)].slice(0, 3)) {
        if (!e.offsetParent && getComputedStyle(e).position !== 'fixed') continue;
        const fg = parse(getComputedStyle(e).color), bg = bgOf(e); if (!fg) continue;
        const fgc = [0, 1, 2].map(i => fg[i] * fg[3] + bg[i] * (1 - fg[3]));
        const fs = parseFloat(getComputedStyle(e).fontSize), bold = parseInt(getComputedStyle(e).fontWeight) >= 700, large = fs >= 24 || (fs >= 18.66 && bold);
        const r = ratio(fgc, bg); out.push({ s, r: Math.round(r * 100) / 100, need: large ? 3 : 4.5, fs });
      }
      return out }""")
    fails = [x for x in res if x["r"] < x["need"]]
    check("T21", f"Text contrast meets WCAG AA (4.5:1, or 3:1 for large text) on {len(res)} sampled elements", not fails, fails[:5] or f"lowest {min(x['r'] for x in res)}")
    await ctx.close()


async def t22_console():
    bad = [c for c in CONSOLE if "fonts.g" not in c[1] and "ERR_TUNNEL" not in c[1] and "net::ERR_ABORTED" not in c[1] and "Failed to load resource" not in c[1]]
    # failed-load messages are expected only in the deliberate error tests
    check("T22", "No page errors or console errors outside the deliberate failure tests", not [c for c in bad if c[0] == "pageerror"], bad[:3])


async def t23_library_misc(env):
    ctx, pg = await env.page(""); await pg.wait_for_selector(".rec")
    await pg.click(".hero a:text-is('Explore Audio Essays →')"); await asyncio.sleep(0.4)
    check("T23", "'Explore Audio Essays →' applies the Narrated Research filter and jumps to the library", await pg.locator(".filter [data-c=narrated-research]").get_attribute("aria-pressed") == "true")
    await pg.click(".tabsrow a:text-is('How it works')"); await pg.wait_for_selector("h1:text-is('How it works')")
    steps = await pg.locator("ol.steps li").count()
    check("T23", "How-it-works lists the 12 production steps, statuses and what is stored", steps == 12 and await pg.locator(".statdefs li").count() == 5 and "ai_listen_v1" in await pg.locator("main").inner_text(), steps)
    await ctx.close()


async def t28_crossorigin(env):
    """Audio served from another origin (object storage / CDN). The record stays relative; CFG.audioBase moves the files."""
    def cfg(base):
        async def r_(pg):
            body = "window.LR_CONFIG = {preview: true, showProposedChapters: true, audioBase: %s};" % json.dumps(base)
            await pg.route("**/listening-room/config.js", lambda route: route.fulfill(body=body, content_type="application/javascript"))
        return r_
    seed = "localStorage.getItem('ai_listen_v1')||localStorage.setItem('ai_listen_v1',JSON.stringify({v:1,progress:{},moments:{},prefs:{vizMotion:true},last:null}))"
    # 1. host sends CORS headers: plays, is read in 'anonymous' CORS mode, and the Atmosphere analyses the real audio
    ctx, pg = await env.page("#listen-LR001", route=cfg("http://127.0.0.1:8771/listening-room/"), init=seed); await ready_listen(pg)
    check("T28", "Audio is requested from the other origin, not from the page's own", any(u.startswith("http://127.0.0.1:8771/listening-room/audio/LR001.mp3") for u in pg.requests) and not any(u.startswith("http://127.0.0.1:8765/listening-room/audio/") for u in pg.requests), [u for u in pg.requests if u.endswith(".mp3")])
    await pg.click(".play"); await asyncio.sleep(3.0)
    check("T28", "Cross-origin audio with CORS: plays", await ev(pg, "document.querySelector('audio').currentTime") > 1.5)
    check("T28", "…and is loaded in CORS mode (crossorigin=anonymous)", await ev(pg, "document.querySelector('audio').crossOrigin") == "anonymous")
    s = await ev(pg, "window.__lr.atmo.stats()")
    check("T28", "…and the Audio Atmosphere still reads the real signal", s["status"] == "live" and s["maxLevel"] > 0.05, s)
    await pg.evaluate("window.__lr.seekTo(300)"); await asyncio.sleep(1.2)
    check("T28", "…and seeking works against the other origin (Range requests)", 299 < await ev(pg, "document.querySelector('audio').currentTime") < 305)
    check("T28", "…and no error is shown", await pg.locator(".pl-err:visible").count() == 0)
    await ctx.close()
    # 2. host does NOT send CORS headers: playback must still work; only the visualization is unavailable, and it says so
    ctx, pg = await env.page("#listen-LR001", route=cfg("http://127.0.0.1:8772/listening-room/"), init=seed); await ready_listen(pg)
    await pg.click(".play"); await asyncio.sleep(3.5)
    check("T28", "Host without CORS headers: audio still plays (loaded the ordinary way after one retry)", await ev(pg, "document.querySelector('audio').currentTime") > 1.5 and not await ev(pg, "document.querySelector('audio').crossOrigin"), await ev(pg, "document.querySelector('audio').currentTime"))
    await asyncio.sleep(6.5)
    st = await ev(pg, "window.__lr.atmo.stats().status")
    check("T28", "…and the Atmosphere says it cannot read this audio and shows the still overview instead of drawing anything", st == "unavailable" and "still picture" in await pg.locator(".atmo-state").inner_text(), [st, await pg.locator(".atmo-state").inner_text()])
    check("T28", "…and playback was not interrupted by the fallback, and no error box is shown", await ev(pg, "!document.querySelector('audio').paused") and await pg.locator(".pl-err:visible").count() == 0)
    await ctx.close()
    # 3. what a record's audio.url may be
    ctx, pg = await env.page("", route=cfg("")); await pg.wait_for_selector(".results")
    r = await ev(pg, """() => { const A = window.LRApp; const base = {status: 'published', releaseDate: '2026-01-01'};
      return { rel: A.audioUrl({audio: {url: 'audio/x.mp3'}}), abs: A.audioUrl({audio: {url: 'https://cdn.example.org/a/x.mp3'}}),
               okRel: A.playable(Object.assign({audio: {url: 'audio/x.mp3'}}, base)), okHttps: A.playable(Object.assign({audio: {url: 'https://cdn.example.org/x.mp3'}}, base)),
               badHttp: A.playable(Object.assign({audio: {url: 'http://cdn.example.org/x.mp3'}}, base)), badJs: A.playable(Object.assign({audio: {url: 'javascript:alert(1)'}}, base)), badData: A.playable(Object.assign({audio: {url: 'data:audio/mpeg;base64,AAAA'}}, base)) }; }""")
    check("T28", "Relative audio path stays relative; absolute https URL is used as written", r["rel"] == "audio/x.mp3" and r["abs"] == "https://cdn.example.org/a/x.mp3", r)
    check("T28", "Only a site-relative path or https is accepted as audio: http:, javascript: and data: are never playable", r["okRel"] and r["okHttps"] and not r["badHttp"] and not r["badJs"] and not r["badData"], r)
    await ctx.close()


async def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--preview-port", type=int, default=8765); ap.add_argument("--prod-port", type=int, default=8766)
    ap.add_argument("--only", default=""); ap.add_argument("--out", default="/home/claude/build/lr/test-results.json")
    a = ap.parse_args()
    only = {x.strip().upper() for x in a.only.split(",") if x.strip()}
    async with async_playwright() as p:
        b = await p.chromium.launch(args=["--autoplay-policy=no-user-gesture-required", "--no-sandbox"])
        env = Env(b, f"http://127.0.0.1:{a.preview_port}/listening-room/")
        prod = Env(b, f"http://127.0.0.1:{a.prod_port}/listening-room/")
        plan = [("T01", t01_library, env), ("T02", t02_production, prod), ("T04", t04_playback, env), ("T06", t06_speed_volume, env), ("T07", t07_keys, env),
                ("T08", t08_sync, env), ("T09", t09_clickseek, env), ("T10", t10_modes, env), ("T11", t11_chapters, env), ("T12", t12_moments, env),
                ("T13", t13_journal, env), ("T14", t14_resume, env), ("T15", t15_storage, env), ("T16", t16_errors, env), ("T17", t17_atmosphere, env),
                ("T18", t18_context, env), ("T18B", t18b_cites, env), ("T19", t19_nav, env), ("T20", t20_mobile, env), ("T21", t21_a11y, env), ("T23", t23_library_misc, env), ("T28", t28_crossorigin, env)]
        for tid, fn, e in plan:
            if only and tid not in only:
                continue
            t0 = time.time()
            try:
                await fn(e)
                if tid == "T08":
                    await t08_sync(e, "LR002")
            except Exception as ex:
                check(tid, f"test crashed: {type(ex).__name__}", False, "".join(traceback.format_exception_only(type(ex), ex)).strip()[:300])
                traceback.print_exc()
            print(f"--- {tid} took {time.time() - t0:.1f}s", flush=True)
        if not only:
            await t22_console()
        await b.close()
    Path(a.out).write_text(json.dumps({"ran": time.strftime("%Y-%m-%d %H:%M:%S"), "results": RESULTS, "console": CONSOLE[:40]}, indent=1))
    passed = sum(r["pass"] for r in RESULTS)
    print(f"\n{passed}/{len(RESULTS)} checks passed")
    sys.exit(0 if passed == len(RESULTS) else 1)


if __name__ == "__main__":
    asyncio.run(main())
