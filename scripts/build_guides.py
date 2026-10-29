#!/usr/bin/env python3
"""Build the practical Guides (guides/...).

Content lives in this file so the monthly re-check is: update the facts and
CHECKED date below, run `python3 scripts/build_guides.py`, commit.

Every fact carries a label, following the site's rule of keeping evidence,
interpretation and speculation visibly apart:
  doc  = From the source    (the company's own help page, or the original study)
  rep  = Reported           (journalism or a third-party guide)
  our  = Our reading        (interpretation or advice from this site)
  spec = Speculation
"""
import html, json, pathlib

ROOT = pathlib.Path(__file__).resolve().parent.parent
SITE = "https://amarisct.github.io/Artificially-Intelligent/"
CHECKED = "2026-10-29"
CHECKED_TXT = "October 29, 2026"
LINKEDIN = "https://www.linkedin.com/in/jojomojojo222/"
STUDIO = "https://amarisct.github.io/Amaris/"
LABELS = {"doc": "From the source", "rep": "Reported", "our": "Our reading", "spec": "Speculation"}
esc = html.escape


def lab(k):
    return f'<span class="lab {k}">{LABELS[k]}</span>'


def cite(ids, anchor):
    return "".join(f'<sup><a href="#{anchor}-{i}" aria-label="Source {i}">[{i}]</a></sup>' for i in ids)


def path(*steps):
    return '<span class="path">' + " → ".join(esc(s) for s in steps) + "</span>"


KEY = (f'<div class="key" aria-label="How to read the labels">{lab("doc")} the company\'s own page, or the study itself'
       f'{lab("rep")} journalism or a third-party guide{lab("our")} our interpretation or advice{lab("spec")} open questions</div>')


def page(*, title, desc, rel, canon, body, current, ld):
    ldj = json.dumps(ld, ensure_ascii=False).replace("</", "<\\/")
    nav = [("Guides", f"{rel}guides/", "guides"), ("Published research", f"{rel}research/published/", "pub"), ("Main site", rel, "main")]
    navh = "".join(f'<a href="{h}"' + (' aria-current="page"' if k == current else "") + f">{t}</a>" for t, h, k in nav)
    return f"""<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<link rel="icon" href="{rel}favicon.ico" sizes="32x32">
<link rel="icon" href="{rel}favicon.svg" type="image/svg+xml">
<link rel="apple-touch-icon" href="{rel}apple-touch-icon.png">
<link rel="manifest" href="{rel}site.webmanifest">
<meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover">
<meta name="robots" content="index,follow">
<meta name="theme-color" content="#0a0d0c">
<title>{esc(title)} | Artificially Intelligent</title>
<meta name="description" content="{esc(desc)}">
<link rel="canonical" href="{SITE}{canon}">
<meta property="og:type" content="article"><meta property="og:site_name" content="Artificially Intelligent">
<meta property="og:title" content="{esc(title)}"><meta property="og:description" content="{esc(desc)}"><meta property="og:url" content="{SITE}{canon}">
<meta name="twitter:card" content="summary">
<script type="application/ld+json">{ldj}</script>
<link rel="preconnect" href="https://fonts.googleapis.com"><link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Hanken+Grotesk:wght@400;500;600&family=Newsreader:ital,opsz,wght@0,6..72,300;0,6..72,400;1,6..72,300;1,6..72,400&display=swap">
<link rel="stylesheet" href="{rel}guides/styles.css">
</head>
<body>
<a class="skip" href="#main">Skip to content</a>
<header class="hdr"><div class="wrap"><a class="brand" href="{rel}">Artificially <i>Intelligent</i></a><nav class="nav" aria-label="Site">{navh}</nav></div></header>
<main id="main" tabindex="-1"><div class="wrap">
{body}
</div></main>
<footer class="ftr"><div class="wrap">
<p>Spotted something out of date? Settings change often. <a href="{LINKEDIN}" rel="noopener noreferrer">Tell us on LinkedIn</a> and we'll re-check it.</p>
<p>This guide explains settings and research. It is not legal advice.</p>
<p>An <a class="studio" href="{STUDIO}">amaris ct</a> project / Human × Machine Learning</p>
</div></footer>
</body>
</html>
"""


