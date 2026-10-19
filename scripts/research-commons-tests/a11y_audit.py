#!/usr/bin/env python3
"""Accessibility audit of the Research Commons interface. Run: python3 scripts/research-commons-tests/a11y_audit.py

A purpose-built audit (no network needed). For every view, at desktop and phone width, in the private preview with the fictional demonstration records switched on
(and again with them off, for the empty states), it checks: one h1; no skipped heading levels; no duplicate ids; every link and button has an accessible name;
every control is labelled; radio buttons sit in a labelled fieldset; aria-describedby and aria-labelledby point at real elements; every table has a caption and
column scopes; focusable scroll regions are labelled; aria-pressed values; no javascript: or http: links; no positive tabindex; target size of controls; no sideways
scrolling; a live region exists; and WCAG text contrast (4.5:1, or 3:1 for large text) for every piece of visible text against its real background.
It complements, and does not replace, a screen-reader pass by a person. Exit status 1 if anything is found.
"""
import json
import pathlib
import sys
import tempfile

HERE = pathlib.Path(__file__).resolve().parent
sys.path.insert(0, str(HERE.parent))
import build_commons_preview as P  # noqa: E402
from playwright.sync_api import sync_playwright  # noqa: E402

DEMO_ROUTES = ["home", "contribute", "contribute-question", "contribute-publication", "contribute-topic", "contribute-perspective", "library", "library-perspective",
               "c-DEMO-0001", "c-DEMO-0002", "c-DEMO-0003", "c-DEMO-0004", "c-DEMO-0005", "c-DEMO-0006", "c-DEMO-0007", "c-DEMO-9999", "correspondence", "open-inquiries",
               "constellation", "collections", "collection-the-digital-self", "guidelines", "about"]
EMPTY_ROUTES = ["home", "library", "correspondence", "open-inquiries", "constellation", "collections", "collection-the-digital-self", "c-COM-0001"]

JS = r"""
() => {
  const out = [];
  const main = document.querySelector('main');
  const hs = [...main.querySelectorAll('h1,h2,h3,h4')];
  if (main.querySelectorAll('h1').length !== 1) out.push('h1 count ' + main.querySelectorAll('h1').length);
  let prev = 1; hs.forEach(h => { const l = +h.tagName[1]; if (l > prev + 1) out.push('heading jump to ' + h.tagName + ': ' + h.textContent.slice(0,40)); prev = l; });
  const ids = {}; document.querySelectorAll('[id]').forEach(e => { ids[e.id] = (ids[e.id] || 0) + 1; }); Object.entries(ids).filter(([k,v]) => v > 1).forEach(([k]) => out.push('duplicate id ' + k));
  const name = e => (e.getAttribute('aria-label') || e.getAttribute('aria-labelledby') && document.getElementById(e.getAttribute('aria-labelledby'))?.textContent || e.textContent || e.title || '').trim();
  document.querySelectorAll('a,button').forEach(e => { if (!name(e)) out.push('no accessible name: ' + e.outerHTML.slice(0, 80)); });
  document.querySelectorAll('a').forEach(e => { if (!e.getAttribute('href')) out.push('anchor without href: ' + e.textContent.slice(0,40)); if (e.target === '_blank' && !/noopener/.test(e.rel)) out.push('target blank without noopener'); });
  document.querySelectorAll('input:not([aria-hidden="true"]),select,textarea').forEach(e => { const ok = e.getAttribute('aria-label') || e.closest('label') || (e.id && document.querySelector('label[for="'+e.id+'"]')); if (!ok) out.push('unlabelled control: ' + e.outerHTML.slice(0, 80)); });
  document.querySelectorAll('table').forEach(t => { if (!t.querySelector('caption')) out.push('table without caption'); t.querySelectorAll('th').forEach(th => { if (!th.getAttribute('scope')) out.push('th without scope: ' + th.textContent); }); });
  document.querySelectorAll('[tabindex]:not([tabindex="-1"])').forEach(e => { if (!e.getAttribute('aria-label') && !e.getAttribute('role')) out.push('focusable region without label: ' + e.tagName); });
  document.querySelectorAll('[aria-pressed]').forEach(e => { if (!['true','false'].includes(e.getAttribute('aria-pressed'))) out.push('aria-pressed value ' + e.getAttribute('aria-pressed')); });
  document.querySelectorAll('[href]').forEach(e => { const h = e.getAttribute('href'); if (/^javascript:/i.test(h) || /^http:/.test(h)) out.push('unsafe href ' + h); });
  // touch target size (44px for buttons/links in controls) - report only small ones that are not inline text links
  document.querySelectorAll('button,select,input:not([type=hidden]):not([aria-hidden="true"]):not([type=radio]):not([type=checkbox]),textarea').forEach(e => { const r = e.getBoundingClientRect(); if (r.width && r.height && r.height < 32) out.push('small target ' + Math.round(r.height) + 'px: ' + name(e).slice(0,30)); });
  // contrast
  const lum = c => { const [r,g,b] = c.map(v => { v/=255; return v <= .03928 ? v/12.92 : Math.pow((v+.055)/1.055, 2.4); }); return .2126*r + .7152*g + .0722*b; };
  const parse = s => { const m = s.match(/rgba?\(([^)]+)\)/); if (!m) return null; const p = m[1].split(',').map(x => parseFloat(x)); return { c: p.slice(0,3), a: p.length > 3 ? p[3] : 1 }; };
  const bgOf = e => { const stack = []; for (let n = e; n; n = n.parentElement) { const p = parse(getComputedStyle(n).backgroundColor); if (p && p.a > 0) { stack.push(p); if (p.a >= 1) break; } } let base = [10,13,14]; for (let i = stack.length - 1; i >= 0; i--) { const p = stack[i]; base = base.map((v, k) => v * (1 - p.a) + p.c[k] * p.a); } return base; };
  const seen = new Set();
  const w = document.createTreeWalker(main, NodeFilter.SHOW_TEXT);
  while (w.nextNode()) { const t = w.currentNode; if (!t.textContent.trim()) continue; const e = t.parentElement; if (!e || e.closest('.sr')) continue; const cs = getComputedStyle(e); if (cs.visibility === 'hidden' || cs.display === 'none') continue; const fg = parse(cs.color); if (!fg) continue; const bg = bgOf(e); const l1 = lum(fg.c), l2 = lum(bg); const ratio = (Math.max(l1,l2)+.05)/(Math.min(l1,l2)+.05); const size = parseFloat(cs.fontSize), bold = parseInt(cs.fontWeight) >= 700; const large = size >= 24 || (size >= 18.66 && bold); const need = large ? 3 : 4.5; if (ratio < need) { const k = cs.color + '|' + bg.map(Math.round) + '|' + size; if (!seen.has(k)) { seen.add(k); out.push('contrast ' + ratio.toFixed(2) + ' < ' + need + ' (' + cs.color + ' on ' + bg.map(Math.round) + ', ' + size + 'px): ' + t.textContent.trim().slice(0, 40)); } } }

  document.querySelectorAll('input[type=radio]').forEach(e => { if (!e.closest('fieldset') || !e.closest('fieldset').querySelector('legend')) out.push('radio outside a labelled fieldset: ' + e.id); });
  document.querySelectorAll('[tabindex]').forEach(e => { if (+e.getAttribute('tabindex') > 0) out.push('positive tabindex'); });
  document.querySelectorAll('[aria-describedby]').forEach(e => { e.getAttribute('aria-describedby').split(/\s+/).forEach(i => { if (!document.getElementById(i)) out.push('aria-describedby points nowhere: ' + i); }); });
  document.querySelectorAll('[aria-labelledby]').forEach(e => { e.getAttribute('aria-labelledby').split(/\s+/).forEach(i => { if (!document.getElementById(i)) out.push('aria-labelledby points nowhere: ' + i); }); });
  document.querySelectorAll('svg[role=img]').forEach(e => { if (!e.getAttribute('aria-label') && !e.querySelector('title')) out.push('svg img without a name'); });
  if (!document.querySelector('#live[aria-live]')) out.push('no live region');
  if (document.documentElement.scrollWidth - document.documentElement.clientWidth > 1) out.push('page scrolls sideways');
  return out;
}
"""



