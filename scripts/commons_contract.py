#!/usr/bin/env python3
"""Reference server-side contract for Research Commons submissions.

THIS IS A SPECIFICATION YOU CAN RUN, NOT THE PRODUCTION SERVICE. The Architect backend is hosted outside this repository and
currently serves only GET /api/public/articles. Whoever builds the receiving endpoint (see docs/research-commons/CONTRACT.md) must
enforce the same rules on the server, and must pass docs/research-commons/contract/conformance-cases.json. This module exists so that
the rules are written down precisely, the browser form is tested against them, and the conformance cases are proven to be satisfiable.

Design rules it demonstrates:
  * one inbox: POST /api/public/contributions takes four types (question, publication, topic, perspective); the existing
    POST /api/public/question-submissions is kept as an alias for type "question" with the original request format;
  * the server never trusts the browser: every field is validated again, text is normalised and stored as plain text;
  * nothing is ever published by this endpoint: an accepted submission is only ever "submitted" (then "pending-review");
  * a honeypot hit is answered like a success but stored nowhere, so bots learn nothing;
  * similar-to-public duplicates are flagged for the editor, but the visitor is never told what other people have submitted;
  * an identical resubmission is idempotent (no second record);
  * rate limits are per salted-hash key, never per stored IP;
  * links are allowed only in the fields made for them; email addresses are refused; rights and consent are recorded, not assumed.

Everything here is deterministic and uses only the standard library.
"""
from __future__ import annotations

import hashlib
import json
import re
import unicodedata
from dataclasses import dataclass, field
from urllib.parse import urlsplit

TYPES = ("question", "publication", "topic", "perspective")
CATEGORIES = ("human", "ai", "neuro", "mind", "memory", "ethics", "human-machine")
LEGACY_CATEGORIES = ("human", "ai", "neuro", "mind", "memory", "ethics")   # what the Unanswered Archive form offers
ATTRIBUTION_MODES = ("anonymous", "display-name")
MAX_BODY_BYTES = 16 * 1024
MIN_ELAPSED_MS = 2500
CONSENT_VERSION_RE = re.compile(r"^[A-Za-z0-9._-]{1,40}$")

# field limits (characters, after normalisation)
LIMITS = {
    "question": {"question": (15, 400), "explanation": (0, 1000)},
    "publication": {"title": (5, 300), "authors": (0, 300), "venue": (0, 200), "why": (40, 1200), "year": (0, 0)},
    "topic": {"title": (8, 200), "description": (60, 2000), "why": (40, 1200)},
    "perspective": {"title": (8, 300), "text": (200, 4000), "references": (0, 800), "relatedQuestion": (0, 300)},
}
ALLOWED_FIELDS = {
    "question": {"question", "category", "explanation"},
    "publication": {"title", "authors", "venue", "year", "doi", "url", "category", "why"},
    "topic": {"title", "description", "why", "category"},
    "perspective": {"title", "text", "references", "category", "relatedQuestion"},
}
COMMON_FIELDS = {"type", "consent", "consentVersion", "attribution", "hp", "elapsedMs", "origin"}
# free-text fields in which a link is never accepted (links belong in url / references)
NO_LINK_FIELDS = {"question", "explanation", "title", "authors", "venue", "why", "description", "text", "relatedQuestion"}
# fields where line breaks are meaningful
MULTILINE = {"explanation", "why", "description", "text", "references"}

EMAIL_RE = re.compile(r"[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}")
LINK_RE = re.compile(r"(?:https?://|www\.)\S+", re.I)
PHONE_RE = re.compile(r"(?<![\w/.])\+?\d[\d\s().-]{8,}\d(?![\w/])")
DOI_RE = re.compile(r"^10\.\d{4,9}/[^\s\"<>]+$")
CONTROL_RE = re.compile(r"[\x00-\x08\x0b\x0c\x0e-\x1f\x7f​-‏‪-‮⁦-⁩﻿]")
URL_SHORTENERS = {"bit.ly", "t.co", "tinyurl.com", "goo.gl", "ow.ly", "is.gd", "buff.ly", "rebrand.ly", "cutt.ly", "shorturl.at"}
SPAMMY = re.compile(r"\b(?:buy now|click here|free money|crypto|casino|viagra|seo services|backlinks?|promo code|work from home|earn \$)\b", re.I)
THREAT = re.compile(r"\b(?:kill (?:you|yourself|them)|i will find (?:you|where)|home address|doxx?|swat)\b", re.I)


