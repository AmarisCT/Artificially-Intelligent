#!/usr/bin/env python3
"""Build a single-file private preview of the Case Grid (for an Artifact or any static host).

The page is the real theory-grid/ app with its data inlined (window.__TG_DATA__), so it makes no requests,
and with links to other site pages pointed at the live site. An optional banner shows where the
Explore menu entry appears, using screenshots of the real homepage on this branch.

Usage: build_theory_grid_preview.py --out FILE [--shot-desktop PNG] [--shot-phone PNG]"""
import argparse, base64, json, os, re

ROOT = os.path.abspath(os.path.join(os.path.dirname(os.path.abspath(__file__)), ".."))
LIVE = "https://amarisct.github.io/Artificially-Intelligent/"

ap = argparse.ArgumentParser()
ap.add_argument("--out", required=True)
ap.add_argument("--shot-desktop")
ap.add_argument("--shot-phone")
a = ap.parse_args()


def read(rel):
    with open(os.path.join(ROOT, rel), encoding="utf-8") as fh:
        return fh.read()


def data_uri(path):
    with open(path, "rb") as fh:
        return "data:image/png;base64," + base64.b64encode(fh.read()).decode()


theories = json.loads(read("theory-chamber/data/theories.json"))["items"]
sources = json.loads(read("theory-chamber/data/sources.json"))["items"]
grid = json.loads(read("theory-grid/data/cases.json"))
payload = json.dumps({"theories": theories, "sources": sources, "grid": grid}, ensure_ascii=False).replace("</", "<\\/")

html = read("theory-grid/index.html")
body = re.search(r"<body>(.*)</body>", html, re.S).group(1)
body = body.replace('<script src="app.js"></script>', "")
body = body.replace('href="../', 'href="' + LIVE)
# the grid's own nav anchor must stay an in-page link
css = read("theory-grid/styles.css")
js = read("theory-grid/app.js")

banner = ""
if a.shot_desktop or a.shot_phone:
    figs = ""
    if a.shot_desktop:
        figs += ('<figure><img src="%s" alt="The Explore menu on a desktop screen. Case Grid, with the line One case, six theories of consciousness, '
                 'is the fourth item, between Theory Chamber and Museum of Human Memory.">'
                 '<figcaption>Desktop: the Explore menu</figcaption></figure>' % data_uri(a.shot_desktop))
    if a.shot_phone:
        figs += ('<figure><img src="%s" alt="The same menu on a phone, with Case Grid as the fourth entry under Explore.">'
                 '<figcaption>Phone: the Menu button, Explore group</figcaption></figure>' % data_uri(a.shot_phone))
    banner = ('<aside class="pv wrap" aria-label="About this preview"><p class="kicker">Private preview · not live</p>'
              '<h2>Where it appears</h2>'
              '<p class="note">Case Grid becomes the fourth entry in the homepage Explore menu, directly under Theory Chamber. '
              'Nothing is published until you approve it. In this preview, links to other pages open the live site, and the Case Grid itself exists only here. '
              'The screenshots come from the real homepage on the preview branch and use substitute fonts.</p>'
              '<div class="shots">' + figs + '</div></aside>')

overrides = """
.hdr{top:env(safe-area-inset-top,0px)}
body::before{content:"";position:fixed;inset:0 0 auto;height:env(safe-area-inset-top,0px);z-index:50;background:var(--bg)}
.pv{border:1px dashed var(--warn);border-radius:4px;padding:clamp(14px,2vw,24px);margin-block:20px 0;display:flex;flex-direction:column;gap:12px}
.pv h2{font-size:1.3rem}
.shots{display:grid;grid-template-columns:minmax(0,5fr) minmax(0,2fr);gap:16px;align-items:start}
.shots figure{margin:0;display:flex;flex-direction:column;gap:6px;min-width:0}
.shots img{width:100%;height:auto;border:1px solid var(--line);border-radius:3px;display:block}
.shots figcaption{font-size:.8rem;color:var(--muted)}
@media(max-width:760px){.shots{grid-template-columns:minmax(0,1fr)}.shots figure:nth-child(2){max-width:300px}}
"""
body = re.sub(r"(</header>)", r"\1" + banner.replace("\\", "\\\\"), body, count=1)

out = (
    "<title>Case Grid</title>\n"
    '<meta name="claude:viewport-fit-sides" content="cover">\n'
    '<link rel="preconnect" href="https://fonts.googleapis.com">\n'
    '<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>\n'
    '<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Hanken+Grotesk:wght@400;500;600&family=Newsreader:ital,opsz,wght@0,6..72,300;0,6..72,400;0,6..72,500;1,6..72,300;1,6..72,400&display=swap">\n'
    "<style>\n" + css + overrides + "</style>\n" + body +
    "\n<script>window.__TG_ROOT__=" + json.dumps(LIVE) + ";window.__TG_DATA__=" + payload + ";</script>\n<script>\n" + js + "\n</script>\n"
)
with open(a.out, "w", encoding="utf-8") as fh:
    fh.write(out)
print("wrote", a.out, len(out), "bytes")