def article_ld(title, desc, canon, published):
    org = {"@type": "Organization", "name": "amaris ct", "alternateName": "amaris creative tech", "url": STUDIO}
    return {"@context": "https://schema.org", "@type": "Article", "headline": title, "description": desc, "url": SITE + canon,
            "datePublished": published, "dateModified": CHECKED, "inLanguage": "en", "author": org, "publisher": org,
            "isPartOf": {"@type": "WebSite", "name": "Artificially Intelligent", "url": SITE}}


def sources_html(srcs, anchor):
    return '<ol class="sources">' + "".join(
        f'<li id="{anchor}-{i}">{s[0]} <a href="{esc(s[1])}" rel="noopener noreferrer">{esc(s[1])}</a></li>' for i, s in enumerate(srcs, 1)) + "</ol>"


# ---------------------------------------------------------------------------
# Guide 1: What AI assistants remember about you
# ---------------------------------------------------------------------------
MEM_SRC = [
    ("OpenAI Help Center, “Temporary Chat” and data controls.", "https://help.openai.com/en/articles/7730893-temporary-chat"),
    ("OpenAI Help Center, “What is memory?”", "https://help.openai.com/en/articles/8983136-what-is-memory"),
    ("AI Toolbox, “How to Manage ChatGPT Memory: View, Edit, Delete (2026),” updated September 27, 2026; checked by its authors against OpenAI's Help Center.", "https://www.ai-toolbox.co/chatgpt-management-and-productivity/how-to-manage-chatgpt-memory-2026"),
    ("Thurrott, “OpenAI is improving how ChatGPT's memory works,” June 5, 2026.", "https://www.thurrott.com/a-i/337052/openai-is-improving-how-chatgpts-memory-works"),
    ("Engadget, “OpenAI no longer has to preserve all of its ChatGPT data, with some exceptions,” October 11, 2025.", "https://engadget.com/ai/openai-no-longer-has-to-preserve-all-of-its-chatgpt-data-with-some-exceptions-192422093.html"),
    ("Anthropic Help Center, “Use Claude's chat search and memory to build on previous context.”", "https://support.claude.com/en/articles/11817273-use-claude-s-chat-search-and-memory-to-build-on-previous-context"),
    ("Anthropic, “Updates to our consumer terms,” August 28, 2025.", "https://www.anthropic.com/news/updates-to-our-consumer-terms"),
    ("Google, Gemini Apps Privacy Hub, last updated October 23, 2026.", "https://support.google.com/gemini/answer/13594961?hl=en"),
    ("Microsoft Support, “Microsoft Copilot for individuals: your privacy controls and choices,” for the Copilot app released August 18, 2026.", "https://support.microsoft.com/en-us/privacy/microsoft-copilot/privacy-controls"),
    ("Microsoft Support, “Privacy FAQ for Microsoft Copilot.”", "https://support.microsoft.com/en-us/topic/privacy-faq-for-microsoft-copilot-27b3a435-8dc9-4b55-9a4b-58eeb9647a7f"),
    ("Microsoft Support, “Microsoft Copilot privacy controls” (earlier Copilot app).", "https://support.microsoft.com/en-us/microsoft-copilot/microsoft-copilot-privacy-controls"),
    ("Meta Help Center, “Delete remembered details about you on Meta AI.”", "https://www.meta.com/help/artificial-intelligence/1152856459900216/"),
    ("Tobias Holm, “How to Turn Off Meta AI in 2026 (Every App and Device).”", "https://www.tobiasholm.com/tech/how-to-turn-off-meta-ai"),
    ("Reuters (via TradingView), “Meta to use AI chats to personalize content and ads from December,” October 2025.", "https://de.tradingview.com/news/reuters.com,2025:newsml_L6N3VH1DX:0-meta-to-use-ai-chats-to-personalize-content-and-ads-from-december"),
    ("xAI, Consumer FAQs, last updated May 12, 2025.", "https://x.ai/legal/faq"),
    ("The Decoder, “xAI adds memory feature to Grok chatbot for personalized responses,” April 17, 2025.", "https://the-decoder.com/xai-adds-memory-feature-to-grok-chatbot-for-personalized-responses/"),
]