@dataclass
class Result:
    status: int
    body: dict
    stored: dict | None = None          # what a real service would write (never shown to the visitor)
    discarded: bool = False
    headers: dict = field(default_factory=dict)


def err(status: int, code: str, message: str, fields: dict | None = None, **headers) -> Result:
    return Result(status, {"ok": False, "error": {"code": code, "message": message, **({"fields": fields} if fields else {})}}, headers=dict(headers))


def clean_text(s: str, multiline: bool) -> str:
    s = unicodedata.normalize("NFC", s)
    s = CONTROL_RE.sub("", s.replace("\r\n", "\n").replace("\r", "\n"))
    if multiline:
        lines = [re.sub(r"[ \t]+", " ", ln).strip() for ln in s.split("\n")]
        s = re.sub(r"\n{3,}", "\n\n", "\n".join(lines)).strip()
    else:
        s = re.sub(r"\s+", " ", s).strip()
    return s


def dup_key(text: str) -> frozenset:
    return frozenset(w for w in re.findall(r"[a-z0-9]+", unicodedata.normalize("NFKD", text).lower()) if len(w) > 2)


def similarity(a: str, b: str) -> float:
    ka, kb = dup_key(a), dup_key(b)
    return len(ka & kb) / len(ka | kb) if ka and kb else 0.0


def safe_url(u: str):
    """https only, no credentials, no IP literals, no localhost or private names, no shorteners, <= 500 chars."""
    if not u or len(u) > 500:
        return None
    p = urlsplit(u)
    host = (p.hostname or "").lower()
    if p.scheme != "https" or not host or p.username or p.password or "." not in host:
        return None
    if re.fullmatch(r"[\d.]+|[0-9a-f:]+", host) or host.endswith((".local", ".internal", ".localhost")) or host in URL_SHORTENERS:
        return None
    return u


