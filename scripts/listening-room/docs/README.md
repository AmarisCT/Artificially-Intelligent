# The Listening Room: how it works and how to operate it

Public feature: `/listening-room/` (static files, no build step, no backend, no accounts).
Production tooling and tests: `scripts/listening-room/`. Decisions and proposals: this folder.

| Document | Contents |
|---|---|
| `EVALUATION.md` | Narration services, hosting, formats, Substack, podcast feed, privacy, alignment |
| `APPROVALS.md` | Decisions needed, proposed narration edits and chapter titles, how a recording becomes public |
| `ARCHITECT-PROPOSAL.md` | Secure integration proposal; nothing built |
| `REPORT.md` | Acceptance criteria, tests that passed, tests that could not be run |

## The one rule

A recording is playable by the public **only** when its record in `listening-room/data/audio-library.json` has
`status` of `published` (or `revision-required`) **and** a `releaseDate`. A newly published article is listed as *Not Yet
Recorded* and can never become playable by itself. The same rule is used by the library page, the listen page, the article
page's "Listen to This Essay" link, the sitemap, Search, the Inquiry Engine, the Research Atlas, the Learning Institute,
the Reading Desk and the podcast feed. The owner preview adds one exception (recordings awaiting review) through
`preview: true` in `config.js`, which production never sets.

## Statuses

Not Yet Recorded, In Production, Awaiting Audio Review, Published Audio, Revision Required.
The article's own status (published) is independent of its audio status.

## Data files (`listening-room/data/`)

| File | Contents | Written by |
|---|---|---|
| `audio-library.json` | Recordings, narration type and credit, status, review, release date, audio facts, versions, verification | `lr_compile.py`, then edited by you at approval |
| `audio-transcripts.json` | Transcript blocks with sentence timings, citation markers, Sources | `lr_compile.py` |
| `audio-chapters.json` | Approved structural chapters; proposed titles (hidden in production) | `lr_compile.py` |
| `audio-relations.json` | Links to Atlas, Lexicon, Theory Chamber, Unanswered Archive, Museum, Learning Institute | `lr_compile.py` from `editorial.json` |
| `audio-queue.json` | Per published article: audio status, eligibility, revision flags | `lr_queue.py` (6-hour workflow) |

Every id in the relations must exist in the real index or Lexicon; the compiler refuses to run otherwise. No dates are
invented: `detectedOn` is the date the queue first saw a difference.

## Producing a recording

Demonstration pipeline (CMU Flite; offline and free):

```
python3 scripts/listening-room/lr_narrate.py LR001   # script, pronunciations, audio, timing
python3 scripts/listening-room/lr_verify.py  LR001   # 12 automated checks against the article and the decoded MP3
python3 scripts/listening-room/lr_compile.py         # public data files
python3 scripts/listening-room/lr_queue.py           # queue and revision flags
```

The twelve production steps and where each happens:

1. Retrieve the article (public research source) · 2. Extract its approved text · 3. Prepare the narration script ·
4. Identify pronunciations (`pronunciations.json`) · 5. Generate or record narration (authorized method only) ·
6. Produce the audio file (MP3) · 7. Review the recording for pronunciation and omissions (**a person**) ·
8. Confirm it matches the approved article version (`lr_verify.py`, article hashes) ·
9. Generate or align transcript timestamps · 10. Store the approved audio · 11. Publish its metadata
(`lr_compile.py`, then your approval edit) · 12. Make it available in the Listening Room (`releaseDate`).

For a recording made another way (a human narrator, or a service), steps 5-6 are replaced by supplying the MP3; step 9
uses a forced aligner (EVALUATION.md section 9). Audio files go in `listening-room/audio/`, or at an absolute `https` URL
in the record. **Audio files are intentionally not in the repository yet.**

## Configuration (`listening-room/config.js`)

`preview` (owner preview only), `showProposedChapters`, `audioBase` (move relative audio to another host),
`siteRoot`. Production defaults are used when nothing is set; the committed file sets `preview: false`.

## What is stored in the visitor's browser

Key `ai_listen_v1`: listening positions, saved moments, preferences. The Reading Desk (`ai_desk_v1`) receives only
`listen:<id>` and `moment:<id@seconds>` items when the visitor saves something, added without touching existing items; a
corrupted Reading Desk is never overwritten. Nothing is sent anywhere. The Listening Journal explains this and offers
controls to clear it.

## Optional podcast feed

`python3 scripts/listening-room/build_audio_feed.py` writes `listening-room/podcast.xml` and per-recording WebVTT
transcripts only when `listening-room/feed-config.json` exists, at least one recording is published, and each audio file
matches its record. It never submits the feed anywhere. See EVALUATION.md section 7.

## Tests

```
bash scripts/listening-room/tests/run_tests.sh      # builds test sites, serves them with Range support, runs every suite below
python3 scripts/listening-room/tests/e2e_desk.py    # Reading Desk, Atlas and Learning Institute (serve the repo root on 8767)
python3 scripts/listening-room/tests/test_integration.py
```

Needs Python with Playwright and Chromium, Node, numpy/scipy and ffmpeg. `build_preview.py OUT` builds the owner preview.
