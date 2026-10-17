"""Shared helpers for the Listening Room production pipeline.

Everything here works from files that are already public in the repository:
research/published/manifest.json and research/published/<slug>/index.html.
Nothing in this module calls a network service or a paid API.
"""
from __future__ import annotations

import hashlib
import html
import json
import pathlib
import re
import unicodedata

ROOT = pathlib.Path(__file__).resolve().parents[2]
LR_DIR = ROOT / "listening-room"
DATA_DIR = LR_DIR / "data"
SRC_DIR = pathlib.Path(__file__).resolve().parent
SITE = "https://amarisct.github.io/Artificially-Intelligent/"

CITE_RE = re.compile(r"\s*\[\d+(?:\s*[,–-]\s*\d+)*\]")
SOURCES_MARKER = "Sources"


def load_json(path, default=None):
    path = pathlib.Path(path)
    if not path.exists():
        return default
    return json.loads(path.read_text(encoding="utf-8"))


def dump_json(path, obj, indent=1):
    path = pathlib.Path(path)
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(obj, ensure_ascii=False, indent=indent) + "\n", encoding="utf-8")


def sha256_text(text: str) -> str:
    return "sha256:" + hashlib.sha256(unicodedata.normalize("NFC", text).encode("utf-8")).hexdigest()


def sha256_file(path) -> str:
    h = hashlib.sha256()
    with open(path, "rb") as f:
        for chunk in iter(lambda: f.read(1 << 20), b""):
            h.update(chunk)
    return "sha256:" + h.hexdigest()


def manifest():
    return load_json(ROOT / "research" / "published" / "manifest.json", {"articles": []})


def article_slug(article: dict) -> str:
    url = article.get("url", "").rstrip("/")
    return url.rsplit("/", 1)[-1]


def read_article_page(slug: str) -> dict | None:
    """Return the public article text as published, or None if the page is missing.

    paragraphs  : every <p> inside .article-body, HTML removed, entities decoded
    body        : paragraphs before the 'Sources' marker (the essay itself)
    sources     : paragraphs after the marker (the citation list)
    """
    page = ROOT / "research" / "published" / slug / "index.html"
    if not page.exists():
        return None
    s = page.read_text(encoding="utf-8")
    m = re.search(r'<div class="article-body">(.*?)</div>\s*(?:<div class="links"|</article>)', s, re.S)
    if not m:
        return None
    paras = [html.unescape(re.sub(r"<[^>]+>", "", p)).strip() for p in re.findall(r"<p>(.*?)</p>", m.group(1), re.S)]
    paras = [unicodedata.normalize("NFC", p) for p in paras if p]
    if SOURCES_MARKER in paras:
        k = paras.index(SOURCES_MARKER)
        body, sources = paras[:k], paras[k + 1:]
    else:
        body, sources = paras, []
    return {
        "slug": slug,
        "paragraphs": paras,
        "body": body,
        "sources": sources,
        "bodyHash": sha256_text("\n".join(body)),
        "sourcesHash": sha256_text("\n".join(sources)),
        "bodyWords": sum(len(p.split()) for p in body),
    }


_SPLIT = re.compile(r"(?<=[.!?])(?<![A-Z]\.)(?<!\bet al\.)(?<!\bvs\.)(?<!\be\.g\.)(?<!\bi\.e\.)([\"”’)]*)\s+(?=[\"“‘(]?[A-Z0-9])")


def split_sentences(text: str) -> list[str]:
    """Split on sentence-ending punctuation followed by a capital letter.

    Quotes that close a question and are followed by lower-case text
    ('...field?" there is no...') do not split, which is what we want.
    """
    out, last = [], 0
    for m in _SPLIT.finditer(text):
        out.append(text[last:m.start()] + m.group(1))
        last = m.end()
    out.append(text[last:])
    return [s.strip() for s in out if s.strip()]


def strip_citations(text: str) -> tuple[str, list[str]]:
    marks = [m.group(0).strip() for m in CITE_RE.finditer(text)]
    return CITE_RE.sub("", text).strip(), marks


MONTHS = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"]
ORD = {1: "first", 2: "second", 3: "third", 4: "fourth", 5: "fifth", 6: "sixth", 7: "seventh", 8: "eighth", 9: "ninth", 10: "tenth",
       11: "eleventh", 12: "twelfth", 13: "thirteenth", 14: "fourteenth", 15: "fifteenth", 16: "sixteenth", 17: "seventeenth",
       18: "eighteenth", 19: "nineteenth", 20: "twentieth", 21: "twenty-first", 22: "twenty-second", 23: "twenty-third",
       24: "twenty-fourth", 25: "twenty-fifth", 26: "twenty-sixth", 27: "twenty-seventh", 28: "twenty-eighth",
       29: "twenty-ninth", 30: "thirtieth", 31: "thirty-first"}


def long_date(iso: str) -> str:
    y, m, d = (int(x) for x in iso.split("-"))
    return f"{MONTHS[m - 1]} {d}, {y}"


def spoken_date(iso: str) -> str:
    y, m, d = (int(x) for x in iso.split("-"))
    units = ["", "one", "two", "three", "four", "five", "six", "seven", "eight", "nine"]
    if 2020 <= y <= 2029:
        year = "twenty twenty" + ("-" + units[y - 2020] if y > 2020 else "")
    else:
        year = str(y)
    return f"{MONTHS[m - 1]} {ORD[d]}, {year}"
