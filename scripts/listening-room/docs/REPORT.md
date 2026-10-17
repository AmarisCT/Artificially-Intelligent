# The Listening Room: QA and acceptance report (preview stage)

16 October 2026. Branch `feature/listening-room`. **Nothing is deployed.** The two recordings are synthetic demonstration
recordings awaiting your review; in the production configuration they are not playable by anyone.

## 1. Result in one table

| Suite | What it covers | Result |
|---|---|---|
| `test_sync.js` | Sentence-synchronization engine (pure logic) | 21 / 21 |
| `test_queue.py` | Production queue, eligibility, revision detection (fixtures) | 14 / 14 |
| `test_feed.py` | Optional podcast feed and WebVTT (fixtures, including externally hosted audio) | 16 / 16 |
| `e2e.py` | Real Chromium: playback, seeking, speed, keys, sync, modes, chapters, moments, journal, resume, storage failures, audio errors, Audio Atmosphere, research context, citations, navigation, mobile, accessibility, console errors, library, cross-origin audio | 173 / 173 |
| `e2e_desk.py` | Reading Desk compatibility, Research Atlas and Learning Institute integration | 25 / 25 |
| `test_integration.py` | Article pages, sitemap, research index, Search, Inquiry Engine, revision flow, corrupt-record safety | 27 / 27 |

Total 276 automated checks, all passing on the final code. Each check records what was measured; a few examples are listed
in section 3. Test sources are in `scripts/listening-room/tests/`.

## 2. Acceptance criteria

| # | Criterion | Status | Evidence / caveat |
|---|---|---|---|
| 1 | Visitors can browse actual available recordings | **Met in the preview** | Two real recordings. In production nothing is listed as playable until you approve one (an empty room says so and asks search engines not to index it). |
| 2 | Audio playback works | **Met** | Real MP3s decoded and played in Chromium; progress of `currentTime` checked. |
| 3 | Controls function correctly | **Met** | Play/pause, ±10 s, previous/next, scrub slider, five speeds (pitch preserved), volume/mute, keyboard shortcuts. |
| 4 | Published recordings have accurate transcripts | **Verified for the demos; none is published yet** | Transcript paragraphs equal the published article text word for word (automatic check, both essays). |
| 5 | Synchronization functions at its stated precision | **Met** | Stated precision: **sentence**. Timings are exact by construction and were checked against the decoded MP3 (offset 0 ms; speech present at every highlighted midpoint, silence in every gap where the highlight holds). |
| 6 | Visitors can reach the original articles | **Met** | "Read the original essay" links to the published article pages. |
| 7 | Research links open genuine resources | **Met in the repository; live URLs not reachable from here** | Every Atlas, Lexicon, Museum, Theory, Unanswered and Learning Institute id resolves against the real index (the compiler refuses otherwise). I could not open the live site from the sandbox. |
| 8 | Narration types clearly attributed | **Met** | Human / synthetic / synthetic demonstration, shown on the card, page, transcript note and inside the audio. |
| 9 | Progress can be saved and resumed | **Met** | Saved only after a real interaction; resume prompt; "Start over". Browser-local, never claimed to sync. |
| 10 | Reading Desk integration preserves existing data | **Met** | Additive adapter; a corrupted desk is never overwritten; unknown items survive. |
| 11 | Future articles can enter the production workflow | **Met in tests** | Fixtures show a new article becoming *Not Yet Recorded* and never playable. The scheduled GitHub workflow has not run live. |
| 12 | Unrecorded articles not presented as playable | **Met** | Includes: published but no release date, typed URLs of unapproved recordings, and no audio file requested for them. |
| 13 | Mobile and desktop | **Met in emulation** | 390 px and 1280 px, no horizontal overflow; docked bottom player and bottom-sheet annotations on mobile. No real phones. |
| 14 | Accessibility tested | **Partly** | Automated and keyboard testing (below). **Not tested with a screen reader.** |
| 15 | Architect authentication unchanged | **Met by inspection** | No Architect, login or publishing-backend file was touched. I cannot sign in from here, so please test Architect login yourself. |
| 16 | Current article publishing continues | **Met in tests; live run pending** | Rebuilding published pages leaves them byte-identical. The workflow change adds one step with `continue-on-error`, and a corrupt recording record cannot stop the article build. Please do one real publish after deployment. |
| 17 | Public playback verified after deployment | **Not done** | Needs your approval and a deployment; the sandbox cannot reach the live site. |

## 3. Phase 9 test list

