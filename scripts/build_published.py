#!/usr/bin/env python3
"""Create indexable static pages from the completed public-archive RSS articles.

Uses only feed.xml, which is generated from the Architect public articles API.
Keeps the separate 24 research-in-development placeholders untouched.
"""
from __future__ import annotations

import datetime as dt
import email.utils
import html
import json
import pathlib
import re
import xml.etree.ElementTree as ET

ROOT = pathlib.Path(__file__).resolve().parents[1]
SITE = "https://amarisct.github.io/Artificially-Intelligent/"
FEED = ROOT / "feed.xml"
OUTPUT = ROOT / "research" / "published"
CONTENT = "{http://purl.org/rss/1.0/modules/content/}"
CSS = """
:root{--bg:#090c0b;--ink:#f2f0e9;--muted:#a4aca5;--line:rgba(255,255,255,.16);--mint:#b9ffde}
*{box-sizing:border-box}body{margin:0;background:var(--bg);color:var(--ink);font:16px/1.65 Inter,system-ui,-apple-system,sans-serif}
a{color:inherit}a:hover{color:var(--mint)}.page{width:min(1100px,100%);padding:0 26px;margin:auto}
header{border-bottom:1px solid var(--line)}.top{padding:22px 0;display:flex;justify-content:space-between;gap:18px;align-items:center}
.brand{text-transform:uppercase;font-size:.83rem;font-weight:750;letter-spacing:.07em;text-decoration:none}
.brand b{color:var(--mint)}nav{display:flex;gap:20px;flex-wrap:wrap}nav a{text-decoration:none;text-transform:uppercase;font-size:.69rem;letter-spacing:.12em}
main{padding-top:70px!important;padding-bottom:100px!important;min-height:75vh}
.eyebrow{color:var(--mint);letter-spacing:.2em;text-transform:uppercase;font-size:.73rem}
h1{font:400 clamp(2.6rem,7vw,6rem)/1.05 Georgia,serif;letter-spacing:-.045em;margin:22px 0}
.deck{max-width:800px;color:#bbc4bc;font:1.24rem/1.7 Georgia,serif}
.meta{font-size:.75rem;letter-spacing:.12em;text-transform:uppercase;color:var(--muted);margin:25px 0 45px}
.article-body{max-width:790px;border-top:1px solid var(--line);padding-top:35px;color:#e0e1d8;font:1.18rem/1.85 Georgia,serif}
.article-body p{margin:0 0 1.5em;overflow-wrap:anywhere}.article-body a{color:var(--mint)}
.cards{display:grid;gap:16px;margin-top:45px}.card{display:block;padding:26px 30px;border:1px solid var(--line);text-decoration:none}
.card:hover{border-color:var(--mint);background:#b9ffde0a}.card h2{font:400 clamp(1.6rem,4vw,2.4rem) Georgia,serif;margin:10px 0}
.card p{color:var(--muted);max-width:790px}.links{margin-top:65px;padding-top:24px;border-top:1px solid var(--line)}
footer{border-top:1px solid var(--line);font-size:.72rem;letter-spacing:.13em;text-transform:uppercase;color:var(--muted)}
footer .page{padding-top:23px;padding-bottom:23px}
@media(max-width:600px){.page{padding-left:18px;padding-right:18px}.top{align-items:flex-start;flex-direction:column}
main{padding-top:42px!important;padding-bottom:65px!important}nav{gap:13px}.article-body{font-size:1.05rem}.card{padding:22px}}
"""

def esc(value: str) -> str:
    return html.escape(str(value or ""), quote=True)

def slugify(title: str) -> str:
    return re.sub(r"[^a-z0-9]+", "-", title.lower()).strip("-")

def webpage(*, title: str, description: str, url: str, root_rel: str, content: str, schema=None) -> str:
    script = ""
    if schema is not None:
        serialized = json.dumps(schema, ensure_ascii=False).replace("<", chr(92) + "u003c")
        script = '<script type="application/ld+json">' + serialized + '</script>'
    return f"""<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<meta name="robots" content="index,follow">
<meta name="theme-color" content="#090c0b">
<title>{esc(title)} | Artificially Intelligent</title>
<meta name="description" content="{esc(description[:158])}">
<link rel="canonical" href="{esc(url)}">
<meta property="og:type" content="article">
<meta property="og:site_name" content="Artificially Intelligent">
<meta property="og:title" content="{esc(title)}">
<meta property="og:description" content="{esc(description[:158])}">
<meta property="og:url" content="{esc(url)}">
<meta name="twitter:card" content="summary">
{script}
<style>{CSS}</style>
</head>
<body>
<header><div class="page top">
<a class="brand" href="{root_rel}">Artificially <b>Intelligent</b></a>
<nav aria-label="Main navigation">
<a href="{root_rel}#stream">Data Stream</a>
<a href="{root_rel}research/published/">Published research</a>
<a href="{root_rel}intelligence-index/">Intelligence Index</a>
<a href="{root_rel}research-atlas/">Research Atlas</a>
</nav>
</div></header>
{content}
<footer><div class="page">Product of Amaris.Studio / Human × Machine Learning</div></footer>
</body></html>
"""

