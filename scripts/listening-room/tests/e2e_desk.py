#!/usr/bin/env python3
"""Reading Desk, Atlas dossier and Learning Institute integration on the MAIN site pages: listen:/moment: items render, unknown
items survive, removal clears both records; Listen rows appear only for released recordings. Serve the repo root first:  python3 scripts/listening-room/tests/range_server.py . 8767"""
import asyncio, json, sys
from playwright.async_api import async_playwright
BASE = "http://127.0.0.1:8767/"
R = []
def check(desc, ok, detail=""):
    R.append(bool(ok)); print(("PASS " if ok else "FAIL ") + f"[T25] {desc}" + (f"  -- {detail}" if detail != "" else ""), flush=True)

DESK = {"items": [{"k": "art:we-are-all-archives-now", "note": "essay note", "coll": "Reading", "t": 1},
                  {"k": "moment:LR001@185", "note": "my moment note", "coll": "Memory listening", "t": 2},
                  {"k": "listen:LR002", "note": "", "coll": "", "t": 3},
                  {"k": "future:thing", "note": "from a later version", "coll": "", "t": 4, "extra": {"a": 1}}], "last": None}
LISTEN = {"v": 1, "progress": {}, "moments": {"LR001@185": {"id": "LR001@185", "rec": "LR001", "t": 185, "text": "A saved passage about archives.", "at": 5}}, "prefs": {}, "last": None}