# Each assistant: id, name, maker, glance (see, private chat, training), and fact rows (label, [(kind, html, [source ids])]).
ASSISTANTS = [
    dict(id="chatgpt", name="ChatGPT", maker="OpenAI",
         glance=("Settings → Personalization → Memory", "Temporary Chat, deleted after 30 days", "Data Controls → “Improve the model for everyone”"),
         rows=[
             ("What it remembers", [("rep", "Details and preferences you share, plus what it picks up from your past chats. Since June 2026 a system OpenAI calls “dreaming” updates this memory in the background and shows it as a memory summary you can edit. It reached Plus and Pro users in the US first.", [4])]),
             ("See it", [("rep", f"{path('Settings', 'Personalization', 'Memory')}, where the memory summary lives.", [3, 4]), ("doc", "You can also simply ask ChatGPT what it remembers about you.", [2])]),
             ("Delete it or turn it off", [("rep", "From the memory summary, the menu option “Delete and turn off memory” removes what is stored and switches memory off. It does not delete your past chats. Turning off “Reference chat history” schedules what was learned from past chats for deletion within 30 days.", [3])]),
             ("Chat without memory", [("doc", "Temporary Chat doesn't use or create memories, isn't saved to your history and isn't used for training. It is deleted from OpenAI's systems after 30 days.", [1])]),
             ("Training", [("doc", f"{path('Settings', 'Data Controls', 'Improve the model for everyone')}: switch it off. Your chat history stays; only the training use stops.", [1])]),
             ("What can stay after you delete", [("rep", "OpenAI may keep logs of deleted memories for up to 30 days.", [3]), ("rep", "In 2025 a court order in the New York Times lawsuit made OpenAI keep deleted chats. That ended for new chats from September 26, 2025, except for accounts the Times flagged.", [5])]),
         ]),
    dict(id="claude", name="Claude", maker="Anthropic",
         glance=("Settings → Your Claude → Your memory", "Incognito chat (ghost icon)", "Privacy settings → model training"),
         rows=[
             ("What it remembers", [("doc", "Context from your chats, stored as topics. Memory is on by default on the Free, Pro and Max plans. Sensitive topics aren't saved unless you switch on “Include sensitive topics in memory.” Each project keeps its own memory.", [6])]),
             ("See it", [("doc", f"{path('Settings', 'Your Claude')}, then “Manage” next to Your memory. Open a topic to read it, edit it or delete it. You can also tell Claude what to remember or forget.", [6])]),
             ("Delete it or turn it off", [("doc", "Switch off “Memory from chats” in the same place, then choose “Pause memory” (keeps what's stored but stops using it) or “Reset memory” (permanently deletes all memories, including project memories).", [6])]),
             ("Chat without memory", [("doc", "Incognito chat, the ghost icon at the top right, isn't saved to your history or memory. To skip memory for one chat only, turn off “Memory” under “+” before your first message.", [6])]),
             ("Training", [("doc", "Choose in your Privacy settings whether your chats can be used to train models. If you allow it, Anthropic keeps that data for up to five years; if not, the 30-day period applies. Deleted conversations aren't used for future training.", [7])]),
             ("What can stay after you delete", [("doc", "Deleting a conversation does <b>not</b> remove memories created from it. Delete those memories separately.", [6])]),
         ]),
    dict(id="gemini", name="Gemini", maker="Google",
         glance=("Ask “What do you know about me?” or open the memory summary", "Temporary chat, kept 72 hours", "Turn off “Keep Activity”"),
         rows=[
             ("What it remembers", [("doc", "With Memory on, Gemini can draw on the chats saved in your Gemini Apps Activity, including sensitive things you shared. It also keeps “Instructions for Gemini” (called Saved Info in some places) until you delete them.", [8])]),
             ("See it", [("doc", "Ask “What do you know about me?”, or view and edit the memory summary in Gemini's settings. Your saved chats are listed at myactivity.google.com/product/gemini.", [8])]),
             ("Delete it or turn it off", [("doc", "Delete a chat to stop it shaping Gemini's personalization. Turning off “Keep Activity” stops saving future chats. Saved activity auto-deletes after 18 months by default; you can pick 3 or 36 months, or no auto-delete.", [8])]),
             ("Chat without memory", [("doc", "Temporary chats aren't used to train Google's models or reviewed by people, but they are still kept with your account for 72 hours. The same applies to chats made with Keep Activity off.", [8])]),
             ("Training", [("doc", "With Keep Activity off, future chats aren't used to train Google's models unless you send feedback on a chat.", [8])]),
             ("What can stay after you delete", [("doc", "A sample of chats is read by human reviewers. Reviewed chats are kept for up to three years, disconnected from your account, even if you delete your activity.", [8])]),
         ]),
    dict(id="copilot", name="Copilot", maker="Microsoft",
         glance=("Settings → Personalization → Saved memories", "Not covered in the help pages we checked", "Privacy → training switches"),
         rows=[
             ("What it remembers", [("doc", "Details such as your communication style, favorite topics, goals and recurring tasks. This applies to personal Microsoft accounts, not work or school accounts.", [9])]),
             ("See it", [("doc", f"{path('Settings', 'Personalization')}, then “Manage” next to Saved memories. You can also ask Copilot “What do you know about me?”", [9, 11])]),
             ("Delete it or turn it off", [("doc", "Delete one memory with the trash icon, or choose “Delete all memories.” Turning off the “Saved memories” switch stops new memories but does <b>not</b> delete existing ones.", [9])]),
             ("Chat history", [("doc", "Copilot keeps conversation history for 18 months by default. You can delete single conversations or all of it.", [10])]),
             ("Training", [("doc", "You can opt out of training on your conversations. In the earlier Copilot app the switches are “Training on conversation activity” and “Training on voice conversations” under Privacy. Opting out applies to future conversations.", [10, 11])]),
         ]),
    dict(id="meta", name="Meta AI", maker="Meta · Facebook, Instagram, WhatsApp, Messenger",
         glance=("Meta's “remembered details” help page", "Not covered in the help pages we checked", "No opt-out from ad use outside the EU, UK and South Korea"),
         rows=[
             ("What it remembers", [("doc", "Meta AI can remember details about you from your chats. Meta's help page explains how to delete them.", [12])]),
             ("Delete your chats", [("rep", "In Messenger, Instagram and WhatsApp, type <b>/reset-ai</b> in an AI chat to delete Meta's copy of that conversation, or <b>/reset-all-ais</b> for every AI chat in that app. On WhatsApp, do this before deleting the thread, because deleting the thread only removes your own copy.", [13])]),
             ("In the Meta AI app", [("rep", f"{path('Settings', 'Data & privacy', 'Manage your information')}, then “Delete all chats and media,” which covers the app and meta.ai on the web.", [13])]),
             ("Ads", [("rep", "Since December 16, 2025, Meta uses your conversations with Meta AI to personalize ads and posts on its apps. Meta said there is no opt-out. It doesn't apply in the EU, UK or South Korea, and Meta says chats about religion, sexual orientation, politics, health, or racial or ethnic origin aren't used for ads.", [14])]),
         ]),
    dict(id="grok", name="Grok", maker="xAI",
         glance=("Shown in the chat; your own settings", "Private Chat, deleted within 30 days", "Data Controls → “Improve the model”"),
         rows=[
             ("What it remembers", [("rep", "Grok can remember past conversations to personalize answers. When memory launched in April 2025, xAI said you could see what it remembers, delete single memories in the chat, and turn the feature off in privacy settings. It wasn't offered in the EU or UK at launch.", [16])]),
             ("Check the details yourself", [("doc", "xAI's public FAQ (last updated May 2025) doesn't explain memory, so check your own Grok settings.", [15])]),
             ("Delete your chats", [("doc", f"In the app, {path('Settings', 'Data Controls', 'Delete All Conversations')}. Removal from xAI's systems can take up to 30 days.", [15])]),
             ("Chat without memory", [("doc", "Private Chat, the ghost icon at the top right: it won't appear in your history, it is deleted within 30 days, and it isn't used for training.", [15])]),
             ("Training", [("doc", f"App: {path('Settings', 'Data Controls', 'Improve the model')}. Grok.com: {path('Settings', 'Data', 'Improve the Model')}. Feedback you send can still be used.", [15])]),
         ]),
]


