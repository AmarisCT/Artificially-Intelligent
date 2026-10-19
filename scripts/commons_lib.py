"""Shared helpers for the Research Commons scripts: paths, JSON I/O, the public-record rules, and the report type.

The rules in `check_contribution` are the single definition of what may appear in a PUBLIC contribution record. The validator, the sync
script and the static-page builder all use it, so there is one place that decides what the public repository may contain.
"""
from __future__ import annotations

import datetime as dt
import json
import pathlib
import re

ROOT = pathlib.Path(__file__).resolve().parent.parent
COMMONS = ROOT / "research-commons"
DATA = COMMONS / "data"
SITE = "https://amarisct.github.io/Artificially-Intelligent/"
INDEX = ROOT / "inquiry-engine" / "data" / "research-index.json"

ID_RE = re.compile(r"^COM-\d{4,}$")
DATE_RE = re.compile(r"^\d{4}-\d{2}-\d{2}$")
EMAIL_RE = re.compile(r"[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}")
URL_RE = re.compile(r"(?:https?://|www\.)\S+", re.I)
DOI_RE = re.compile(r"^10\.\d{4,9}/[^\s\"<>]+$")
# Names that must never appear as a key anywhere in public data. They are what a moderation system holds privately.
PRIVATE_KEYS = {"email", "e-mail", "mail", "ip", "ipaddress", "ip_address", "useragent", "user_agent", "submissionid", "submission_id", "token", "receipt",
                "password", "secret", "apikey", "api_key", "notes", "privatenotes", "private_notes", "reviewer", "reviewernotes", "moderator", "moderation",
                "moderationnotes", "flags", "idempotencykey", "consent", "contact", "phone", "name", "realname", "real_name", "declinedreason"}

CONTRIBUTION_FIELDS = {
    "id", "type", "title", "text", "category", "concepts", "related", "attribution", "publishedOn", "updatedOn", "editorialContext",
    "editorialContextBy", "source", "status", "statusNote", "collections", "featured", "withdrawal", "openQuestions", "respondsTo",
}
SOURCE_FIELDS = {"title", "authors", "venue", "year", "doi", "url", "verification", "verificationNote"}
TOMBSTONE_FIELDS = {"id", "type", "publishedOn", "updatedOn", "status", "withdrawal"}


class Report:
    def __init__(self):
        self.errors: list[str] = []
        self.warnings: list[str] = []

    def err(self, where, msg):
        self.errors.append(f"{where}: {msg}")

    def warn(self, where, msg):
        self.warnings.append(f"{where}: {msg}")


def read_json(path, default=None):
    p = pathlib.Path(path)
    if not p.exists():
        return default
    return json.loads(p.read_text(encoding="utf-8"))


def dumps(obj) -> str:
    return json.dumps(obj, ensure_ascii=False, indent=2, sort_keys=False) + "\n"


def write_json(path, obj) -> bool:
    """Write only when the content changed. Returns True if the file changed."""
    p = pathlib.Path(path)
    text = dumps(obj)
    if p.exists() and p.read_text(encoding="utf-8") == text:
        return False
    p.parent.mkdir(parents=True, exist_ok=True)
    tmp = p.with_suffix(p.suffix + ".tmp")
    tmp.write_text(text, encoding="utf-8")
    tmp.replace(p)
    return True


def today_utc() -> str:
    return dt.datetime.now(dt.timezone.utc).strftime("%Y-%m-%d")


def valid_date(s) -> bool:
    if not isinstance(s, str) or not DATE_RE.match(s):
        return False
    try:
        dt.date.fromisoformat(s)
        return True
    except ValueError:
        return False


def index_ids(root=ROOT) -> dict:
    """{resource id: type} for every record in the shared research index, plus bare concept ids."""
    ix = read_json(pathlib.Path(root) / "inquiry-engine" / "data" / "research-index.json", {"resources": []})
    return {r["id"]: r["type"] for r in ix.get("resources", [])}


def walk_keys(obj, path=""):
    if isinstance(obj, dict):
        for k, v in obj.items():
            yield f"{path}.{k}" if path else k, k
            yield from walk_keys(v, f"{path}.{k}" if path else k)
    elif isinstance(obj, list):
        for i, v in enumerate(obj):
            yield from walk_keys(v, f"{path}[{i}]")


