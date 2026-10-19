# Implementation and test report

Branch `feature/research-commons` (from `main` at 5c772d2). Date of the final run: 2026-10-19. Not merged, not deployed.

## How it was built

1. **Inspected the repository first.** The Unanswered Archive already had a submission design (`POST /api/public/question-submissions`, a honeypot, a minimum time, a consent flag, `config.json` with a null `submitEndpoint`). The Commons **reuses that exact request format and inbox** for questions; it does not add a second one. The Inquiry Engine, Search and the shared research index (`scripts/build_research_index.py`) already exist and were extended additively. The Architect backend is not in the repository, so it was neither inspected nor changed.
2. **Contract before interface.** The submission rules were written as a runnable reference (`scripts/commons_contract.py`) with 45 conformance cases, then the browser form was built to match and tested by feeding the request it really sends into that reference.
3. **Public data rules first.** `commons_lib.check_contribution` is the one definition of what may be public; the validator, importer and static-page builder all use it.
4. **Honest empty state.** The real data is empty and the page says so everywhere (library, constellation, correspondence, open inquiries, collections). The Featured Inquiry is an editorial question attributed to Artificially Intelligent.
5. **Owner preview.** A private interactive preview runs the same page code with a simulated service and seven clearly labelled fictional demonstration records, plus the owner-only guidelines draft.

## Results of the final run (`run_all.py`, all passing)

| Check | Result |
|---|---|
| Validate real public data | 0 errors, 0 warnings |
| Committed derived output equals a fresh build | up to date |
| A second build changes nothing (content hash of everything the build writes) | passes |
| Pipeline, contract, validator, importer, build, shared-index tests | **69 tests, OK** |
| Submission contract conformance cases (reference implementation) | **45 run, 0 failed** |
| Browser tests (Chromium; desktop 1280 px and phone 390 px) | **50 tests, OK** |
| Search and Inquiry Engine regression, with and without approved contributions | **7 tests, OK** |
| Accessibility audit | **32 view states × 2 widths, 0 issues** |

Other features' own validators still pass on this branch (they read files this branch does not touch): Unanswered Archive validator 0 errors, Theory Chamber validator 0 errors (both report warnings that are present on `main` as well). Rebuilding the shared research index changes nothing relative to the committed copy.

### What the browser tests cover

- The home page has the exact heading, subtitle and four introductory paragraphs; five actions; the three-tier panels; no invented counts, quotes or activity. Submission actions say they are not open when no service exists.
- Every route loads without console errors, sets its page title, and handles unknown or hostile routes harmlessly.
- Library: approved records newest first, filters (type, subject, collection, search) set and cleared, **no popularity controls or rankings anywhere**, withdrawn records show only a notice.
- Correspondence pairs perspectives with the questions they respond to and labels who wrote what. Open Inquiries contains only editor-selected visitor questions. Collections are active only with approved members.
- Question Constellation: nothing drawn until asked when empty; select, filter, search, zoom, pan and keyboard use; list alternative selects the same node; suggested edges are dashed and labelled; JavaScript derives exactly the same edges as the build script (compared in a test); starts as a list on a phone.
- Forms with a configured service: empty submit shows an error summary and names each problem; too-fast and honeypot send nothing; every type sends what the reference contract accepts; **success is shown only when the service confirms**; 422, 429 (with `Retry-After`), 503, offline and unconfirmed replies are shown honestly and keep the text; no cookies or credentials; request goes only to the configured service; the Archive fallback sends the Archive's exact legacy request and offers only its six subjects.
- Hostile text (`<img onerror>`, `<script>`, `javascript:` URLs) in approved records is shown as text and never run.
- Private preview: demonstration records off until switched on and always labelled; the real data in the bundle is untouched; owner drafts labelled unapproved wherever they appear; every simulated outcome says nothing was sent.
- Phone: nothing scrolls sideways, tap targets are comfortable.

### What the accessibility audit checks

Per view and width: one `h1` and no skipped heading levels, landmarks, a skip link, every control has an accessible name, `aria-describedby`/`aria-labelledby` targets exist, no positive `tabindex`, radio groups in fieldsets, labelled live region, unique ids, no sideways scroll, minimum target sizes. Contrast uses the site's existing palette. **This is a structural audit, not a substitute for testing with a screen reader and a real phone**, which I could not do from this workspace.

## Defects found and fixed during the work (so the numbers above can be trusted)

- Inquiry Engine deep links dropped the question's encoding; fixed and tested against the engine's own decoder.
- A perspective's `relatedQuestion` was dropped between form and contract; fixed with a test.
- Demonstration ids were rejected by the edge reference matcher; fixed.
- `Retry-After` could not be read by the browser because CORS did not expose it; the contract now requires `Access-Control-Expose-Headers: Retry-After`.
- Constellation nodes were unclickable (the label hit area); fixed with a transparent hit target.
- Accessibility audit findings: a skipped heading level, missing `aria-describedby` targets, undersized tap targets; fixed.
- **Inquiry Engine map legend did not gain its "Visitor contribution" entry when the visitor expanded to a contribution node.** Found by the final regression test; fixed (legend now refreshes with the map) and covered by a test.
- Several test-harness races (static fallback heading, selection dimming, a missing import) fixed.

## Known limits and things I could not do

- **Nothing was tested against the live site, GitHub Pages, Search Console, or the Architect backend.** My workspace cannot reach them.
- **The submission service and moderation inbox do not exist.** The reference implementation proves the rules are satisfiable and gives the builder an acceptance test; it is not production code and is Python, not Architect's stack.
- Browser tests ran in Chromium only. Safari and Firefox, screen readers (VoiceOver, NVDA, TalkBack) and real phones were not tested.
- Google Fonts, which the whole site already uses, could not be loaded in my sandbox, so type rendering was checked with fallback fonts.
- The constellation is built to be readable up to a few hundred records; it has not been tested at larger sizes because no such data exists. The list alternative is the primary route for large sets.
- The guidelines wording is a draft for the owner and has not been reviewed by a lawyer.
- Expected merge conflicts with `feature/research-ledger` (small, mechanical): `scripts/build_research_index.py`, `search/search-app.js`, `.github/workflows/refresh-feed.yml`, `.gitignore`.
- The Inquiry Engine's own functions were changed only to label a contribution node and refresh its legend. A contribution never appears in the starting map, the guided answer or the evidence list; it can appear only if the visitor chooses "Expand connections" on a node an editor linked it to.

## Files changed outside `research-commons/`

`.github/workflows/refresh-feed.yml` (push restricted to `main`, one watched path), `scripts/build_research_index.py` (adds the `contribution` type, inert with zero records), `search/{engine.js,search-engine.js,styles.css}`, `inquiry-engine/{app.js,engine.js,styles.css}`, `inquiry-engine/data/{index-status.json,research-index.json}` (only an "adapters" note), `.gitignore`, new scripts, tests and docs. No change to the homepage, navigation, sitemap, `unanswered-archive/`, the Architect login or any published research page.