def memory_guide():
    A = "m"
    glance = "".join(
        f'<a class="gcard" href="#{a["id"]}"><h3>{a["name"]}</h3><dl><dt>See what it remembers</dt><dd>{esc(a["glance"][0])}</dd>'
        f'<dt>Chat without memory</dt><dd>{esc(a["glance"][1])}</dd><dt>Training switch</dt><dd>{esc(a["glance"][2])}</dd></dl></a>' for a in ASSISTANTS)
    sections = ""
    for a in ASSISTANTS:
        rows = ""
        for label, items in a["rows"]:
            rows += f'<div class="fact"><dt>{label}</dt><dd>' + "".join(f"<p>{lab(k)}{t}{cite(ids, A)}</p>" for k, t, ids in items) + "</dd></div>"
        sections += (f'<section class="assistant" id="{a["id"]}" aria-labelledby="{a["id"]}-h"><h2 id="{a["id"]}-h">{a["name"]}</h2>'
                     f'<p class="by">{esc(a["maker"])}</p><dl class="facts">{rows}</dl><p class="checked">Last checked {CHECKED_TXT}.</p></section>')
    toc = "".join(f'<a href="#{a["id"]}">{a["name"]}</a>' for a in ASSISTANTS)
    title = "What AI assistants remember about you, and how to see or delete it"
    desc = "A plain guide to the memory in ChatGPT, Claude, Gemini, Copilot, Meta AI and Grok: what each keeps, where to see it, how to delete it, and what stays after you do."
    body = f"""
<header class="head">
<p class="kicker">Guide · Memory &amp; identity</p>
<h1 class="h-l">What AI assistants remember about you, and how to see or delete it</h1>
<p class="lede">Most AI assistants now keep a running memory of the people who use them. Here is what six of them keep, where to find it, how to delete it, and what can stay behind after you do.</p>
<div class="meta"><span><b>Last checked</b> {CHECKED_TXT}</span><span><b>By</b> amaris ct</span><span>Re-checked every month</span></div>
{KEY}
<nav class="toc" aria-label="Jump to an assistant">{toc}</nav>
</header>

<section class="block" aria-labelledby="short-h">
<h2 id="short-h">The short version</h2>
<ul class="short">
<li>{lab("our")}<b>Memory, chat history and training are three different switches.</b> Turning one off rarely turns off the others. Memory is what the assistant knows about you; history is the list of your chats; training is whether your chats help build future models.</li>
<li>{lab("doc")}<b>Memory can be on before you ever touch a setting.</b> Claude's memory, for example, is on by default on its Free, Pro and Max plans.{cite([6], A)}</li>
<li>{lab("doc")}<b>Deleting a chat doesn't always delete what was learned from it.</b> On Claude you have to delete the memory too.{cite([6], A)} On Gemini, deleting the chat is how you stop it shaping answers.{cite([8], A)}</li>
<li>{lab("doc")}<b>“Private” chats are still kept for a while.</b> 30 days for ChatGPT's Temporary Chat{cite([1], A)} and Grok's Private Chat,{cite([15], A)} 72 hours for Gemini's temporary chats.{cite([8], A)}</li>
<li>{lab("doc")}{lab("rep")}<b>Some copies outlive your delete button.</b> Gemini chats read by human reviewers are kept for up to three years,{cite([8], A)} and Meta uses Meta AI chats to personalize ads outside the EU, UK and South Korea.{cite([14], A)}</li>
</ul>
</section>

<section class="block" aria-labelledby="glance-h">
<h2 id="glance-h">At a glance</h2>
<p class="note">Menu names change often. If a label doesn't match what you see, the section for that assistant has more detail and a link to the company's own page.</p>
<div class="glance">{glance}</div>
</section>

<section class="block" aria-labelledby="detail-h">
<h2 id="detail-h" class="sr">Assistant by assistant</h2>
{sections}
</section>

<section class="block" aria-labelledby="check-h">
<h2 id="check-h">A ten-minute check</h2>
<p class="note">{lab("our")} Our suggestions, not the companies'.</p>
<ol class="steps">
<li><b>Ask first.</b> In each assistant you use, ask “What do you remember about me?” The answer shows you what it would bring into your next chat.</li>
<li><b>Open the memory page and prune it.</b> Delete anything you wouldn't want said back to you, or seen by someone else on your device.</li>
<li><b>Decide on training separately.</b> It's a different switch from memory. Turning memory off doesn't stop training, and the reverse is also true.</li>
<li><b>Use private chats for sensitive questions</b>, and remember they're still kept for a short time.</li>
<li><b>Clear out old chats you don't need.</b> On Claude, delete any memories they created as well.</li>
<li><b>Keep a short “never tell a chatbot” list</b>: passwords, ID and account numbers, and anything about other people that they didn't agree to share.</li>
</ol>
</section>

<section class="block prose" aria-labelledby="why-h">
<h2 id="why-h">Why this matters</h2>
<p>{lab("our")}In <a href="../../research/published/we-are-all-archives-now/">We Are All Archives Now</a>, we followed how records made for everyday needs, such as a barley account in clay or a land survey, outlived the moment that produced them. AI memory is the newest version of that story. A preference you mention once can become part of a lasting profile, kept by a company, used to shape what you are shown, and harder to see than a box of letters in a drawer.</p>
<p>{lab("spec")}An open question for this archive: when an assistant's memory of you shapes how it answers you, how much of that “you” is a record, and how much is an interpretation someone else made?</p>
<div class="related"><a class="btn" href="../griefbots/">Next guide: griefbots →</a><a class="btn" href="../../research/published/we-are-all-archives-now/">Read the essay</a></div>
</section>

<section class="block" aria-labelledby="src-h">
<h2 id="src-h">Sources</h2>
<p class="note">Each assistant's section was checked against these pages on {CHECKED_TXT}. Where a company's own page couldn't be read, we used reporting and labeled it.</p>
{sources_html(MEM_SRC, A)}
</section>"""
    return title, desc, body