def check_contribution(c: dict, tax: dict, ids: dict, collection_ids: set, other_ids: dict, today: str, r: Report, where: str):
    """Everything that decides whether one record may be public."""
    types = {t["id"] for t in tax["types"]}
    cats = {t["id"] for t in tax["categories"]}
    statuses = {s["id"] for s in tax["publicStatuses"]}
    if not isinstance(c, dict):
        r.err(where, "a contribution must be an object")
        return
    cid = c.get("id", "")
    where = f"{where} {cid}"
    if not ID_RE.match(str(cid)):
        r.err(where, "id must look like COM-0001")
    if str(cid).startswith("DEMO") or c.get("demo"):
        r.err(where, "demonstration records must never be in public data")
    for k, _ in walk_keys(c):
        leaf = k.split(".")[-1].split("[")[0].lower()
        if leaf in PRIVATE_KEYS:
            r.err(where, f"field {k!r} is the kind of data a moderation system keeps private and must not be public")
    if c.get("type") not in types:
        r.err(where, f"unknown type {c.get('type')!r}")
    if c.get("status") not in statuses:
        r.err(where, f"status {c.get('status')!r} is not a public status")
    if not valid_date(c.get("publishedOn")) or not valid_date(c.get("updatedOn")):
        r.err(where, "publishedOn and updatedOn must be real dates (YYYY-MM-DD)")
    else:
        if c["updatedOn"] < c["publishedOn"]:
            r.err(where, "updatedOn is earlier than publishedOn")
        if c["updatedOn"] > today:
            r.err(where, "updatedOn is in the future")

    if c.get("status") == "withdrawn":
        extra = set(c) - TOMBSTONE_FIELDS
        if extra:
            r.err(where, f"a withdrawn record must keep only a notice; remove {sorted(extra)}")
        w = c.get("withdrawal")
        if not (isinstance(w, dict) and valid_date(w.get("on")) and isinstance(w.get("publicNote"), str) and w["publicNote"].strip()):
            r.err(where, "a withdrawn record needs withdrawal.on and a public note")
        elif EMAIL_RE.search(w["publicNote"]) or URL_RE.search(w["publicNote"]):
            r.err(where, "the withdrawal note may not contain links or email addresses")
        return
    extra = set(c) - CONTRIBUTION_FIELDS
    if extra:
        r.err(where, f"unknown fields {sorted(extra)}: only the documented public fields are allowed")
    if c.get("withdrawal"):
        r.err(where, "withdrawal is only valid on a withdrawn record")

    title = c.get("title")
    if not isinstance(title, str) or not 8 <= len(title.strip()) <= 400:
        r.err(where, "title must be 8 to 400 characters")
    text = c.get("text")
    if text is not None and (not isinstance(text, str) or len(text) > 6000):
        r.err(where, "text must be a string of at most 6000 characters")
    if c.get("type") == "perspective" and not (isinstance(text, str) and len(text.strip()) >= 150):
        r.err(where, "a perspective needs its approved text")
    for f in ("title", "text", "editorialContext", "statusNote"):
        v = c.get(f)
        if isinstance(v, str):
            if EMAIL_RE.search(v):
                r.err(where, f"{f} contains an email address")
            if URL_RE.search(v):
                r.err(where, f"{f} contains a link; links belong in source.url, never in approved text")
            if f in ("editorialContext", "statusNote") and re.search(r"peer[- ]review", v, re.I):
                r.err(where, f"{f} mentions peer review; a visitor contribution is never peer reviewed")
    if c.get("category") is not None and c["category"] not in cats:
        r.err(where, f"unknown category {c['category']!r}")

    a = c.get("attribution")
    if not (isinstance(a, dict) and a.get("mode") in {m["id"] for m in tax["attributionModes"]}):
        r.err(where, "attribution.mode is required")
    elif a["mode"] == "anonymous":
        if set(a) - {"mode"}:
            r.err(where, "an anonymous contribution carries no name")
    else:
        if set(a) - {"mode", "display", "authorized"}:
            r.err(where, "attribution has unknown fields")
        if a.get("authorized") is not True:
            r.err(where, "a displayed name needs attribution.authorized: true (the contributor agreed it may be shown)")
        d = a.get("display")
        if not (isinstance(d, str) and 2 <= len(d) <= 40) or EMAIL_RE.search(d or "") or URL_RE.search(d or ""):
            r.err(where, "attribution.display must be 2 to 40 characters with no links or email")

    ectx = c.get("editorialContext")
    if ectx and not c.get("editorialContextBy"):
        r.err(where, "editorial context must say who wrote it (editorialContextBy)")
    if c.get("editorialContextBy") and c["editorialContextBy"] != "Artificially Intelligent":
        r.err(where, "editorialContextBy must be 'Artificially Intelligent': the Commons never names moderators")

    for f in ("concepts", "related", "collections", "openQuestions"):
        if c.get(f) is not None and not isinstance(c[f], list):
            r.err(where, f"{f} must be a list")
    for x in c.get("concepts") or []:
        if x not in ids or ids[x] != "concept":
            r.err(where, f"concept {x!r} is not a Research Atlas concept in the shared index")
    for x in c.get("related") or []:
        if x not in ids and x not in other_ids:
            r.err(where, f"related record {x!r} does not exist in the shared index or in the Commons")
    rt = c.get("respondsTo")
    if rt is not None:
        if c.get("type") != "perspective":
            r.err(where, "only a perspective can respond to a question")
        elif not ((ids.get(rt) == "question") or (other_ids.get(rt) == "question")):
            r.err(where, f"respondsTo {rt!r} is not a question in the shared index or in the Commons")
        elif rt == c.get("id"):
            r.err(where, "a contribution cannot respond to itself")
    for x in c.get("collections") or []:
        if x not in collection_ids:
            r.err(where, f"collection {x!r} is not defined")
    for q in c.get("openQuestions") or []:
        if not isinstance(q, str) or EMAIL_RE.search(q) or URL_RE.search(q):
            r.err(where, "openQuestions must be plain sentences without links or email")

    src = c.get("source")
    if c.get("type") == "publication":
        if not isinstance(src, dict):
            r.err(where, "a publication recommendation needs a source object")
        else:
            if set(src) - SOURCE_FIELDS:
                r.err(where, f"unknown source fields {sorted(set(src) - SOURCE_FIELDS)}")
            if not (isinstance(src.get("title"), str) and src["title"].strip()):
                r.err(where, "source.title is required")
            if src.get("verification") not in {v["id"] for v in tax["sourceVerification"]}:
                r.err(where, "source.verification must be one of the defined levels")
            if src.get("doi") and not DOI_RE.match(str(src["doi"])):
                r.err(where, "source.doi is not a DOI")
            if src.get("url") and not str(src["url"]).startswith("https://"):
                r.err(where, "source.url must be https")
            if src.get("year") is not None and not (isinstance(src["year"], int) and 1000 <= src["year"] <= 2100):
                r.err(where, "source.year is not a year")
            if src.get("verification") == "metadata-confirmed" and not src.get("verificationNote"):
                r.err(where, "a confirmed source needs a verificationNote saying what was matched")
    elif src is not None:
        r.err(where, "only a publication recommendation has a source")
    if c.get("featured") is not None and not isinstance(c["featured"], bool):
        r.err(where, "featured must be true or false")