async def main():
    async with async_playwright() as p:
        b = await p.chromium.launch(args=["--no-sandbox"])
        for published in (False, True):
            ctx = await b.new_context(viewport={"width": 1200, "height": 900})
            await ctx.add_init_script(f"if(!localStorage.getItem('ai_desk_v1')){{localStorage.setItem('ai_desk_v1',{json.dumps(json.dumps(DESK))});localStorage.setItem('ai_listen_v1',{json.dumps(json.dumps(LISTEN))})}}")
            pg = await ctx.new_page(); errs = []
            pg.on("pageerror", lambda e: errs.append(str(e)))
            if published:
                async def lib(route):
                    r = await route.fetch(); j = await r.json()
                    for i in j["items"]: i["status"] = "published"; i["releaseDate"] = "2026-10-20"
                    await route.fulfill(json=j)
                async def q(route):
                    r = await route.fetch(); j = await r.json()
                    for i in j["items"]:
                        if i.get("recordingId"): i["status"] = "published"
                    await route.fulfill(json=j)
                await pg.route("**/listening-room/data/audio-library.json", lib); await pg.route("**/listening-room/data/audio-queue.json", q)
            await pg.goto(BASE + "#desk")
            await pg.wait_for_selector(".dk-item")
            await pg.wait_for_function("document.querySelectorAll('.dk-item').length>=3", timeout=8000)
            tag = "published" if published else "awaiting review"
            items = await pg.evaluate("[...document.querySelectorAll('.dk-item')].map(e=>({k:e.dataset.k, sub:e.querySelector('.note').textContent, h:e.querySelector('h3').textContent, body:(e.querySelector('p.note')||{}).textContent||'', links:[...e.querySelectorAll('a.chip')].map(a=>a.getAttribute('href')), txt:e.innerText}))")
            ks = [i["k"] for i in items]
            check(f"[{tag}] Reading Desk shows the essay, the saved moment and the bookmark together", ks == ["art:we-are-all-archives-now", "moment:LR001@185", "listen:LR002"], ks)
            m = next(i for i in items if i["k"].startswith("moment:"))
            check(f"[{tag}] The moment shows recording title, timestamp and the saved passage", m["h"] == "We Are All Archives Now" and "saved moment at 3:05" in m["sub"] and "A saved passage about archives." in m["body"], m["sub"])
            if published:
                check(f"[{tag}] A published recording's moment links straight to that second", "listening-room/#listen-LR001-t185" in m["links"], m["links"])
                lk = next(i for i in items if i["k"] == "listen:LR002")
                check(f"[{tag}] A bookmarked published recording links to it", "listening-room/#listen-LR002" in lk["links"], lk["links"])
            else:
                check(f"[{tag}] An unapproved recording is NOT linked as playable from the Reading Desk", not any("listening-room" in l for l in m["links"]) and "Not currently available to play" in m["txt"], m["links"])
            d = json.loads(await pg.evaluate("localStorage.getItem('ai_desk_v1')"))
            check(f"[{tag}] Items this page does not know (future:thing) are kept, untouched, in storage", any(i["k"] == "future:thing" and i.get("extra") == {"a": 1} for i in d["items"]))
            if published:
                await pg.fill(".dk-item[data-k='moment:LR001@185'] .dk-note", "edited on the desk"); await asyncio.sleep(0.2)
                d = json.loads(await pg.evaluate("localStorage.getItem('ai_desk_v1')"))
                check("Editing a moment's note on the main Reading Desk updates the same item the Listening Room journal reads", next(i for i in d["items"] if i["k"] == "moment:LR001@185")["note"] == "edited on the desk")
                await pg.click(".dk-item[data-k='moment:LR001@185'] button[data-save]"); await asyncio.sleep(0.3)
                d = json.loads(await pg.evaluate("localStorage.getItem('ai_desk_v1')")); l = json.loads(await pg.evaluate("localStorage.getItem('ai_listen_v1')"))
                check("Removing a moment on the Reading Desk also removes the Listening Room's saved excerpt (no orphan)", not any(i["k"] == "moment:LR001@185" for i in d["items"]) and "LR001@185" not in l["moments"])
                check("…and other items remain", {i["k"] for i in d["items"]} >= {"art:we-are-all-archives-now", "listen:LR002", "future:thing"})
            check(f"[{tag}] No script errors on the main site", not errs, errs[:2])
            await ctx.close()
        # ---- Atlas dossier and Learning Institute lesson: a Listen row only for released recordings
        async def promote_all(pg):
            async def lib(route):
                r = await route.fetch(); j = await r.json()
                for i in j["items"]: i["status"] = "published"; i["releaseDate"] = "2026-10-20"
                await route.fulfill(json=j)
            async def q(route):
                r = await route.fetch(); j = await r.json()
                for i in j["items"]:
                    if i.get("recordingId"): i["status"] = "published"
                await route.fulfill(json=j)
            await pg.route("**/listening-room/data/audio-library.json", lib); await pg.route("**/listening-room/data/audio-queue.json", q)
        for published in (False, True):
            tag = "published" if published else "awaiting review"
            ctx = await b.new_context(viewport={"width": 1200, "height": 900}); pg = await ctx.new_page(); errs = []
            pg.on("pageerror", lambda e: errs.append(str(e)))
            if published: await promote_all(pg)
            await pg.goto(BASE + "#dossier-identity"); await pg.wait_for_selector(".dos"); await asyncio.sleep(0.8)
            links = await pg.evaluate("[...document.querySelectorAll('#dos-listen a')].map(a=>[a.getAttribute('href'),a.innerText])")
            if published:
                check(f"[{tag}] Atlas 'Identity' dossier lists both recordings that carry the concept, linking into the Listening Room", sorted(l[0] for l in links) == ["listening-room/#listen-LR001", "listening-room/#listen-LR002"], links)
            else:
                check(f"[{tag}] Atlas dossier shows no Listen row for unapproved recordings (no empty placeholder either)", links == [] and await pg.locator("#dos-listen").inner_text() == "")
            await pg.goto(BASE + "#dossier-consciousness"); await pg.wait_for_selector(".dos"); await asyncio.sleep(0.6)
            links = await pg.evaluate("[...document.querySelectorAll('#dos-listen a')].map(a=>a.getAttribute('href'))")
            check(f"[{tag}] A dossier shows only recordings whose concepts include it ('Consciousness' → LR002 only)" if published else f"[{tag}] 'Consciousness' dossier has no Listen row", links == (["listening-room/#listen-LR002"] if published else []), links)
            await pg.goto(BASE + "learning-institute/#lesson-C002-L05"); await pg.wait_for_selector(".openq", timeout=10000); await asyncio.sleep(0.8)
            ll = await pg.evaluate("[...document.querySelectorAll('.listen-slot a')].map(a=>a.getAttribute('href'))")
            if published:
                check(f"[{tag}] Learning Institute lesson C002-L05 offers the recordings that list it as related", sorted(ll) == ["../listening-room/#listen-LR001", "../listening-room/#listen-LR002"], ll)
                txt = await pg.locator(".listen-slot").inner_text()
                check(f"[{tag}] …and says lesson progress and listening progress are separate", "kept separately" in txt)
            else:
                check(f"[{tag}] Learning Institute lesson shows nothing for unapproved recordings", ll == [] and await pg.locator(".listen-slot").inner_text() == "", ll)
            await pg.goto(BASE + "learning-institute/#lesson-C001-L02"); await pg.wait_for_selector(".openq", timeout=10000); await asyncio.sleep(0.6)
            ll = await pg.evaluate("[...document.querySelectorAll('.listen-slot a')].length")
            check(f"[{tag}] A lesson that no recording lists shows no Listen row", ll == 0)
            check(f"[{tag}] No script errors on Atlas / Learning Institute pages", not errs, errs[:2])
            await ctx.close()
        await b.close()
    print(f"\n{sum(R)}/{len(R)} desk checks passed"); sys.exit(0 if all(R) else 1)
asyncio.run(main())