# ---------------------------------------------------------------------------
# Guide 2: Griefbots
# ---------------------------------------------------------------------------
GRIEF_SRC = [
    ("University of Cambridge, “Call for safeguards to prevent unwanted ‘hauntings’ by AI chatbots of dead loved ones,” May 9, 2024, on Hollanek and Nowaczyk-Basińska, “Griefbots, Deadbots, Postmortem Avatars,” Philosophy &amp; Technology.", "https://www.cam.ac.uk/research/news/call-for-safeguards-to-prevent-unwanted-hauntings-by-ai-chatbots-of-dead-loved-ones"),
    ("Science News, “AI ‘ghosts’ can comfort mourners — even when the bots get the facts wrong,” July 20, 2026, on Manning et al., “Designing conversations with the dead,” DIS 2026.", "https://www.sciencenews.org/article/ai-ghosts-grief-facts-wrong-chatbot"),
    ("Lu, Yang, Cui, Liu, Wong and Hu, “Exploring public perceptions of artificial intelligence in bereavement support: a qualitative study of griefbots,” Frontiers in Digital Health, June 2, 2026.", "https://www.frontiersin.org/journals/digital-health/articles/10.3389/fdgth.2026.1852514/full"),
    ("Decrypt, “‘Demonic’: AI App That Lets Users ‘Talk’ to Dead Loved Ones Faces Backlash,” November 14, 2025.", "https://decrypt.co/348707/demonic-ai-app-lets-users-talk-dead-loved-ones-faces-backlash"),
    ("Skadden, “Two Newly Enacted New York Laws Will Regulate Certain AI-Generated Images,” January 14, 2026.", "https://www.skadden.com/insights/publications/2026/01/two-newly-enacted-new-york-laws-will-regulate"),
    ("Google Account Help, “About Inactive Account Manager.”", "https://support.google.com/accounts/answer/3036546?hl=en"),
    ("Apple Support, “How to add a Legacy Contact for your Apple Account.”", "https://support.apple.com/102631"),
    ("Meta, “Adding a Legacy Contact,” February 12, 2015, updated November 7, 2019.", "https://about.fb.com/news/2015/02/adding-a-legacy-contact/"),
]