def validate(payload, *, content_type="application/json", raw_length=0, alias="contributions", known_public=(), rate=None, seen_keys=()) -> Result:
    """Validate one submission. `alias` is "contributions" (all types) or "question-submissions" (legacy, type question only).

    known_public: iterable of (id, title) for approved public items, used only to flag similarity for the editor.
    rate: optional RateLimiter; seen_keys: iterable of idempotency keys already stored.
    """
    if not str(content_type).lower().startswith("application/json"):
        return err(415, "unsupported-media-type", "Send the request as application/json.")
    if raw_length > MAX_BODY_BYTES:
        return err(413, "too-large", "The request is too large.")
    if not isinstance(payload, dict):
        return err(400, "bad-request", "The request body must be a JSON object.")

    legacy = alias == "question-submissions"
    ctype = payload.get("type", "question" if legacy else None)
    if ctype not in TYPES or (legacy and ctype != "question"):
        return err(422, "invalid-type", "Choose one of: " + ", ".join(TYPES) + ".", {"type": "invalid"})
    allowed = ALLOWED_FIELDS[ctype] | COMMON_FIELDS | ({"category"} if "category" in ALLOWED_FIELDS[ctype] else set())
    extra = sorted(set(payload) - allowed)
    if extra:
        return err(400, "unknown-fields", "The request has fields this service does not accept.", {k: "unknown" for k in extra})

    # --- bots: a honeypot hit looks like success and stores nothing
    if payload.get("hp") not in (None, ""):
        return Result(202, {"ok": True, "receipt": _receipt("discarded")}, discarded=True)
    elapsed = payload.get("elapsedMs")
    if isinstance(elapsed, bool) or not isinstance(elapsed, int):
        return err(422, "invalid-field", "elapsedMs must be a whole number.", {"elapsedMs": "invalid"})
    if elapsed < MIN_ELAPSED_MS:
        return err(400, "too-fast", "Please take a moment to check what you wrote, then send again.", {"elapsedMs": "too-fast"})

    # --- consent and rights are recorded, never assumed
    if payload.get("consent") is not True:
        return err(422, "consent-required", "Confirming the consent statement is required.", {"consent": "required"})
    cv = payload.get("consentVersion")
    if cv is not None and not (isinstance(cv, str) and CONSENT_VERSION_RE.match(cv)):
        return err(422, "invalid-field", "consentVersion is not valid.", {"consentVersion": "invalid"})

    errors: dict[str, str] = {}
    flags: list[str] = []
    clean: dict = {"type": ctype}
    limits = LIMITS[ctype]
    for name, (lo, hi) in limits.items():
        if name == "year":
            continue
        raw = payload.get(name)
        if raw is None or raw == "":
            if lo > 0:
                errors[name] = "required"
            continue
        if not isinstance(raw, str):
            errors[name] = "invalid"
            continue
        v = clean_text(raw, name in MULTILINE)
        if len(v) < lo:
            errors[name] = f"too-short (min {lo})"
        elif len(v) > hi:
            errors[name] = f"too-long (max {hi})"
        elif name in NO_LINK_FIELDS and LINK_RE.search(v):
            errors[name] = "links-not-allowed-here"
        elif EMAIL_RE.search(v):
            errors[name] = "email-address-not-allowed"
        elif name in ("question", "title", "text") and not re.search(r"[A-Za-zÀ-ɏ]", v):
            errors[name] = "write-in-words"
        else:
            clean[name] = v
            if PHONE_RE.search(v):
                flags.append("possible-phone-number")
            if SPAMMY.search(v):
                flags.append("promotional-language")
            if THREAT.search(v):
                flags.append("possible-threat-or-doxxing")
            if len(v) > 40 and sum(c.isupper() for c in v) / max(1, sum(c.isalpha() for c in v)) > .6:
                flags.append("mostly-capitals")
            if re.search(r"(.)\1{9,}", v):
                flags.append("repeated-characters")

    cat = payload.get("category")
    if cat not in (None, ""):
        if cat not in (LEGACY_CATEGORIES if legacy else CATEGORIES):
            errors["category"] = "invalid"
        else:
            clean["category"] = cat

    if ctype == "publication":
        doi = payload.get("doi")
        if doi not in (None, ""):
            d = re.sub(r"^(?:https?://(?:dx\.)?doi\.org/|doi:\s*)", "", str(doi).strip(), flags=re.I).rstrip(".,;")
            if DOI_RE.match(d):
                clean["doi"] = d.lower()
            else:
                errors["doi"] = "not-a-doi"
        url = payload.get("url")
        if url not in (None, ""):
            u = safe_url(str(url).strip())
            if u:
                clean["url"] = u
            else:
                errors["url"] = "must-be-a-public-https-link"
        if "doi" not in clean and "url" not in clean:
            flags.append("no-identifier")
        yr = payload.get("year")
        if yr not in (None, ""):
            if isinstance(yr, bool) or not isinstance(yr, int) or not 1000 <= yr <= 2100:
                errors["year"] = "invalid"
            else:
                clean["year"] = yr
    if ctype == "perspective":
        refs = clean.get("references", "")
        if refs and len(LINK_RE.findall(refs)) > 3:
            errors["references"] = "too-many-links"

    # --- attribution: anonymous by default; a chosen name is public if published, so say so and bound it
    attr = payload.get("attribution", {"mode": "anonymous"})
    if not isinstance(attr, dict) or attr.get("mode") not in ATTRIBUTION_MODES or set(attr) - {"mode", "name"}:
        errors["attribution"] = "invalid"
    elif attr["mode"] == "anonymous":
        clean["attribution"] = {"mode": "anonymous"}
    else:
        nm = clean_text(str(attr.get("name", "")), False)
        if not 2 <= len(nm) <= 40 or LINK_RE.search(nm) or EMAIL_RE.search(nm) or CONTROL_RE.search(nm):
            errors["attribution"] = "name-must-be-2-to-40-characters-without-links-or-email"
        else:
            clean["attribution"] = {"mode": "display-name", "name": nm}

    if errors:
        return err(422, "invalid-field", "Some fields need attention.", errors)

    # --- rate limits, then idempotency, then similarity (in that order, so abuse costs the sender, not the store)
    key = hashlib.sha256(json.dumps(clean, sort_keys=True, ensure_ascii=False).encode()).hexdigest()
    if rate is not None:
        limited = rate.check()
        if limited:
            return err(429, "rate-limited", "Too many submissions just now. Please try again later.", **{"Retry-After": str(limited)})
    if key in set(seen_keys):
        return Result(200, {"ok": True, "receipt": _receipt(key), "duplicate": True}, discarded=True)

    headline = clean.get("question") or clean.get("title") or ""
    similar = [pid for pid, title in known_public if similarity(headline, title) >= .8]
    if similar:
        flags.append("similar-to-public:" + ",".join(similar[:3]))

    stored = {"state": "pending-review", "idempotencyKey": key, "content": clean, "flags": sorted(set(flags)),
              "origin": payload.get("origin") if payload.get("origin") in ("research-commons", "unanswered-archive") else ("unanswered-archive" if legacy else "research-commons"),
              "consent": {"given": True, "version": cv}, "published": False}
    return Result(202, {"ok": True, "receipt": _receipt(key)}, stored=stored)