def audit(page, routes, label, issues):
    for r in routes:
        page.evaluate(f"location.hash='{r}'")
        page.wait_for_timeout(350)
        res = page.evaluate(JS)
        if res:
            issues[f"{label} {r}"] = res


def main():
    issues = {}
    with tempfile.TemporaryDirectory(prefix="commons-a11y-") as tmp:
        f = pathlib.Path(tmp) / "preview.html"
        f.write_text(P.artifact_html(P.build_bundle()), encoding="utf-8")
        with sync_playwright() as p:
            b = p.chromium.launch()
            for vw, name in (({"width": 1280, "height": 900}, "desktop"), ({"width": 390, "height": 800}, "phone")):
                ctx = b.new_context(viewport=vw)
                ctx.route("**/fonts.g*/**", lambda r: r.abort())
                pg = ctx.new_page()
                pg.goto("file://" + str(f))
                pg.wait_for_selector("#fallback, main h1")
                pg.wait_for_selector("#pv")
                audit(pg, EMPTY_ROUTES, f"{name} (demo off)", issues)
                pg.check("#pv-demo")
                pg.wait_for_timeout(250)
                audit(pg, DEMO_ROUTES, f"{name} (demo on)", issues)
                # the map itself, shown, with a node selected
                pg.evaluate("location.hash='constellation'")
                pg.wait_for_timeout(300)
                if name == "phone":
                    pg.click("button:has-text('Show the map')")
                pg.click("#cn-list button.r >> nth=0")
                pg.wait_for_timeout(200)
                res = pg.evaluate(JS)
                if res:
                    issues[f"{name} constellation with a selection"] = res
                ctx.close()
            b.close()
    print(json.dumps(issues, indent=1))
    n = len(DEMO_ROUTES) + len(EMPTY_ROUTES) + 1
    print(f"{n} view states x 2 widths audited; view states with issues: {len(issues)}")
    return 1 if issues else 0


if __name__ == "__main__":
    sys.exit(main())
