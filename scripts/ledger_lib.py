#!/usr/bin/env python3
"""Shared helpers for the Research Ledger scripts.

Nothing in here talks to the network, reads the clock, or touches the Architect backend.
Every function is deterministic so that a rebuild with unchanged inputs writes nothing.
"""
from __future__ import annotations

import difflib
import email.utils
import hashlib
import json
import pathlib
import re
import unicodedata
import xml.etree.ElementTree as ET
from html.parser import HTMLParser

ROOT = pathlib.Path(__file__).resolve().parents[1]
SITE = "https://amarisct.github.io/Artificially-Intelligent/"
LEDGER = ROOT / "research-ledger"
DATA = LEDGER / "data"
CONTENT_NS = "{http://purl.org/rss/1.0/modules/content/}"
SCHEMA = 1
HASH_VERSION = 1  # bump only if normalise()/canonical() change; old hashes then stay comparable by version

SOURCE_MARKERS = {"sources", "references", "bibliography", "works cited", "source list"}
BLOCK_TAGS = {"p", "h1", "h2", "h3", "h4", "h5", "h6", "li", "blockquote", "pre", "figcaption", "td", "th"}


class LedgerError(Exception):
    """Raised for problems that must stop a script without damaging existing records."""


# ---------------------------------------------------------------- json helpers

def dump_json(obj) -> str:
    return json.dumps(obj, ensure_ascii=False, indent=1) + "\n"


def read_json(path, default=None):
    path = pathlib.Path(path)
    if not path.exists():
        if default is not None:
            return default
        raise LedgerError(f"Missing file: {path}")
    try:
        return json.loads(path.read_text(encoding="utf-8"))
    except json.JSONDecodeError as exc:
        raise LedgerError(f"{path} is not valid JSON: {exc}") from exc


def write_json(path, obj) -> bool:
    """Write only when the content changes. Returns True when a write happened."""
    path = pathlib.Path(path)
    text = dump_json(obj)
    if path.exists() and path.read_text(encoding="utf-8") == text:
        return False
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(text, encoding="utf-8")
    return True


# ---------------------------------------------------------------- text normalisation

def slugify(title: str) -> str:
    """Identical to scripts/build_published.py so a Ledger slug is always the page slug."""
    return re.sub(r"[^a-z0-9]+", "-", (title or "").lower()).strip("-")


def normalise(text: str) -> str:
    text = unicodedata.normalize("NFC", text or "")
    text = text.replace(" ", " ").replace("​", "").replace("﻿", "")
    return re.sub(r"\s+", " ", text).strip()


class _Blocks(HTMLParser):
    def __init__(self):
        super().__init__(convert_charrefs=True)
        self.blocks: list[str] = []
        self._cur: list[str] | None = None
        self._depth = 0

    def _flush(self):
        if self._cur is not None:
            text = normalise("".join(self._cur))
            if text:
                self.blocks.append(text)
        self._cur = None

    def handle_starttag(self, tag, attrs):
        if tag in BLOCK_TAGS:
            self._flush()
            self._cur = []
        elif tag == "br" and self._cur is not None:
            self._cur.append(" ")

    def handle_startendtag(self, tag, attrs):
        self.handle_starttag(tag, attrs)

    def handle_endtag(self, tag):
        if tag in BLOCK_TAGS:
            self._flush()

    def handle_data(self, data):
        if self._cur is None:
            if data.strip():
                self._cur = []
            else:
                return
        self._cur.append(data)

    def close(self):
        super().close()
        self._flush()


def html_to_blocks(markup: str) -> list[str]:
    parser = _Blocks()
    parser.feed(markup or "")
    parser.close()
    return parser.blocks


def split_sources(blocks: list[str]):
    """Return (body_blocks, source_blocks). The LAST block that is just 'Sources' (or similar) is the marker."""
    marker = None
    for i, text in enumerate(blocks):
        if text.strip(" :").lower() in SOURCE_MARKERS:
            marker = i
    if marker is None:
        return list(blocks), []
    return list(blocks[:marker]), list(blocks[marker + 1:])


# ---------------------------------------------------------------- feed

def parse_feed(feed_path) -> list[dict]:
    """Read published articles from feed.xml, applying the same eligibility rules as build_published.py."""
    feed_path = pathlib.Path(feed_path)
    if not feed_path.exists():
        raise LedgerError(f"Feed not found: {feed_path}")
    try:
        channel = ET.parse(feed_path).getroot().find("channel")
    except ET.ParseError as exc:
        raise LedgerError(f"Feed is not valid XML: {exc}") from exc
    if channel is None:
        raise LedgerError("Feed has no channel")
    articles, seen = [], set()
    for item in channel.findall("item"):
        title = (item.findtext("title") or "").strip()
        body = (item.findtext(CONTENT_NS + "encoded") or "").strip()
        if not title or not body or body.lower() == "research in development":
            continue
        slug = slugify(title)
        if not slug:
            continue
        if slug in seen:
            raise LedgerError(f"Duplicate published article slug: {slug}")
        seen.add(slug)
        raw_date = (item.findtext("pubDate") or "").strip()
        date_iso = ""
        if raw_date:
            try:
                date_iso = email.utils.parsedate_to_datetime(raw_date).date().isoformat()
            except (TypeError, ValueError):
                date_iso = ""
        articles.append({
            "guid": (item.findtext("guid") or "").strip(),
            "slug": slug,
            "title": title,
            "deck": (item.findtext("description") or "").strip() or title,
            "category": (item.findtext("category") or "").strip() or "Research",
            "publishedAt": date_iso,
            "body_html": body,
        })
    return articles


