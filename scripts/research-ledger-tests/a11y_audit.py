#!/usr/bin/env python3
"""Accessibility audit of the Research Ledger interface. Run: python3 scripts/research-ledger-tests/a11y_audit.py

A purpose-built audit (no network needed). For every view, at desktop and phone width, with the fictional demonstration switched on, it checks:
one h1; no skipped heading levels; no duplicate ids; every link and button has an accessible name; every control is labelled; every table has a
caption and column scopes; focusable scroll regions are labelled; aria-pressed values; no javascript: or http: links; target size of controls;
and WCAG text contrast (4.5:1, or 3:1 for large text) for every piece of visible text against its real background.
It complements, and does not replace, a screen-reader pass by a person. Exit status 1 if anything is found.
"""
import json, pathlib, sys, tempfile
HERE = pathlib.Path(__file__).resolve().parent
sys.path.insert(0, str(HERE.parent))
import build_ledger_preview as P  # noqa: E402
from playwright.sync_api import sync_playwright  # noqa: E402

ROUTES = ["home", "publications", "publication-PUB-001", "publication-PUB-002", "evidence", "source-SRC-001", "source-SRC-010", "claim-CLM-001", "claim-CLM-015",
          "revisions", "compare-PUB-001", "corrections", "review", "methodology", "timeline", "integrity", "idea", "concern",
          "publication-DEMO-PUB-001", "compare-DEMO-PUB-001", "claim-DEMO-CLM-002", "source-DEMO-SRC-002", "correction-DEMO-COR-001"]
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
  document.querySelectorAll('input,select,textarea').forEach(e => { const ok = e.getAttribute('aria-label') || e.closest('label') || (e.id && document.querySelector('label[for="'+e.id+'"]')); if (!ok) out.push('unlabelled control: ' + e.outerHTML.slice(0, 80)); });
  document.querySelectorAll('table').forEach(t => { if (!t.querySelector('caption')) out.push('table without caption'); t.querySelectorAll('th').forEach(th => { if (!th.getAttribute('scope')) out.push('th without scope: ' + th.textContent); }); });
  document.querySelectorAll('[tabindex]:not([tabindex="-1"])').forEach(e => { if (!e.getAttribute('aria-label') && !e.getAttribute('role')) out.push('focusable region without label: ' + e.tagName); });
  document.querySelectorAll('[aria-pressed]').forEach(e => { if (!['true','false'].includes(e.getAttribute('aria-pressed'))) out.push('aria-pressed value ' + e.getAttribute('aria-pressed')); });
  document.querySelectorAll('[href]').forEach(e => { const h = e.getAttribute('href'); if (/^javascript:/i.test(h) || /^http:/.test(h)) out.push('unsafe href ' + h); });
  // touch target size (44px for buttons/links in controls) - report only small ones that are not inline text links
  document.querySelectorAll('button,select,input:not([type=hidden]),textarea').forEach(e => { const r = e.getBoundingClientRect(); if (r.width && r.height && r.height < 32) out.push('small target ' + Math.round(r.height) + 'px: ' + name(e).slice(0,30)); });
  // contrast
  const lum = c => { const [r,g,b] = c.map(v => { v/=255; return v <= .03928 ? v/12.92 : Math.pow((v+.055)/1.055, 2.4); }); return .2126*r + .7152*g + .0722*b; };
  const parse = s => { const m = s.match(/rgba?\(([^)]+)\)/); if (!m) return null; const p = m[1].split(',').map(x => parseFloat(x)); return { c: p.slice(0,3), a: p.length > 3 ? p[3] : 1 }; };
  const bgOf = e => { const stack = []; for (let n = e; n; n = n.parentElement) { const p = parse(getComputedStyle(n).backgroundColor); if (p && p.a > 0) { stack.push(p); if (p.a >= 1) break; } } let base = [10,13,14]; for (let i = stack.length - 1; i >= 0; i--) { const p = stack[i]; base = base.map((v, k) => v * (1 - p.a) + p.c[k] * p.a); } return base; };
  const seen = new Set();
  const w = document.createTreeWalker(main, NodeFilter.SHOW_TEXT);
  while (w.nextNode()) { const t = w.currentNode; if (!t.textContent.trim()) continue; const e = t.parentElement; if (!e || e.closest('.vh')) continue; const cs = getComputedStyle(e); if (cs.visibility === 'hidden' || cs.display === 'none') continue; const fg = parse(cs.color); if (!fg) continue; const bg = bgOf(e); const l1 = lum(fg.c), l2 = lum(bg); const ratio = (Math.max(l1,l2)+.05)/(Math.min(l1,l2)+.05); const size = parseFloat(cs.fontSize), bold = parseInt(cs.fontWeight) >= 700; const large = size >= 24 || (size >= 18.66 && bold); const need = large ? 3 : 4.5; if (ratio < need) { const k = cs.color + '|' + bg.map(Math.round) + '|' + size; if (!seen.has(k)) { seen.add(k); out.push('contrast ' + ratio.toFixed(2) + ' < ' + need + ' (' + cs.color + ' on ' + bg.map(Math.round) + ', ' + size + 'px): ' + t.textContent.trim().slice(0, 40)); } } }
  return out;
}
"""


def main():
    issues = {}
    with tempfile.TemporaryDirectory(prefix="ledger-a11y-") as tmp:
        f = pathlib.Path(tmp) / "preview.html"
        f.write_text(P.artifact_html(P.build_bundle()), encoding="utf-8")
        with sync_playwright() as p:
            b = p.chromium.launch()
            for vw, name in (({"width": 1280, "height": 900}, "desktop"), ({"width": 390, "height": 800}, "phone")):
                ctx = b.new_context(viewport=vw)
                ctx.route("**/fonts.g*/**", lambda r: r.abort())
                pg = ctx.new_page()
                pg.goto("file://" + str(f))
                pg.wait_for_selector("h1")
                pg.click("#demo-toggle")
                pg.wait_for_timeout(200)
                for r in ROUTES:
                    pg.evaluate(f"location.hash='{r}'")
                    pg.wait_for_timeout(350)
                    res = pg.evaluate(JS)
                    if res:
                        issues[f"{name} {r}"] = res
                ctx.close()
            b.close()
    print(json.dumps(issues, indent=1))
    print(f"{len(ROUTES)} views x 2 widths audited; views with issues: {len(issues)}")
    return 1 if issues else 0


if __name__ == "__main__":
    sys.exit(main())
