#!/usr/bin/env python3
"""Run every Research Ledger check and print one summary. Run: python3 scripts/research-ledger-tests/run_all.py [--skip-browser]

1. validator on the real data (0 errors required)
2. committed ledger.json / article-notices.json equal a fresh build
3. a second build changes nothing (idempotence)
4. capture / validator / build / article-hook / index tests (Python, no browser)
5. comparison-logic tests (Node)
6. browser tests (Chromium via Playwright): public page, keyboard, phone, private preview
7. accessibility audit
"""
import pathlib
import subprocess
import sys
import time

HERE = pathlib.Path(__file__).resolve().parent
ROOT = HERE.parents[1]
steps = [
    ("validate real data", [sys.executable, "-I", "scripts/validate_research_ledger.py"]),
    ("committed bundle is current", [sys.executable, "-I", "scripts/build_research_ledger.py", "--check"]),
    ("pipeline, validator, build, hook tests", [sys.executable, "-I", "scripts/research-ledger-tests/test_pipeline.py"]),
    ("comparison logic tests (node)", ["node", "scripts/research-ledger-tests/test_diff.js"]),
]
if "--skip-browser" not in sys.argv:
    steps += [("browser tests", [sys.executable, "-I", "scripts/research-ledger-tests/test_ui.py"]),
              ("accessibility audit", [sys.executable, "-I", "scripts/research-ledger-tests/a11y_audit.py"])]
failed = []
for name, cmd in steps:
    t = time.time()
    r = subprocess.run(cmd, cwd=ROOT, capture_output=True, text=True)
    tail = [l for l in (r.stdout + r.stderr).strip().splitlines() if l.strip()][-4:]
    status = "PASS" if r.returncode == 0 else "FAIL"
    print(f"{status}  {name}  ({time.time() - t:.1f}s)")
    for l in tail:
        print("      " + l[:160])
    if r.returncode:
        failed.append(name)
print("\nALL CHECKS PASSED" if not failed else "\nFAILED: " + ", ".join(failed))
sys.exit(1 if failed else 0)
