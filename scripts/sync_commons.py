#!/usr/bin/env python3
"""Bring approved public contributions into the repository from the moderation system.

The moderation system (the Architect backend, once it has one) holds every submission privately. Only an editor's explicit approval creates
a PUBLIC record. This script takes that approved export, checks it hard, and writes it into research-commons/data/. It is deliberately
dull and strict:

  * the source is either `--from-file approved.json` (a person exports and imports, which works today) or the https `syncEndpoint` in
    config.json (null until a service exists; then this script does nothing);
  * the whole export is validated with the same rules as the validator BEFORE any file is touched; one bad record stops everything;
  * the export is an authoritative snapshot: a record already public may not vanish (it must reappear as `withdrawn`), and its id, type and
    publishedOn may not change, so public URLs and dates stay stable;
  * a failed or invalid sync changes nothing, and the previous public data stays exactly as it was;
  * output is sorted and deterministic, so a repeated sync with the same export changes nothing and two runs cannot lose each other's work.

Export format:  {"contributions": [<public record>...], "relations": [<relation>...]}   (see docs/research-commons/CONTRACT.md)

Usage: sync_commons.py [--from-file approved.json] [--data DIR] [--dry-run] [--now ISO]
"""
from __future__ import annotations

import argparse
import datetime as dt
import json
import pathlib
import shutil
import sys
import tempfile
import urllib.request

sys.path.insert(0, str(pathlib.Path(__file__).resolve().parent))
import build_research_commons as B  # noqa: E402
import commons_lib as L  # noqa: E402
import validate_research_commons as V  # noqa: E402

MAX_BYTES = 2_000_000
STABLE = ("id", "type", "publishedOn")


class SyncError(Exception):
    pass


def fetch_https(url: str) -> dict:
    if not url.startswith("https://"):
        raise SyncError("the sync endpoint must be https")
    rq = urllib.request.Request(url, headers={"Accept": "application/json", "User-Agent": "ArtificiallyIntelligent-CommonsSync/1.0"})
    with urllib.request.urlopen(rq, timeout=30) as resp:
        raw = resp.read(MAX_BYTES + 1)
    if len(raw) > MAX_BYTES:
        raise SyncError("the export is larger than 2 MB")
    return json.loads(raw.decode("utf-8"))


def sync(data_dir, root, export: dict, now: str, source: str, dry_run=False) -> dict:
    data_dir, root = pathlib.Path(data_dir), pathlib.Path(root)
    if not (isinstance(export, dict) and isinstance(export.get("contributions"), list)):
        raise SyncError("the export must be an object with a 'contributions' list")
    extra = set(export) - {"contributions", "relations"}
    if extra:
        raise SyncError(f"the export has unknown top-level fields {sorted(extra)}")
    incoming = sorted(export["contributions"], key=lambda c: str(c.get("id", "")) if isinstance(c, dict) else "")
    relations = export.get("relations", [])
    cur = L.read_json(data_dir / "public-contributions.json")
    have = {c["id"]: c for c in cur["contributions"]}
    got = {c.get("id"): c for c in incoming if isinstance(c, dict)}
    if len(got) != len(incoming):
        raise SyncError("the export has duplicate or malformed ids")
    for cid, old in have.items():
        new = got.get(cid)
        if new is None:
            raise SyncError(f"{cid} is public here but missing from the export. A record is withdrawn by status, never by omission")
        for f in STABLE:
            if new.get(f) != old.get(f):
                raise SyncError(f"{cid}: {f} changed. Public ids, types and first-publication dates are permanent")
        if old.get("status") == "withdrawn" and new.get("status") != "withdrawn":
            raise SyncError(f"{cid} was withdrawn and cannot silently return. Re-publishing needs a new, approved record")

    with tempfile.TemporaryDirectory(prefix="commons-sync-") as tmp:
        tmp = pathlib.Path(tmp)
        stage = tmp / "research-commons"
        stage.mkdir()
        shutil.copytree(data_dir, stage / "data")
        shutil.copy(data_dir.parent / "config.json", stage / "config.json")
        for sub in ("inquiry-engine/data", "unanswered-archive/data"):
            shutil.copytree(root / sub, tmp / sub)
        pc = dict(cur, contributions=incoming, generatedFrom="Approved export from the moderation system (scripts/sync_commons.py)" if incoming else None)
        L.write_json(stage / "data" / "public-contributions.json", pc)
        rel = L.read_json(stage / "data" / "contribution-relations.json")
        L.write_json(stage / "data" / "contribution-relations.json", dict(rel, relations=relations))
        # collections become active exactly when they have approved members
        colls = L.read_json(stage / "data" / "collections.json")
        members = {}
        for c in incoming:
            if c.get("status") != "withdrawn":
                for col in c.get("collections") or []:
                    members[col] = True
        for col in colls["collections"]:
            col["status"] = "active" if members.get(col["id"]) else "planned"
        L.write_json(stage / "data" / "collections.json", colls)
        status = B.build_status(tmp, stage / "data", L.read_json(stage / "config.json"), L.read_json(stage / "data" / "commons-status.json"))
        status["lastSync"] = {"at": now, "source": source, "records": len(incoming)}
        L.write_json(stage / "data" / "commons-status.json", status)
        rep = V.validate(stage / "data", tmp, now[:10])
        if rep.errors:
            raise SyncError("the export failed validation, so nothing was written:\n  " + "\n  ".join(rep.errors))
        content = ("public-contributions", "contribution-relations", "collections")
        changed = [n for n in content if L.read_json(stage / "data" / f"{n}.json") != L.read_json(data_dir / f"{n}.json")]
        if changed and not dry_run:
            # lastSync moves only when the public data did, so an identical sync leaves no trace and no commit
            for name in content + ("commons-status",):
                L.write_json(data_dir / f"{name}.json", L.read_json(stage / "data" / f"{name}.json"))
    return {"records": len(incoming), "changed": changed, "added": sorted(set(got) - set(have))}


def main(argv=None):
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--from-file")
    ap.add_argument("--data", default=str(L.DATA))
    ap.add_argument("--dry-run", action="store_true")
    ap.add_argument("--now", default=dt.datetime.now(dt.timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ"))
    a = ap.parse_args(argv)
    cfg = L.read_json(pathlib.Path(a.data).parent / "config.json", {})
    try:
        if a.from_file:
            export, source = json.loads(pathlib.Path(a.from_file).read_text(encoding="utf-8")), "file"
        elif cfg.get("syncEndpoint"):
            export, source = fetch_https(cfg["syncEndpoint"]), "endpoint"
        else:
            print("No syncEndpoint is configured and no --from-file was given, so there is nothing to sync.")
            return 0
        res = sync(a.data, L.ROOT, export, a.now, source, a.dry_run)
    except (SyncError, OSError, ValueError) as e:
        print("SYNC FAILED, nothing was changed:", e)
        return 1
    print(f"{'would write' if a.dry_run else 'wrote'}: {res['changed'] or 'no changes'}; {res['records']} record(s) in the export; new: {res['added'] or 'none'}")
    if res["changed"] and not a.dry_run:
        B.build(L.ROOT)
    return 0


if __name__ == "__main__":
    sys.exit(main())