TOPIC_PATTERNS = {
    "ai": r"\b(?:artificial intelligence|machine learning|machine intelligence|language models?|ai systems?|algorithms?|neural networks?)\b",
    "consciousness": r"\b(?:consciousness|conscious|awareness|subjective experience|sentien\w*)\b",
    "memory": r"\b(?:memor(?:y|ies)|remember\w*|forget\w*|recall|retention)\b",
    "identity": r"\b(?:identit(?:y|ies)|selfhood|personhood|digital self|sense of self)\b",
    "language": r"\b(?:language|linguistic\w*|communicat\w*|speech|words)\b",
    "cognition": r"\b(?:cognition|cognitive|reasoning|perception|attention|thought)\b",
    "culture": r"\b(?:cultur\w*|societ\w*|social media|online platforms?|digital life)\b",
    "archives": r"\b(?:archiv\w*|records?|documents?|digital traces|historical sources?)\b",
}
# These two mappings are reviewed editorial associations, not quantitative citation claims.
EDITORIAL_TOPICS = {
    "2063e8d4-c3e5-4458-a5dc-24c5844bc90b": ["memory", "archives", "culture", "identity", "ai"],
    "5affe752-0d79-40e0-b8b0-c2410aa11a1b": ["consciousness", "ai", "cognition", "language", "identity"],
}

def infer_topics(identifier: str, title: str, excerpt: str, article_html: str):
    if identifier in EDITORIAL_TOPICS:
        return EDITORIAL_TOPICS[identifier], "editorial"
    # Keyword-based discovery for newly published articles; not a claim of
    # peer-reviewed conceptual relationships. Favor title and excerpt over body.
    body = re.sub(r"<[^>]+>", " ", html.unescape(article_html))
    scored = []
    for topic, pattern in TOPIC_PATTERNS.items():
        title_hits = len(re.findall(pattern, title, re.IGNORECASE))
        excerpt_hits = len(re.findall(pattern, excerpt, re.IGNORECASE))
        body_hits = len(re.findall(pattern, body, re.IGNORECASE))
        weight = 5 * title_hits + 3 * excerpt_hits + min(body_hits, 6)
        if title_hits or excerpt_hits or body_hits >= 3:
            scored.append((weight, topic))
    scored.sort(key=lambda item: (-item[0], item[1]))
    return [topic for _, topic in scored[:5]], "keyword"

