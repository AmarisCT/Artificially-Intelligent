#!/usr/bin/env python3
"""Build a Substack-importable RSS 2.0 feed from the public article API."""
import datetime as dt
import email.utils
import html
import json
import os
import pathlib
import re
import sys
import urllib.parse
import urllib.request
import xml.etree.ElementTree as ET

API = "https://artificiallyintelligent.artificiallyint-co.chatgpt.site/api/public/articles"
SITE = "https://amarisct.github.io/Artificially-Intelligent/"
OUT = pathlib.Path("feed.xml")
CONTENT = "http://purl.org/rss/1.0/modules/content/"
ET.register_namespace("content", CONTENT)

def clean_html_text(value):
    # Public archive currently stores text paragraphs, not HTML.
    pieces = re.split(r"\n\s*\n", str(value or "").strip())
    return "".join("<p>" + html.escape(x.strip()).replace("\n", "<br />") + "</p>" for x in pieces if x.strip())

def date(value):
    try:
        parsed = dt.datetime.fromisoformat(value.replace("Z", "+00:00"))
        return email.utils.format_datetime(parsed.astimezone(dt.timezone.utc))
    except (TypeError, ValueError, AttributeError):
        return None

req = urllib.request.Request(API, headers={"Accept": "application/json", "User-Agent": "ArtificiallyIntelligent-RSS/1.0"})
with urllib.request.urlopen(req, timeout=35) as response:
    data = json.load(response)
articles = data.get("articles", []) if isinstance(data, dict) else data
if not isinstance(articles, list) or not articles:
    sys.exit("No live articles returned; preserving the existing feed instead of publishing an empty one.")

rss = ET.Element("rss", {"version": "2.0"})
channel = ET.SubElement(rss, "channel")
for tag, text in [
    ("title", "Artificially Intelligent — Human × Machine Learning"),
    ("link", SITE),
    ("description", "An independent research archive exploring artificial intelligence, identity, consciousness, memory, and digital culture."),
    ("language", "en-us"),
    ("lastBuildDate", email.utils.format_datetime(dt.datetime.now(dt.timezone.utc))),
]:
    ET.SubElement(channel, tag).text = text
added = 0
for a in articles:
    if not isinstance(a, dict) or not a.get("title"):
        continue
    identifier = str(a.get("id") or a.get("streamId") or a["title"])
    link = SITE + "?article=" + urllib.parse.quote(identifier, safe="")
    item = ET.SubElement(channel, "item")
    ET.SubElement(item, "title").text = str(a["title"])
    ET.SubElement(item, "link").text = link
    ET.SubElement(item, "guid", {"isPermaLink": "false"}).text = identifier
    ET.SubElement(item, "description").text = str(a.get("excerpt") or a.get("subtitle") or "")
    body = a.get("body") or a.get("content") or ""
    full = clean_html_text(body)
    if not full:
        # Do not pretend a preview is a complete importable article.
        print("Skipping article without full body:", a["title"], file=sys.stderr)
        channel.remove(item)
        continue
    ET.SubElement(item, "{%s}encoded" % CONTENT).text = full
    if a.get("category"):
        ET.SubElement(item, "category").text = str(a["category"])
    pub_date = date(a.get("publishedAt") or a.get("published_at"))
    if pub_date:
        ET.SubElement(item, "pubDate").text = pub_date
    added += 1
if not added:
    sys.exit("No complete live articles; preserving any existing feed.")
ET.indent(rss, space="  ")
OUT.write_bytes(b'<?xml version="1.0" encoding="UTF-8"?>\n' + ET.tostring(rss, encoding="utf-8"))
print("Generated feed.xml with", added, "full articles")