def _receipt(seed: str) -> str:
    """An opaque, non-guessable handle. A real service issues a random 128-bit token and stores only its hash."""
    return "rcpt_" + hashlib.sha256(("receipt:" + seed).encode()).hexdigest()[:32]


class RateLimiter:
    """Reference limits: 5 per hour and 20 per day per sender key, 200 per hour overall. The key is a salted hash of the network address,
    rotated daily, so no address is stored. Time is injected so the behaviour is testable."""

    def __init__(self, now=lambda: 0.0, per_hour=5, per_day=20, global_per_hour=200):
        self.now, self.per_hour, self.per_day, self.global_per_hour = now, per_hour, per_day, global_per_hour
        self.sender: dict[str, list[float]] = {}
        self.all: list[float] = []
        self.current = "sender"

    def as_sender(self, key: str):
        self.current = key
        return self

    def check(self) -> int:
        """Returns 0 if the request is allowed (and counts it), else the number of seconds to wait."""
        t = self.now()
        hist = [x for x in self.sender.get(self.current, []) if t - x < 86400]
        glob = [x for x in self.all if t - x < 3600]
        hour = [x for x in hist if t - x < 3600]
        if len(glob) >= self.global_per_hour:
            return int(3600 - (t - glob[0])) + 1
        if len(hour) >= self.per_hour:
            return int(3600 - (t - hour[0])) + 1
        if len(hist) >= self.per_day:
            return int(86400 - (t - hist[0])) + 1
        hist.append(t)
        glob.append(t)
        self.sender[self.current] = hist
        self.all = glob
        return 0


def handle(method, path, headers, body_bytes, *, known_public=(), rate=None, seen_keys=(), origin_allowed="https://amarisct.github.io") -> Result:
    """A whole request, as the HTTP layer would present it. Used by the conformance runner and the browser tests."""
    h = {k.lower(): v for k, v in (headers or {}).items()}
    cors = {"Access-Control-Allow-Origin": origin_allowed, "Vary": "Origin", "Access-Control-Expose-Headers": "Retry-After"}   # without this a browser cannot read Retry-After
    if method == "OPTIONS":
        return Result(204, {}, headers={**cors, "Access-Control-Allow-Methods": "POST", "Access-Control-Allow-Headers": "Content-Type", "Access-Control-Max-Age": "600"})
    if method != "POST":
        return Result(405, {"ok": False, "error": {"code": "method-not-allowed", "message": "Use POST."}}, headers={**cors, "Allow": "POST"})
    alias = {"/api/public/contributions": "contributions", "/api/public/question-submissions": "question-submissions"}.get(path)
    if alias is None:
        return Result(404, {"ok": False, "error": {"code": "not-found", "message": "No such endpoint."}}, headers=cors)
    origin = h.get("origin")
    if origin is not None and origin != origin_allowed:
        return Result(403, {"ok": False, "error": {"code": "origin-not-allowed", "message": "This origin may not submit."}}, headers=cors)
    try:
        payload = json.loads(body_bytes.decode("utf-8")) if body_bytes else None
    except (UnicodeDecodeError, ValueError):
        return Result(400, {"ok": False, "error": {"code": "bad-json", "message": "The request body is not valid JSON."}}, headers=cors)
    r = validate(payload, content_type=h.get("content-type", ""), raw_length=len(body_bytes or b""), alias=alias,
                 known_public=known_public, rate=rate, seen_keys=seen_keys)
    r.headers = {**cors, **r.headers}
    return r