def make():
    tree = ET.parse(FEED)
    channel = tree.getroot().find("channel")
    if channel is None:
        raise ValueError("No RSS channel found. Existing published pages preserved.")
    articles = []
    seen = set()
    for item in channel.findall("item"):
        def field(key):
            return (item.findtext(key) or "").strip()
        title = field("title")
        body = (item.findtext(CONTENT + "encoded") or "").strip()
        if not title or not body or body.lower() == "research in development":
            continue
        slug = slugify(title)
        if not slug:
            continue
        if slug in seen:
            raise ValueError(f"Duplicate published article slug: {slug}")
        seen.add(slug)
        raw_date = field("pubDate")
        date_iso = ""
        date_label = ""
        if raw_date:
            timestamp = email.utils.parsedate_to_datetime(raw_date)
            date_iso = timestamp.date().isoformat()
            date_label = timestamp.strftime("%B %d, %Y").replace(" 0", " ")
        articles.append({
            "title": title, "description": field("description") or title,
            "id": field("guid"), "body": body, "date": date_iso,
            "date_label": date_label, "category": field("category") or "Research",
            "slug": slug, "url": SITE + "research/published/" + slug + "/"
        })
    if not articles:
        raise ValueError("No complete published articles. Preserving existing pages and sitemap.")
    OUTPUT.mkdir(parents=True, exist_ok=True)
    for article in articles:
        others = [x for x in articles if x["slug"] != article["slug"]]
        related = "".join(f'<p><a href="../{esc(x["slug"])}/">{esc(x["title"])} ↗</a></p>' for x in others[:4])
        schema = {
            "@context": "https://schema.org", "@type": "Article",
            "headline": article["title"], "description": article["description"],
            "url": article["url"], "mainEntityOfPage": article["url"],
            "publisher": {"@type": "Organization", "name": "Amaris.Studio"},
            "inLanguage": "en"
        }
        if article["date"]:
            schema["datePublished"] = article["date"]
        page = '<main class="page"><article>'
        page += f'<p class="eyebrow">Published Research / {esc(article["category"])}</p>'
        page += f'<h1>{esc(article["title"])}</h1>'
        page += f'<p class="deck">{esc(article["description"])}</p>'
        if article["date_label"]:
            page += f'<p class="meta"><time datetime="{article["date"]}">{esc(article["date_label"])}</time></p>'
        page += f'<div class="article-body">{article["body"]}</div></article>'
        page += '<section class="links" aria-label="Related articles"><p class="eyebrow">Continue exploring</p>'
        page += related or '<p><a href="../">Browse published research ↗</a></p>'
        page += '<p><a href="../../../research-atlas/">Explore the Research Atlas ↗</a></p>'
        page += '</section></main>'
        file = OUTPUT / article["slug"] / "index.html"
        file.parent.mkdir(parents=True, exist_ok=True)
        file.write_text(webpage(title=article["title"], description=article["description"],
                                url=article["url"], root_rel="../../../", content=page, schema=schema), encoding="utf-8")
    cards = ""
    for article in articles:
        cards += f'<a class="card" href="{esc(article["slug"])}/">'
        cards += f'<span class="eyebrow">{esc(article["category"])}</span>'
        cards += f'<h2>{esc(article["title"])}</h2><p>{esc(article["description"])}</p></a>'
    listing = ('<main class="page"><p class="eyebrow">Artificially Intelligent / Archive</p>'
               '<h1>Published Research</h1>'
               '<p class="deck">Independent research at the intersection of artificial intelligence, '
               'human consciousness, memory, identity, and digital culture. '
               'Explore our complete published articles below.</p>'
               f'<section class="cards" aria-label="Published research">{cards}</section></main>')
    (OUTPUT / "index.html").write_text(
        webpage(title="Published Research", description="Read published research and essays on consciousness, artificial intelligence, memory, digital identity, and culture.",
                url=SITE + "research/published/", root_rel="../../", content=listing),
        encoding="utf-8")
    manifest_items = []
    for x in articles:
        topic_ids, source = infer_topics(x["id"], x["title"], x["description"], x["body"])
        plain_text = re.sub(r"<[^>]+>", " ", html.unescape(x["body"]))
        words = len(plain_text.split())
        manifest_items.append({
            "id": x["id"], "title": x["title"], "url": x["url"],
            "excerpt": x["description"],
            "category": x["category"],
            "publishedAt": x["date"] or None,
            "readingMinutes": max(1, round(words / 220)),
            "topics": topic_ids,
            "topicSource": source
        })
    manifest = {"schemaVersion": 2, "articles": manifest_items}
    (OUTPUT / "manifest.json").write_text(json.dumps(manifest, indent=2, ensure_ascii=False) + "\n", encoding="utf-8")
    urls = [SITE, SITE + "intelligence-index/", SITE + "interactives/consciousness-map.html",
            SITE + "research/published/", SITE + "research-atlas/", SITE + "theory-chamber/"] + [x["url"] for x in articles]
    ns = "http://www.sitemaps.org/schemas/sitemap/0.9"
    ET.register_namespace("", ns)
    urlset = ET.Element("{" + ns + "}urlset")
    for url in urls:
        entry = ET.SubElement(urlset, "{" + ns + "}url")
        ET.SubElement(entry, "{" + ns + "}loc").text = url
    ET.indent(urlset, space="  ")
    (ROOT / "sitemap.xml").write_bytes(
        b'<?xml version="1.0" encoding="UTF-8"?>\n' + ET.tostring(urlset, encoding="utf-8"))
    (ROOT / "sitemap.txt").write_text("\n".join(urls) + "\n", encoding="utf-8")
    print(f"Generated {len(articles)} published research pages and {len(urls)} sitemap URLs.")

if __name__ == "__main__":
    make()
