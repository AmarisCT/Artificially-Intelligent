# Research Ledger: implementation and testing report

Branch: `feature/research-ledger` (from `main` at ca70e4b). Not merged, not deployed, not linked from anywhere on the live site.

## What was built

| Area | Delivered |
|------|-----------|
| Records | Structured JSON for publications, sources, claims, reviews, revisions, corrections, snapshots, timeline events and policies, with a registry that never reuses an id |
| Page | `/research-ledger/`: Publication Records (with per-publication sections), Evidence Registry (sources and claims), Source Evidence Inspector, “Trace the Claim”, Revision History, version Comparison (side-by-side and inline, show-only-changes, change list), Corrections & Clarifications, Review Status, Editorial Methodology, Research Timeline, Integrity summary, Life of an Idea, concern composer, global search |
| Version tracking | `capture_public_revisions.py`: hash-based, two-sighting confirmation, no git, no false revisions on rebuilds |
| Source checking | `verify_ledger_sources.py`: Crossref / DataCite / arXiv metadata check, capped at Metadata Confirmed |
| Safeguards | `validate_research_ledger.py`: refuses missing origins, unissued ids, tampered snapshots, “peer review” language, approved policies without an approver, non-https channels, `preview: true`, and draft policy text in public data |
| Site integration | Correction notice hook in essay pages; `ledgerUrl` in the shared research index; “View Research Record →” in Inquiry Engine and Search; workflow step in `refresh-feed.yml` (all inert until the Ledger page exists, and the essay link is off) |
| Docs | This report, README, APPROVALS, ARCHITECT-INTEGRATION-PROPOSAL, and a proposed (unapplied) homepage patch |

## What the Ledger contains today (real records only)

- 2 publications: PUB-001 *We Are All Archives Now* (published 2026-10-07) and PUB-002 *Is Human Consciousness Connected to Artificial Intelligence?* (2026-09-19). Both entered the Ledger on 2026-10-17.
- 20 sources; 9 are Verification Incomplete. The rest reached Abstract Reviewed or Source Content Inspected as recorded during construction.
- 23 claims, every claim-to-source link “Not assessed”.
- 0 revisions, 0 corrections, 0 completed reviews (both publications are “Awaiting Editorial Review”).
- 0 of 11 methodology policies approved.
- Version history begins 2026-10-17. Nothing earlier is reconstructed.

Every source and claim record says it was prepared with AI assistance and not re-checked by a human editor. That is true, and it is the main limit on how far the Ledger's current content should be trusted.

## Test results

Run once, with nothing else running, on the final tree:

| Check | Result |
|-------|--------|
| Validator on the real data | 0 errors, 0 warnings |
| Compiled `ledger.json` matches the records | up to date |
| Pipeline, validator, build, essay-page hook, shared index, metadata checker | 61 tests pass |
| Comparison logic (Node) | 9 of 9 pass |
| Browser tests (headless Chromium, 390 px and desktop) | 50 pass |
| Accessibility audit | 23 views × 2 widths, 0 views with issues |

What the tests specifically cover:

- **No false revisions.** Re-running capture, scheduled rebuilds, whitespace/markup-only feed differences and a missing feed all create nothing. A real edit stays *pending* after one sighting, becomes a snapshot plus an unclassified revision after a second sighting at least 30 minutes later, and is never assigned a category automatically.
- **Honest empty states.** The two exact empty-state strings render when there is nothing to show; the single-version comparison says there is nothing to compare.
- **Dishonest records are refused.** Seventeen validator rules are each shown rejecting a deliberately bad record (for example a claim marked supported by an uninspected source, a high verification level with no named reviewer, a quoted passage that is not in the saved text, a tampered snapshot, a future-dated verification).
- **Public/private separation.** Draft policy text fails validation if it reaches public data; demo records never enter counts or committed files.
- **Existing site untouched.** With the Ledger switched off, `build_published.py` output is byte-identical to the committed essay pages (automated test); the only change to `research-index.json` is `ledgerUrl` on the two articles (automated test). Search and Inquiry Engine were also checked by hand for regressions on a local copy; that check is not part of the automated suite.
- **Safe rendering.** Correction-notice text is HTML-escaped on essay pages. The Ledger page builds its content with `textContent` only and uses https-only links; a non-https concern endpoint is never used.
- **Metadata checker (mock only).** Match → Metadata Confirmed (never higher, never lowers an existing level); mismatch → open observation; unknown id → open observation; service down → nothing written; re-run → no duplicate entries; dry run writes nothing. One test caught a title matcher that treated a short title contained in a longer, different title as a match; that was tightened.

Running two copies of the whole suite at the same time makes the browser tests collide (they share a local port). Run it once at a time.

## What was not tested, and why

- **The live site.** The build environment cannot reach `amarisct.github.io`, so nothing was checked against the deployed pages. The browser tests run against a local copy.
- **The live metadata services.** Crossref, DataCite, doi.org and arXiv are unreachable from the build environment (the proxy refuses the connection), so `verify_ledger_sources.py` has never made a real request. Its parsing is tested against canned responses in the services' documented formats; its first real run should be watched.
- **The scheduled workflow.** `refresh-feed.yml` has not run on GitHub with the new step. Its logic was run locally; the first scheduled run after approval is the real test. The step is `continue-on-error` and discards its changes on failure.
- **A real second capture.** Real feed edits were simulated on a temporary copy. No real revision exists yet because no real essay has changed.
- **Architect.** Login and publishing were deliberately not touched and not tested. You still need to confirm both work after the last deploy.
- **Screen readers.** The audit is automated (structure, names, contrast, focus, landmarks, headings). It is not a substitute for manual testing with assistive technology.

## Limitations and judgment calls

1. **Capture sees only the site's published text** (`feed.xml`). Edits made only on Substack are not seen.
2. **Classification is manual.** Capture records *that* text changed and *what* changed; a person must say what kind of change it was and why. Until then it displays as “Awaiting classification”.
3. **Policies are drafts the owner has not seen in public.** The wording is held back (private preview only) because the repository is public and an unapproved policy must not look official.
4. **Contact form does not exist.** No secure endpoint is available, so the concern composer prepares a message and says plainly that nothing is sent.
5. **Reference lists contain literal Markdown asterisks** (for example `*Nature, 642*`) in the published essays. They are reproduced as published.
6. **The demonstration record** (a fictional essay, revision and correction) is clearly labelled and exists only in the private preview.
7. **Metadata Confirmed is a low bar.** It shows a work exists as cited. It says nothing about whether the essay represents the work correctly, and the Ledger's wording says so.

## Bugs found and fixed while building

Syntax error in the app script; mobile horizontal overflow (timeline labels, then hidden text inside scrolling tables); home page crash from passing a map index as an element tag; Evidence Registry rendering blank (array passed to `replaceChildren`); garbled revision table; inspector crash on auto-created sources with no observations; skip link unreachable on first load because focus was stolen; heading-level jumps and a missing page heading on the correction view; the capture step writing to the real registry when run on temporary data; workflow triggering on every feature-branch push.

## Rollback

Nothing is merged. To abandon the feature: delete the branch. After a merge, reverting the merge removes the page; the only edits to existing files are small and additive (`build_published.py`, `build_research_index.py`, two JS link lines, the workflow, and `ledgerUrl` in the research index), and each is inert without the Ledger page.