EDGE_PRIORITY = {"editorial": 0, "verified-metadata": 1, "preliminary": 2, "suggested": 3}


def contribution_edges(contributions: list, relations: list) -> list:
    """Every link between an approved contribution and another record, with its provenance.

    A link comes from (a) the editor's own record fields (concepts, related research, the question a perspective responds to), which are
    editorial, or (b) the relations file, where each link says whether an editor reviewed it. When two links join the same pair, the one with
    the strongest provenance is kept, so an automated suggestion never hides, or is mistaken for, a reviewed link. Withdrawn records have none.
    The page's constellation derives the same list in JavaScript; a test compares the two.
    """
    raw = []
    ref = lambda x: f"contrib:{x}" if re.match(r"^(?:COM|DEMO)-\d{4,}$", str(x)) else x
    live = {c["id"] for c in contributions if c.get("status") != "withdrawn"}
    for c in contributions:
        if c.get("status") == "withdrawn":
            continue
        me = f"contrib:{c['id']}"
        for x in c.get("concepts") or []:
            raw.append({"a": me, "b": x, "why": "Tagged with this concept by the editor.", "kind": "editorial", "source": "research-commons"})
        for x in c.get("related") or []:
            raw.append({"a": me, "b": ref(x), "why": "Listed as related research by the editor.", "kind": "editorial", "source": "research-commons"})
        if c.get("respondsTo"):
            raw.append({"a": me, "b": ref(c["respondsTo"]), "why": "Written in response to this question.", "kind": "editorial", "source": "research-commons"})
    for r in relations:
        raw.append({"a": r["a"], "b": r["b"], "why": r["why"], "kind": r["kind"], "source": "research-commons"})
    best: dict = {}
    for e in raw:
        ends = [e["a"], e["b"]]
        if any(x.startswith("contrib:") and x[8:] not in live for x in ends):
            continue
        key = frozenset(ends)
        cur = best.get(key)
        if cur is None or EDGE_PRIORITY[e["kind"]] < EDGE_PRIORITY[cur["kind"]]:
            best[key] = dict(e)
        elif cur is not None and e["kind"] == cur["kind"] and e["why"] not in cur["why"]:
            cur["why"] = cur["why"].rstrip(".") + ". " + e["why"]
    return sorted(best.values(), key=lambda e: (e["a"], e["b"]))