def snapshot_from_article(article: dict) -> dict:
    blocks = html_to_blocks(article["body_html"])
    body, sources = split_sources(blocks)
    return {
        "title": normalise(article["title"]),
        "deck": normalise(article["deck"]),
        "category": normalise(article["category"]),
        "body": body,
        "sources": sources,
    }


def canonical(snapshot: dict) -> str:
    keys = {k: snapshot[k] for k in ("title", "deck", "category", "body", "sources")}
    keys["v"] = HASH_VERSION
    return json.dumps(keys, ensure_ascii=False, sort_keys=True, separators=(",", ":"))


def content_hash(snapshot: dict) -> str:
    return hashlib.sha256(canonical(snapshot).encode("utf-8")).hexdigest()


def word_count(snapshot: dict) -> int:
    return sum(len(t.split()) for t in snapshot["body"])


def diff_stats(old: dict, new: dict) -> dict:
    """Paragraph-level facts about a change. Describes WHAT differs, never WHY."""
    def side(key):
        a, b = old[key], new[key]
        sm = difflib.SequenceMatcher(a=a, b=b, autojunk=False)
        added = removed = changed = 0
        for tag, i1, i2, j1, j2 in sm.get_opcodes():
            if tag == "insert":
                added += j2 - j1
            elif tag == "delete":
                removed += i2 - i1
            elif tag == "replace":
                n_old, n_new = i2 - i1, j2 - j1
                common = min(n_old, n_new)
                changed += common
                added += max(0, n_new - common)
                removed += max(0, n_old - common)
        return {"added": added, "removed": removed, "changed": changed}
    return {
        "body": side("body"),
        "sources": side("sources"),
        "titleChanged": old["title"] != new["title"],
        "deckChanged": old["deck"] != new["deck"],
        "categoryChanged": old["category"] != new["category"],
        "wordsBefore": word_count(old),
        "wordsAfter": word_count(new),
    }


# ---------------------------------------------------------------- source-list parsing

DOI_RE = re.compile(r"\b(10\.\d{4,9}/[^\s\"”’)>\]]+)")
ARXIV_RE = re.compile(r"arXiv:\s*(\d{4}\.\d{4,5})", re.I)
URL_RE = re.compile(r"https?://[^\s\"”’)>\]]+")
LABEL_RE = re.compile(r"^\[(\d+)\]\s*")


def _clean_tail(value: str) -> str:
    return value.rstrip(".,;:")


def parse_source_entries(source_blocks: list[str]) -> list[dict]:
    """One entry per block (matches the Evidence Explorer's `refs` index). Facts only: no judgement."""
    entries, last_label = [], None
    for index, raw in enumerate(source_blocks):
        m = LABEL_RE.match(raw)
        inherited = False
        if m:
            last_label, text = f"[{m.group(1)}]", raw[m.end():]
        else:
            text = raw
            inherited = last_label is not None
        doi = DOI_RE.search(text)
        arxiv = ARXIV_RE.search(text)
        url = URL_RE.search(text)
        title = re.search(r"[“\"]([^”\"]+)[”\"]", text)
        year = re.search(r"\((\d{4})\)", text)
        entries.append({
            "index": index,
            "label": last_label if (m or inherited) else None,
            "labelInherited": inherited,
            "raw": raw,
            "doi": _clean_tail(doi.group(1)) if doi else None,
            "arxiv": arxiv.group(1) if arxiv else None,
            "url": _clean_tail(url.group(0)) if url else None,
            "title": title.group(1).strip().rstrip(".,") if title else None,
            "year": int(year.group(1)) if year else None,
        })
    return entries


# ---------------------------------------------------------------- id registry

ID_PREFIX = {"publication": "PUB", "source": "SRC", "claim": "CLM", "review": "RVW",
             "revision": "RVN", "correction": "COR", "event": "EVT"}


def load_registry(data=None):
    return read_json(pathlib.Path(data or DATA) / "id-registry.json", default={"schema": SCHEMA, "note": "Every Ledger id ever issued. Ids are never reused, even if a record is later withdrawn.", "issued": {k: [] for k in ID_PREFIX}})


def next_id(registry: dict, kind: str) -> str:
    issued = registry["issued"].setdefault(kind, [])
    prefix = ID_PREFIX[kind]
    top = 0
    for ident in issued:
        m = re.fullmatch(prefix + r"-(\d+)", ident)
        if m:
            top = max(top, int(m.group(1)))
    ident = f"{prefix}-{top + 1:03d}"
    issued.append(ident)
    return ident


def save_registry(registry: dict, data=None) -> bool:
    for kind in registry["issued"]:
        registry["issued"][kind] = sorted(set(registry["issued"][kind]))
    return write_json(pathlib.Path(data or DATA) / "id-registry.json", registry)
