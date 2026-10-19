#!/usr/bin/env python3
"""Run every Research Commons check and print one summary.

Run: python3 scripts/research-commons-tests/run_all.py [--skip-browser]

 1. validator on the real data (0 errors and 0 warnings required)
 2. committed public pages / data equal a fresh build
 3. a second build changes nothing (idempotence)
 4. pipeline tests: contract, rate limits, honeypot, idempotency, sync, validator, build, index, edges (Python, no browser)
 5. conformance cases: the reference implementation of the submission contract against every documented case
 6. browser tests (Chromium via Playwright): public page, library, constellation, forms, phone, private preview, shared inbox
 7. Search and Inquiry Engine regression with and without approved contributions
 8. accessibility audit (axe-style structural checks across states and widths)

Nothing here contacts the live site, any submission service or the Architect backend. Browser steps use throwaway copies of the site.
"""
import hashlib
import pathlib
import subprocess
import sys
import time

HERE = pathlib.Path(__file__).resolve().parent
ROOT = HERE.parents[1]
T = "scripts/research-commons-tests/"
steps = [
    ("validate real data", [sys.executable, "scripts/validate_research_commons.py"]),
    ("committed output is current", [sys.executable, "scripts/build_research_commons.py", "--check"]),
    ("pipeline, contract, validator, build tests", [sys.executable, T + "test_pipeline.py"]),
    ("conformance cases (reference contract)", [sys.executable, "scripts/commons_conformance.py"]),
]
if "--skip-browser" not in sys.argv:
    steps += [
        ("browser tests", [sys.executable, T + "test_ui.py"]),
        ("search and inquiry engine regression", [sys.executable, T + "test_shared.py"]),
        ("accessibility audit", [sys.executable, T + "a11y_audit.py"]),
    ]


def snapshot():
    """Content hash of everything the build writes, so 'nothing changed' means the bytes, not just git's status letters."""
    h = hashlib.sha256()
    for d in ("research-commons", "inquiry-engine/data", "search"):
        for f in sorted((ROOT / d).rglob("*")):
            if f.is_file():
                h.update(str(f.relative_to(ROOT)).encode())
                h.update(f.read_bytes())
    return h.hexdigest()


failed = []
for name, cmd in steps:
    t = time.time()
    r = subprocess.run(cmd, cwd=ROOT, capture_output=True, text=True)
    tail = [l for l in (r.stdout + r.stderr).strip().splitlines() if l.strip() and "ResourceWarning" not in l][-4:]
    status = "PASS" if r.returncode == 0 else "FAIL"
    print(f"{status}  {name}  ({time.time() - t:.1f}s)")
    for l in tail:
        print("      " + l[:160])
    if r.returncode:
        failed.append(name)

# idempotence: a second build must not change anything (only meaningful once the first one passed)
if "committed output is current" not in failed:
    t = time.time()
    before = snapshot()
    r = subprocess.run([sys.executable, "scripts/build_research_commons.py"], cwd=ROOT, capture_output=True, text=True)
    after = snapshot()
    c = subprocess.run([sys.executable, "scripts/build_research_commons.py", "--check"], cwd=ROOT, capture_output=True, text=True)
    ok = r.returncode == 0 and c.returncode == 0 and before == after
    print(f"{'PASS' if ok else 'FAIL'}  second build changes nothing  ({time.time() - t:.1f}s)")
    if not ok:
        failed.append("idempotence")
        print("      " + (r.stdout + r.stderr + c.stdout + c.stderr).strip().splitlines()[-1][:160])

print("\nALL CHECKS PASSED" if not failed else "\nFAILED: " + ", ".join(failed))
sys.exit(1 if failed else 0)