| Area | How it was tested | Result |
|---|---|---|
| Actual audio playback, pause and resume | Real MP3 in Chromium; time advances, pause holds, resume continues | Pass |
| Seeking | Slider (pointer and keys), timestamps, chapter jumps, deep links; Range requests honoured | Pass |
| Playback speed | Each speed sets the real `playbackRate`, pitch preserved | Pass |
| Mobile audio controls | 390 px emulation: docked player, touch targets, collapse of secondary controls | Pass (no real device) |
| Transcript accuracy | Automatic word-for-word comparison with the published article | Pass |
| Timestamp alignment | 24 random sentence midpoints per recording compared with the timeline; decoded-audio energy at each; gaps hold the highlight | Pass |
| Chapter navigation | Approved structural chapters only; proposed titles preview-only | Pass |
| Bookmarks and saved moments | Create, jump, delete, persistence | Pass |
| Saved listening position | Save after interaction, resume, start over | Pass |
| Reading Desk compatibility | Existing items preserved, additive adapter, corrupted desk | Pass |
| Source links | Original essay, Sources, citations, annotations | Pass |
| Audio file errors | 404, network failure, corrupt file: specific message, transcript stays readable, play disabled after fatal error | Pass |
| Accessibility | Landmarks, language, live region, radio-group modes, keyboard reach, visible focus on everything reached, WCAG AA contrast on sampled elements, accessible alternative to the visualization | Pass (automated) |
| Reduced motion | Animation off by default under `prefers-reduced-motion`; still overview and explanation shown | Pass |
| Article revision handling | Changing one word of an essay flags the recording Revision Required without touching it | Pass |
| Future publication detection | New article becomes eligible, never playable | Pass |
| Existing Architect functionality | No Architect files changed | By inspection only |
| Existing GitHub workflows | YAML valid; one additive step, non-blocking; generators run unchanged | Pass locally; not run on GitHub |
| Storage unavailable | Blocked `localStorage`: listening works, notices shown | Pass |
| Cross-origin audio hosting | Simulated second origin with and without CORS | Pass |

## 4. What could not be completed or verified

1. **Listening quality and pronunciation.** Nobody, including me, has listened to the recordings. I could only read the
   engine's phonemes back. This is the main reason the recordings stay *Awaiting Audio Review*.
2. **Live deployment.** The sandbox cannot reach `amarisct.github.io`. Whether GitHub Pages serves the MP3s with byte
   ranges and the right content type, and whether public playback works, can only be verified after deployment.
3. **Architect login and a real publish.** Not testable from here.
4. **The scheduled workflow.** The 6-hour refresh with the new queue step has not run on GitHub.
5. **Other browsers and devices.** Chromium only (desktop and phone emulation). In Safari the Audio Atmosphere is
   unavailable by design (it falls back to the still loudness picture); that path was tested by simulating missing
   support, not in Safari. Lock-screen and headphone controls (Media Session) are set but unverified on a device.
6. **Screen readers.** VoiceOver, NVDA and JAWS were not used.
7. **The preview page on the artifact host.** I verified the identical bundle in a real browser from a local server.
   I could not open the hosted copy from here, so seeking against that host is unverified.
8. **Object-storage hosting, podcast validators, forced alignment of third-party audio.** The cross-origin behaviour and
   the feed structure are tested with fixtures; no external service was used, and Apple's validator was not run.
9. **Voice licence.** The `slt` voice's own licence terms were not found in the Flite package; confirm before release.

## 5. What changed outside `listening-room/` and `scripts/listening-room/`

Ten existing files, all additive, none public-facing in production until recordings are approved:

| File | Change |
|---|---|
| `index.html` | Reading Desk understands `listen:` and `moment:` items; Atlas dossier gains a "Listen" row shown only for released recordings |
| `learning-institute/app.js` (and its source copy) | Optional per-lesson audio line, shown only for released recordings, with its own progress |
| `inquiry-engine/app.js`, `inquiry-engine/engine.js`, `search/engine.js`, `search/search-engine.js` | An "Audio essay" resource type and a Listen recommendation, only for released recordings |
| `scripts/build_research_index.py` | Indexes released recordings only; tolerates a corrupt library file |
| `scripts/build_published.py` | "Listen to This Essay" link, AudioObject schema and sitemap entry, only for released recordings; tolerates a corrupt library file |
| `.github/workflows/refresh-feed.yml` | One non-blocking queue step and its trigger paths |

Site navigation, the homepage, Architect and authentication are untouched. The "Listening Room" entry in the site
navigation will be added only after you approve.

## 6. Deliverables

| # | Deliverable | State |
|---|---|---|
| 1-7 | Homepage, searchable library, audio essay reader, playback controls, synchronized transcript, three listening modes, Audio Atmosphere | Built; in the preview |
| 8-9 | Recordings and transcripts for the two source essays | Demonstration recordings; transcripts accurate; **not approved** |
| 10-11 | Chapter navigation, research annotations | Built (structural chapters approved by structure; draft titles await you) |
| 12-14 | Listening Journal, saved progress, Reading Desk compatibility | Built and tested |
| 15 | Links to existing research features | Built, both directions |
| 16-17 | Detection of future articles; production and approval workflow | Built (queue, revision flags, gates); Architect UI is a proposal |
| 18 | Structured audio records | Built (`listening-room/data/`) |
| 19-20 | Mobile layouts; accessible alternatives | Built; screen-reader testing pending |
| 21 | Working preview | Published privately for you |
| 22 | Tested GitHub code | On branch `feature/listening-room`; not merged |
| 23 | Deployment verification report | After approval and deployment |
