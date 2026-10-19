# The Research Commons

A curated space where visitors can propose research questions, recommend scholarship, suggest research topics and offer reasoned philosophical perspectives to *Artificially Intelligent*. It is not a forum. There is no unmoderated posting, no comments, no likes, no followers and no popularity ranking.

**Status of this branch (`feature/research-commons`): built and tested as a static site feature, not live, not linked from the site, not indexed.** Nothing here has been merged, deployed, added to the sitemap or added to navigation. Those need the owner's approval (see [APPROVALS.md](APPROVALS.md)).

## What is built, and what is only specified

| Part | State | Where |
|---|---|---|
| Public Commons page: hero, five actions, Contribution Portal, library, correspondence, Question Constellation, Open Inquiries, Featured Inquiry, honest-status page | **Built**, tested in a real browser (desktop and 390 px phone) | `research-commons/` |
| Library of approved contributions: filters, no popularity ranking, withdrawn tombstones, one static crawlable page per approved record | **Built**. The library is empty, because nothing has been approved | `research-commons/data/`, `scripts/build_research_commons.py` |
| Question Constellation with list alternative, search, filters, zoom and pan, labelled edges | **Built** | `research-commons/constellation.js` |
| Submission forms (question, publication, topic, perspective) with client validation that mirrors the server rules | **Built, but switched off.** They become active only when a secure submission service exists and the owner has approved the guidelines | `research-commons/app.js` |
| Shared research index, Universal Search, Inquiry Engine hooks | **Built**, inert until a contribution is approved | `scripts/build_research_index.py`, `search/`, `inquiry-engine/` |
| Submission API contract and a runnable reference implementation of it | **Built** as a specification you can run, with 45 conformance cases | `scripts/commons_contract.py`, `contract/conformance-cases.json` |
| Importer for approved contributions | **Built** (`scripts/sync_commons.py`), strict, tested | `scripts/sync_commons.py` |
| Private interactive preview, with a simulated service and demonstration records | **Built**, private Artifact only | `scripts/build_commons_preview.py` |
| **Receiving submission service** | **Not built.** The Architect backend is hosted outside this repository and serves only `GET /api/public/articles` today | [CONTRACT.md](CONTRACT.md) |
| **Architect moderation inbox** (login-only review, approve, decline, withdraw, export) | **Not built.** Specified in full | [ARCHITECT-MODERATION-SPEC.md](ARCHITECT-MODERATION-SPEC.md) |
| Contribution guidelines, consent and rights wording | **Drafted for the owner's approval, not adopted.** Not in this repository (it is public) | [APPROVALS.md](APPROVALS.md) |

Nothing in the public page claims otherwise: until a service exists the page says plainly that no submission can be sent, and it shows no invented contributions, counts or activity.

## Principles the code enforces

1. **No unmoderated publication.** The endpoint can only create a private *submitted* record. A contribution becomes public only when an editor approves it in the moderation system, and the approved export is imported by `sync_commons.py`.
2. **Two environments.** The private submission environment (Architect, behind its login) holds originals, private notes and moderation history. The public library holds only what an editor approved: text, subject, date, the credit the contributor chose. No contact details, no IP address, no notes, no flags. A validator fails the build if a public record contains a private-looking field.
3. **One inbox.** Questions use the Unanswered Archive's existing endpoint format. There is no second, duplicate service. Archive statuses are never changed by a contribution.
4. **Honest labels.** A contribution is always shown as a visitor's: not original research from Artificially Intelligent, not peer reviewed, not evidence. A relationship between records is shown as *editorial*, *automated suggestion* or *preliminary*, never as established fact.
5. **Nothing invented.** No demonstration record can reach public data. Demonstration records exist only in the owner's private preview, carry `DEMO-` ids, are labelled, and are excluded from every count.
6. **Unapproved legal wording stays out.** The repository is public, so draft consent and rights text lives only in a gitignored owner file and the private preview. The validator enforces both directions: approved wording requires `guidelinesApproved: true`, and `true` requires approved wording.

## Running things

```bash
python3 scripts/research-commons-tests/run_all.py              # everything below, one summary
python3 scripts/research-commons-tests/run_all.py --skip-browser

python3 scripts/validate_research_commons.py                   # validate the public data (0 errors, 0 warnings required)
python3 scripts/build_research_commons.py                      # regenerate status + one static page per approved record
python3 scripts/build_research_commons.py --check              # fail if committed output is stale
python3 scripts/build_research_commons.py --list-urls          # URLs it would add to a sitemap (it never edits the sitemap)
python3 scripts/commons_conformance.py                         # run the 45 contract cases against the reference implementation
python3 scripts/commons_conformance.py --base https://… --stateful   # run them against a real service once one exists
python3 scripts/sync_commons.py --from-file approved.json --dry-run  # import an editor-approved export
python3 scripts/build_commons_preview.py --artifact out.html   # rebuild the owner's private preview
```

Python 3.10+ and, for the browser tests only, Playwright with Chromium. No third-party runtime dependency; the site itself is static files.

## File map

```
research-commons/            the public feature (index.html, app.js, constellation.js, styles.css, config.json, data/*.json, c/ (static pages))
  data/public-contributions.json   approved records only (empty)
  data/contribution-relations.json editorial relationships between approved records and the rest of the research (empty)
  data/collections.json            editorial collections (all planned, none have members)
  data/taxonomy.json               types, subjects, lifecycle, public statuses, attribution modes
  data/commons-status.json         derived counts and "are submissions open" (generated)
  config.json                      endpoints (all null), guidelinesApproved:false, featured inquiry, preview:false
scripts/                     commons_contract.py (reference contract), commons_conformance.py, commons_lib.py (public-record rules),
                             validate_research_commons.py, build_research_commons.py, sync_commons.py, build_commons_preview.py, commons_demo.py
scripts/research-commons-tests/   test_pipeline.py, test_ui.py, test_shared.py, a11y_audit.py, run_all.py
docs/research-commons/       these documents, contract/conformance-cases.json, patches/
```

Existing systems that were extended additively (each still passes its own checks, and behaves as before while there are no approved contributions): `scripts/build_research_index.py` (adds the inert `contribution` type), `search/` (labels and lists contributions last), `inquiry-engine/` (labels a contribution if the visitor expands to one; contributions are never part of the starting map or the guided answer).

The Architect login and publishing backend, the public research systems, the homepage, the navigation, the sitemap and `unanswered-archive/` are untouched.