def grief_guide():
    A = "g"
    title = "Griefbots: what to know about AI versions of people who have died"
    desc = "What griefbots are, what the research so far says about comfort and risk, what the law covers, questions to ask before trying one, and how to record your own wishes."
    body = f"""
<header class="head">
<p class="kicker">Guide · Memory &amp; identity</p>
<h1 class="h-l">Griefbots: what to know about AI versions of people who have died</h1>
<p class="lede">Some companies now offer chatbots and video avatars built from a person's messages, voice and photos, so the people they leave behind can keep talking to them. Here is what the research says so far, what it doesn't, and what to think about before you try one, or before someone makes one of you.</p>
<div class="meta"><span><b>Last checked</b> {CHECKED_TXT}</span><span><b>By</b> amaris ct</span></div>
{KEY}
<p class="care">If you're grieving right now, take this at your own pace. Nothing here says you should or shouldn't use one. If grief feels like too much to carry, a doctor or a grief counselor can help.</p>
</header>

<section class="block prose" aria-labelledby="what-h">
<h2 id="what-h">What a griefbot is</h2>
<p>{lab("our")}A griefbot is an AI system set up to talk like a particular person who has died. Researchers also call them deadbots, postmortem avatars or generative ghosts. Most are built by feeding a chatbot what the person left behind: text messages, emails, voice notes, video. Some answer in text; newer ones speak in the person's voice or appear as a moving video.</p>
<p>{lab("rep")}How little it can take is part of the controversy. In November 2025 the app 2wai advertised video avatars built from as little as three minutes of footage. Its ad showed a woman asking an avatar of her late mother for advice, then the avatar reading bedtime stories to her baby. Many viewers called it “nightmare fuel,” and legal experts raised questions about consent and who owns the data.{cite([4], A)}</p>
</section>

<section class="block" aria-labelledby="research-h">
<h2 id="research-h">What the research says so far</h2>
<p class="note">The studies are recent, small and short-term. They describe early experiences and expectations, not long-term effects.</p>
<div class="study"><h3>People found them comforting, even when the bot got facts wrong</h3>
<p class="what">{lab("rep")} Manning and colleagues, DIS 2026 conference · 16 volunteers who wanted to talk with an AI version of someone they had lost{cite([2], A)}</p>
<p>Most found the conversations positive and often comforting. When the bot invented details, such as a job the person never had, many carried on. Mistakes in tone bothered them more, like a nickname the person would never have used. Several worried about relying on it too much.</p>
<p class="limit">Worth knowing: a researcher checked every reply before participants saw it. Apps you can download don't do that.</p></div>
<div class="study"><h3>“Neither inherently beneficial nor inherently harmful”</h3>
<p class="what">{lab("doc")} Lu and colleagues, Frontiers in Digital Health, June 2026 · interviews with 25 adults in Guangdong, China{cite([3], A)}</p>
<p>People valued the idea of comfort, a continued bond, and a way to say things left unsaid. They also worried about griefbots interfering with natural grieving, giving a false picture of the person, creating dependency, and misusing personal data. The authors found that comfort and risk come from the same thing: the bot's ability to seem like the person is still present.</p>
<p class="limit">Worth knowing: participants were describing what they expected, not experiences from long-term use, and all came from one region.</p></div>
</section>

<section class="block prose" aria-labelledby="ethics-h">
<h2 id="ethics-h">What ethicists warn about</h2>
<p>{lab("doc")}In 2024, Cambridge researchers Tomasz Hollanek and Katarzyna Nowaczyk-Basińska described three situations that could go wrong:{cite([1], A)}</p>
<ul class="short">
<li><b>A bot made without consent</b> that starts advertising in a grandmother's voice once a free trial ends, with no way to switch it off.</li>
<li><b>A bot left for a child</b> by a dying parent, which starts giving confusing answers, such as suggesting they meet in person.</li>
<li><b>A long subscription</b> that keeps messaging family members after death, which no one can cancel without breaking the contract.</li>
</ul>
<p style="margin-top:14px">They recommend asking for consent from people before they die, age limits, clear reminders that you are talking to an AI, no advertising in the person's voice, and dignified ways to retire a bot, even a kind of digital funeral. They also say the rights of the people who talk to a bot matter, not only the person it imitates.{cite([1], A)}</p>
</section>

<section class="block prose" aria-labelledby="law-h">
<h2 id="law-h">What the law covers</h2>
<p>{lab("rep")}In December 2025, New York enacted a law requiring consent from the rights holders before the name, voice or likeness of certain people who have died is used for commercial purposes. It covers people whose identity had commercial value, such as public figures, and performers, including AI “digital replicas” of performers.{cite([5], A)}</p>
<p>{lab("our")}Laws like this are mostly about famous people and commercial use. A private family griefbot made from your own messages is, in most places, a legal gray area: what usually decides what happens to the data is the app's terms of service. This is not legal advice, so check the rules where you live.</p>
</section>

<section class="block" aria-labelledby="ask-h">
<h2 id="ask-h">Questions to ask before you try one</h2>
<p class="note">{lab("our")} Drawn from the research and recommendations above.</p>
<ul class="qs">
<li><b>Would they have wanted this?</b> Did the person agree, and would the rest of the family be comfortable with it?</li>
<li><b>Who owns what you upload?</b> Read what the company may do with the messages, voice and video you give it.</li>
<li><b>Can you switch it off for good?</b> Look for a clear way to delete the bot and all of its data, and check what happens if you stop paying.</li>
<li><b>Does it sell anything?</b> Avoid services that advertise or upsell in the person's voice.</li>
<li><b>Does it always say it's an AI?</b> Clear reminders protect you on hard days.</li>
<li><b>Are children involved?</b> Researchers suggest age limits, and children may not understand what they are talking to.</li>
<li><b>How will you know when to stop?</b> Decide in advance what a good ending would look like, and keep the people in your life close.</li>
</ul>
</section>

<section class="block" aria-labelledby="own-h">
<h2 id="own-h">Recording your own wishes</h2>
<p class="note">Whatever you decide about AI versions of yourself, these settings decide who can reach your accounts and data after you die.</p>
<dl class="facts" style="margin-top:14px">
<div class="fact"><dt>Google</dt><dd><p>{lab("doc")}Inactive Account Manager lets you pick up to 10 people to contact, and what data each can download, if your account goes unused for a period you choose. Without a plan, Google may delete an account inactive for two years.{cite([6], A)}</p></dd></div>
<div class="fact"><dt>Apple</dt><dd><p>{lab("doc")}{path('Settings', 'your name', 'Sign-In & Security', 'Legacy Contact')}. Your contact needs the access key you share and a death certificate. They can reach photos, messages, notes, files and backups, but not passwords or purchases.{cite([7], A)}</p></dd></div>
<div class="fact"><dt>Facebook</dt><dd><p>{lab("doc")}Choose a legacy contact to look after your memorialized profile, or ask for your account to be permanently deleted after death. A legacy contact can't log in as you or read your messages.{cite([8], A)}</p></dd></div>
<div class="fact"><dt>In writing</dt><dd><p>{lab("our")}Write down whether you would want an AI version of yourself, what it may be built from, and who gets to decide. Keep it with your will or the letter you leave for family.</p></dd></div>
</dl>
</section>

<section class="block prose" aria-labelledby="open-h">
<h2 id="open-h">An open question</h2>
<p>{lab("spec")}A griefbot is made from a person's records, the kind of archive we wrote about in <a href="../../research/published/we-are-all-archives-now/">We Are All Archives Now</a>. It can echo how someone wrote, but it is built from what they happened to leave behind. Is it a memory of the person, a portrait of them, or something new wearing their voice? The research can't settle that yet. Our <a href="../../#dossier-identity">Identity</a> dossier keeps the question open.</p>
<div class="related"><a class="btn" href="../what-ai-remembers-about-you/">Guide: what AI assistants remember about you →</a></div>
</section>

<section class="block" aria-labelledby="src-h">
<h2 id="src-h">Sources</h2>
{sources_html(GRIEF_SRC, A)}
</section>"""
    return title, desc, body


