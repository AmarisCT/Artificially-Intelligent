#!/usr/bin/env python3
"""Run the Research Commons submission conformance cases.

    commons_conformance.py                      # against the reference implementation (proves the cases are satisfiable)
    commons_conformance.py --base https://host  # against a real service (the Architect backend, once it exists)
    commons_conformance.py --base https://host --stateful   # also send the rate-limit and duplicate cases (sends ~12 real submissions)

Against a real service this sends real requests that, if accepted, create records in its moderation inbox. Run it against a staging copy,
or delete the test records afterwards. Every body is clearly test material. Nothing is published by an accepted submission.
Exit status 1 if any case fails.
"""
from __future__ import annotations

import argparse
import json
import pathlib
import sys
import urllib.error
import urllib.request

HERE = pathlib.Path(__file__).resolve().parent
ROOT = HERE.parent
CASES = ROOT / "docs" / "research-commons" / "contract" / "conformance-cases.json"
sys.path.insert(0, str(HERE))
import commons_contract as C  # noqa: E402


def load():
    return json.loads(CASES.read_text(encoding="utf-8"))


def body_bytes(req) -> bytes:
    if "bodyText" in req:
        return req["bodyText"].encode("utf-8")
    if "body" in req and req["body"] is not None:
        return json.dumps(req["body"], ensure_ascii=False).encode("utf-8")
    return b""


def judge(case, status, body, headers):
    """Compare a response with the case's expectation. Returns a list of problems (empty if it conforms)."""
    exp, out = case["expect"], []
    if status != exp["status"]:
        out.append(f"status {status}, expected {exp['status']}")
    if "code" in exp:
        code = ((body or {}).get("error") or {}).get("code")
        if code != exp["code"]:
            out.append(f"error code {code!r}, expected {exp['code']!r}")
    if "fields" in case:
        got = ((body or {}).get("error") or {}).get("fields") or {}
        for f in case["fields"]:
            if f not in got:
                out.append(f"error.fields is missing {f!r}")
    for k, v in (case.get("headers_expect") or {}).items():
        if (headers or {}).get(k.lower()) != v:
            out.append(f"header {k}: {(headers or {}).get(k.lower())!r}, expected {v!r}")
    if exp["status"] in (200, 202) and not (body or {}).get("ok"):
        out.append("a success must say ok:true")
    return out


def run_local(case, state):
    req = case["request"]
    r = C.handle(req["method"], req["path"], req["headers"], body_bytes(req), known_public=state.get("public", ()), rate=state.get("rate"), seen_keys=state.get("seen", ()))
    return r.status, r.body, {k.lower(): v for k, v in r.headers.items()}, r


def run_http(base, case):
    req = case["request"]
    rq = urllib.request.Request(base.rstrip("/") + req["path"], data=body_bytes(req) or None, method=req["method"], headers=req["headers"])
    try:
        with urllib.request.urlopen(rq, timeout=20) as resp:
            raw, st, hd = resp.read(), resp.status, resp.headers
    except urllib.error.HTTPError as e:
        raw, st, hd = e.read(), e.code, e.headers
    try:
        body = json.loads(raw.decode("utf-8")) if raw else {}
    except ValueError:
        body = {}
    return st, body, {k.lower(): v for k, v in hd.items()}


def main(argv=None):
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--base", help="base URL of a real service, e.g. https://example.org")
    ap.add_argument("--stateful", action="store_true", help="against a real service, also run the rate-limit and duplicate cases")
    args = ap.parse_args(argv)
    data = load()
    fails = skipped = ran = 0
    for case in data["cases"]:
        stateful = case.get("stateful")
        if stateful and args.base and not args.stateful:
            skipped += 1
            continue
        problems = []
        if stateful == "rate-limit":
            sends = [dict(case, request=dict(case["request"], body={**case["request"]["body"], "question": f"{case['request']['body']['question']} (variant {i})"})) for i in range(6)]
            if args.base:
                last = [run_http(args.base, s) for s in sends][-1]
                problems = judge(case, last[0], last[1], last[2])
            else:
                rate = C.RateLimiter(now=lambda: 1000.0)
                for s in sends[:-1]:
                    run_local(s, {"rate": rate})
                st, body, hd, _ = run_local(sends[-1], {"rate": rate})
                problems = judge(case, st, body, hd)
                if "retry-after" not in hd:
                    problems.append("a 429 must carry Retry-After")
        elif stateful == "duplicate":
            if args.base:
                run_http(args.base, case)
                st, body, hd = run_http(args.base, case)
            else:
                st, body, hd, first = run_local(case, {})
                st, body, hd, _ = run_local(case, {"seen": [first.stored["idempotencyKey"]]}) if first.stored else (st, body, hd, None)
            problems = judge(case, st, body, hd)
            if not (body or {}).get("duplicate"):
                problems.append("the repeat must say duplicate:true")
        else:
            st, body, hd = (run_http(args.base, case) if args.base else run_local(case, {})[:3])
            problems = judge(case, st, body, hd)
        ran += 1
        if problems:
            fails += 1
            print("FAIL", case["name"], "->", "; ".join(problems))
    print(f"{ran} cases run, {fails} failed" + (f", {skipped} stateful cases skipped (use --stateful)" if skipped else ""))
    return 1 if fails else 0


if __name__ == "__main__":
    sys.exit(main())
