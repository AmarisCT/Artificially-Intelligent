# The Listening Room: narration, hosting and distribution evaluation

Prepared 16 October 2026. Nothing here has been purchased, subscribed to, signed up for or published. Prices are the
vendors' own published figures as read on that date; they change, so confirm on the vendor's page before deciding.
Where I could not confirm a figure from the vendor's own page, it says **not verified** and is left out of the
arithmetic.

## 1. What the first release uses, and why

The two recordings in the preview are made with **CMU Flite** (open source, runs offline, free), voice `slt`. They are
**demonstration recordings**: they prove the whole pipeline (script, audio, timing, transcript, player, review gates) end
to end without spending money or using a voice we have no right to. They are not good enough to publish. The voice is
audibly synthetic, and nobody has yet listened to them for pronunciation (I could only read the engine's phonemes back).
Each recording says so in its first spoken sentence, in the page and in the file's metadata.

**Recommendation.** Do not buy anything yet. Decide *who narrates* first (section 2), then choose a service by ear
(section 3). The pipeline accepts any MP3, so the choice is not locked in.

## 2. Human narration or a synthetic voice

| | Human narrator | Synthetic voice |
|---|---|---|
| Identity | A distinct, personal voice for the site. | Generic unless a voice is licensed to you. |
| Rights | You own a recording you make. A hired narrator needs a written licence. | Depends on the service's terms (section 3). |
| Disclosure | Credit the narrator. | Must be disclosed. The Listening Room does so in the page, the transcript and the audio itself. |
| Pronunciation | Controlled by reading. | Needs a pronunciation list and a listening review. |
| Cost | Your time, or a narrator's fee (I have no quote). | Cents to a few dollars per essay at current API prices. |
| Revision | Re-record the changed part. | Re-render; cheap. |
| Fit | Flagship essays. | Volume, and drafts for review. |

My recommendation: record the first one or two flagship essays yourself (or with a narrator you choose), and use a
reviewed synthetic voice, clearly labelled, if the series grows faster than you can record. Either way the review and
approval gates are the same.

## 3. Synthetic-voice services

The two essays total **29,412 spoken characters** (LR001 10,005; LR002 19,407). Cost columns use that figure.

| Service | Quality tier / price (vendor page) | Free tier (vendor page) | Cost for both essays | Commercial use and storing the audio | Notes |
|---|---|---|---|---|---|
| **Amazon Polly** | Standard $4 / M characters; Neural $16; Generative $30; Long-Form $100 | Standard 5 M chars/month; Neural 1 M, Long-Form 500 K, Generative 100 K per month for the first 12 months | Neural about $0.47; Generative about $0.88; Long-Form about $2.94 | Page says generated speech can be cached and replayed at no extra cost. Commercial use is **not addressed on the pricing page**; read the service terms. | SSML and Speech Marks (word timing) available. |
| **Google Cloud Text-to-Speech** | Standard / WaveNet $4; Neural2 $16; Chirp 3: HD $30; Studio $160 | Standard/WaveNet 4 M, others 1 M characters/month | Neural2 about $0.47; Chirp 3 HD about $0.88; Studio about $4.71 | Not on the pricing page; read the terms. | SSML tags count towards billed characters. |
| **Microsoft Azure AI Speech** | **Not verified** (the page I could read showed placeholders) | Free tier: 0.5 M characters/month, Neural | Not verified | Not verified | Check the pricing page directly. |
| **OpenAI `gpt-4o-mini-tts`** | $0.60 / M text tokens in; $12 / M audio tokens out | None stated | Not computed: cost is per token, not per character, and users report it can exceed estimates | Not verified | The developer page lists a 2,000-token input limit per request (essays must be chunked) and marks the model deprecated. Check what replaces it. |
| **ElevenLabs** | API $0.08 / 1,000 characters (v2, v3), $0.04 Flash. Plans: Starter $6/month (75 K chars), Creator $22 (275 K), Pro $99 (1.238 M) | Free plan: 10 K chars | About $2.35 at API rates; a monthly plan is more likely | Their help page: **free plan audio cannot be used commercially** and needs attribution; paid plans allow commercial use, with conditions. | Strong voices. Do not use voice cloning without the speaker's informed permission. |
| **Piper** (open source, local) | Free | n/a | $0 | Engine is GPL-3.0. **Each voice has its own licence** (its `MODEL_CARD`); the project warns that some are restrictive. The project is asking for new maintainers. | Not run here. |
| **Kokoro-82M** (open weights, local) | Free | n/a | $0 | Model weights Apache-2.0; its card says training used permissive or non-copyrighted audio. | Not run here (needs a model download my sandbox cannot make). Worth a trial on your own computer. |
| **CMU Flite** (used for the demo) | Free | n/a | $0 | The engine's licence (MIT-style, per its Debian copyright file) allows use and distribution without restriction. I could not find the `slt` voice's own licence terms in the package. **Confirm before any public release.** | Intelligible, clearly robotic. Demonstration only. |

What this means in practice: at today's prices the **API cost is not the deciding factor**. Both essays together cost
under three dollars on every metered option above and fall inside several free tiers. The deciding factors are rights,
voice quality and review effort. I did not generate sample audio from any paid or account-based service, so I cannot
rank their sound quality; that needs your ears.

**Suggested selection test (free, needs your approval to set up accounts).** Render the same two paragraphs from three
candidates (for example Polly Neural, Google Chirp 3 HD, and Kokoro run locally), play them side by side, and judge
pronunciation of *Ashurbanipal*, *Domesday*, *ChatGPT* and *AI*.

**Requirements any chosen service must meet** (from your brief): voices licensed for this use; no imitation of an
identifiable person without permission; accurate pronunciation; no emphasis that distorts meaning; the arguments never
modified; audio reviewed by a person before release; the written essay always available.

## 4. Where the audio files live

Measured from the two recordings: MP3, mono, 22.05 kHz, 48 kbps constant bitrate, loudness −16 LUFS, about **0.36 MB per
minute** (46 hours per GB). LR001 is 3.7 MB; LR002 is 7.4 MB.

| Host | Limits and cost (vendor page) | Fit |
|---|---|---|
| **GitHub Pages** (today's host) | Published site at most 1 GB; soft 100 GB/month bandwidth; soft 10 builds/hour (not for Actions-based builds); deploys time out at 10 minutes. Pages is "not intended for or allowed to be used as a free web-hosting service" for businesses or SaaS. Free. | Simple and reliable for a handful of recordings. One full play of both essays is 11.1 MB, so the 100 GB soft limit is about **8,900 complete plays of both** a month. Storage is not the first problem; **repository growth is**: every re-rendered MP3 stays in git history, so a few re-recordings of long essays add up. |
| **Cloudflare R2** | $0.015 per GB-month; **no egress fees**; free tier 10 GB-month, 1 M writes and 10 M reads per month | Good next step. 100 hours of audio is about 2.2 GB, inside the free tier. Needs a Cloudflare account and a public custom domain; check their guidance on the default `r2.dev` address before relying on it. |
| Podcast host (Libsyn, Buzzsprout and similar) | **Not priced here** | Only worth it if you want podcast analytics, directory submission and a managed feed. Adds a third party that sees listeners' IP addresses. |

**Recommendation.** Start on GitHub Pages with the first handful of recordings (up to roughly 10 recordings or 150 MB).
Move to object storage when you pass that or when a re-record would bloat the repository. The Listening Room is ready for
the move **now** (tested, test T28):

* a record's `audio.url` may be a site-relative path or an absolute `https` URL; `audioBase` in `config.js` moves every
  relative file to another host without editing the records;
* audio on another origin is loaded in CORS mode so the Audio Atmosphere can read the sound. The host must send
  `Access-Control-Allow-Origin` and allow the `Range` header;
* if the host sends no CORS headers, playback still works (the player retries the ordinary way) and the Atmosphere says it
  cannot read the signal and shows the still loudness picture instead;
* `http:`, `javascript:` and `data:` audio addresses are never treated as playable.

Before moving: check with `curl -I` that the host returns `Accept-Ranges: bytes`, the right `Content-Length` and
`Content-Type: audio/mpeg`.

## 5. Format and delivery

MP3 stays the default: it plays in every current browser, seeks well, and at 48 kbps mono voice is about 3 MB per 10
minutes. I did not evaluate other formats because nothing in the first release needs them. (AAC or Opus would save
bandwidth at the cost of compatibility and tooling; revisit only if bandwidth becomes the problem.)

Delivery behaviour as built and tested: nothing audio-related loads on the library page; a recording's metadata loads on
its own page; the full file buffers only after Play; seeking uses Range requests; playback errors give a specific message
(missing file, network failure, undecodable file) and the transcript stays readable.

## 6. Substack

What Substack's help pages say (read 16 October 2026):

* A Substack post can carry audio uploaded as MP3, WAV or AAC. The page gives no size or length limit.
* A podcast hosted elsewhere can be **distributed to Substack from its RSS feed URL**: the audio stays on the original host,
  new episodes sync automatically, and you choose whether episodes publish immediately or arrive as drafts.
* Listeners can use the Substack app, the web page, or podcast apps the show is submitted to.

What I have **not** done and will not do without your approval: upload anything to Substack, create a podcast there, or
link to any Substack audio. The Listening Room links to your publication and to a Substack post only where a real, verified
post exists, and shows "No Substack post is linked" otherwise. I could not confirm from public pages whether your own
account has the podcast section enabled; that is visible only in your Substack dashboard.

If you later want recordings on Substack, the cleanest route is the optional site feed below: Substack can read it, and
drafts-only import lets you approve each episode.

## 7. Optional podcast feed

A generator exists (`scripts/listening-room/build_audio_feed.py`) but is **inert** until you set it up:

* it writes nothing without `listening-room/feed-config.json` (title, description, author, cover image, category,
  explicit flag), nothing while no recording is Published Audio, and nothing if an audio file is missing or its size
  differs from the record;
* when it runs it lists **only published recordings**, with the real title, description, audio URL, publication date,
  measured duration, byte length, and a stable GUID; synthetic voices are disclosed in each episode description;
* it also writes a WebVTT transcript per recording and references it with the Podcasting 2.0 `podcast:transcript` tag;
* it never submits anything anywhere.

Apple's published requirements (read 16 October 2026): RSS 2.0 with the iTunes namespace, public and not password
protected, at least one episode, show artwork, a unique `enclosure` (URL, length, type) per episode, a never-changing GUID,
RFC 2822 `pubDate`, a host that answers HEAD and byte-range requests, and ASCII-only URLs and filenames. The feed meets the
ones it controls; **the cover artwork (square, RGB, no transparency; Apple's page gave no pixel sizes, so check theirs) is
yours to supply**, and whether GitHub Pages answers byte-range requests for the final MP3s must be checked after
deployment. Validate the feed with Apple's validator before submitting anywhere.

## 8. Privacy and disclosure

* Visitors listen without an account. Progress, saved moments, notes and preferences live in the visitor's browser
  (`ai_listen_v1`) and are never sent anywhere; the page says what is stored and offers controls to clear it. Nothing
  syncs between devices and the page does not claim it does.
* No analytics and no third-party audio host are used. Moving audio to object storage or a podcast host would change that:
  the host sees the listener's IP address and what they play. Disclose it if you move.
* Synthetic voice: disclosed on the recording's page, in the transcript's recording note, in the file metadata and in the
  first spoken sentence. This matches your brief. Separately, the EU AI Act's Article 50 transparency duties apply from
  2 August 2026 (law-firm summaries of the Commission's guidance say providers of generative systems must mark
  synthetic audio in machine-readable form and deployers must disclose certain content such as deepfakes; whether and how
  they apply to a narration of your own text is a legal question I cannot settle). I am not a lawyer; if you publish
  synthetic narration to EU listeners, take advice.

## 9. Transcript alignment for recordings not made by this pipeline

For the demonstration recordings, sentence timings are exact by construction (each sentence is rendered at a known
sample offset and the timings were verified against the decoded MP3 within 0 ms, 12 of 12 checks each). A human recording
or a service's MP3 has no such timeline. The workflow for those:

1. Take the approved narration script (the transcript text), not a re-transcription of the audio, so the text can never drift.
2. Run a forced aligner against the audio to get sentence start and end times. Open-source options include WhisperX and the
   Montreal Forced Aligner (not tested here).
3. Write the sentence timings into the same transcript format. Spot-check at least a dozen sentences by ear and by
   waveform; the verification script's energy-mask and gap checks apply to any MP3 and are designed to catch a global offset.
4. Only then does the sentence highlighting claim sentence-level precision. If a recording cannot be aligned reliably, the
   Listening Room should show paragraph-level sync only, and say so.

This is the one part I could not exercise end to end, because the sandbox could not run an aligner on third-party audio.

## Sources

* [Amazon Polly pricing](https://aws.amazon.com/en/polly/pricing/)
* [Google Cloud Text-to-Speech pricing](https://cloud.google.com/text-to-speech/pricing)
* [Azure AI Speech pricing](https://azure.microsoft.com/en-us/pricing/details/cognitive-services/speech-services/)
* [OpenAI gpt-4o-mini-tts model page](https://developers.openai.com/api/docs/models/gpt-4o-mini-tts)
* [ElevenLabs API pricing](https://elevenlabs.io/pricing/api) and [publishing generated audio](https://help.elevenlabs.io/hc/en-us/articles/13313564601361-Can-I-publish-the-content-I-generate-on-the-platform)
* [Piper (OHF-Voice/piper1-gpl)](https://github.com/OHF-Voice/piper1-gpl) and its [voices note](https://github.com/OHF-Voice/piper1-gpl/blob/main/docs/VOICES.md)
* [Kokoro-82M model card (fork)](https://github.com/captivus/Kokoro-82M)
* [GitHub Pages limits](https://docs.github.com/en/pages/getting-started-with-github-pages/github-pages-limits)
* [Cloudflare R2 pricing](https://developers.cloudflare.com/r2/pricing/)
* [Substack: create and publish a podcast](https://support.substack.com/hc/en-us/articles/360037462092-How-do-I-create-and-publish-a-podcast-on-Substack) and [distribute a podcast hosted elsewhere](https://support.substack.com/hc/en-us/articles/52072365337620-How-do-I-distribute-my-podcast-to-Substack-if-it-s-hosted-elsewhere)
* [Apple Podcasts RSS feed requirements](https://podcasters.apple.com/support/823-podcast-requirements)
* [EU AI Act Article 50 overview (Sidley)](https://datamatters.sidley.com/2026/06/24/eu-ai-act-transparency-obligations-preparing-for-compliance-by-2-august-2026/) and [William Fry](https://www.williamfry.com/knowledge/time-running-out-as-ai-transparency-guidelines-published/)