def index_page():
    title = "Guides: practical help with AI, memory and identity"
    desc = "Plain, sourced guides to what AI systems keep about you and what happens to your digital self, each with the date it was last checked."
    body = f"""
<header class="head">
<p class="kicker">Guides</p>
<h1 class="h-l">Practical guides</h1>
<p class="lede">The essays on this site ask what memory and identity mean when machines keep records of us. These guides cover the practical side: what is being kept, and what you can do about it. Each one shows the date it was last checked.</p>
{KEY}
</header>
<section class="block"><div class="cards">
<a class="card" href="what-ai-remembers-about-you/"><p class="kicker" style="margin:0">Memory &amp; identity</p><h2>What AI assistants remember about you</h2><p>What ChatGPT, Claude, Gemini, Copilot, Meta AI and Grok keep about you, where to see it, how to delete it, and what stays after you do.</p><span class="go">Read the guide →</span></a>
<a class="card" href="griefbots/"><p class="kicker" style="margin:0">Memory &amp; identity</p><h2>Griefbots</h2><p>AI versions of people who have died: what the research says so far, what the law covers, and questions to ask first.</p><span class="go">Read the guide →</span></a>
</div>
<p class="note" style="margin-top:22px">Last checked {CHECKED_TXT}. Settings change often, so these guides are re-checked every month.</p>
</section>"""
    return title, desc, body


def build():
    out = ROOT / "guides"
    pages = [
        ("guides/what-ai-remembers-about-you/", memory_guide, "../../"),
        ("guides/griefbots/", grief_guide, "../../"),
        ("guides/", index_page, "../"),
    ]
    for canon, fn, rel in pages:
        title, desc, body = fn()
        ld = article_ld(title, desc, canon, CHECKED) if canon != "guides/" else {
            "@context": "https://schema.org", "@type": "CollectionPage", "name": title, "description": desc, "url": SITE + canon}
        d = ROOT / canon; d.mkdir(parents=True, exist_ok=True)
        (d / "index.html").write_text(page(title=title, desc=desc, rel=rel, canon=canon, body=body, current="guides", ld=ld), encoding="utf-8")
    print("built", len(pages), "guide pages")


GUIDE_URLS = [SITE + "guides/", SITE + "guides/what-ai-remembers-about-you/", SITE + "guides/griefbots/"]

if __name__ == "__main__":
    build()
