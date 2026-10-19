# The Research Ledger

> Knowledge is not static. Its development should remain visible.

The Ledger is a public record of what Artificially Intelligent has published, what each publication relies on, how its text has changed since the Ledger first saw it, and what has been corrected. It is a static feature of the site (no server, no database, no login), built from plain JSON records that live in the repository.

Page: `/research-ledger/` (not linked from the navigation, the homepage or the sitemap until the owner approves; see [APPROVALS.md](APPROVALS.md)).

## What it will and will not say

The Ledger only shows what it can show. It does not claim peer review for the site's own essays, does not invent revisions, corrections, reviews or verifications, and does not turn an empty record into a reassuring one. The two honest empty states are fixed strings:

- “No documented revisions are available for this publication.”
- “No formal corrections have been recorded in this Ledger.”

Version history **begins on the date the Ledger first captured a publication** (2026-10-17 for both current essays). Anything earlier is not reconstructed, and the page says so.

## Layout

```
research-ledger/
  index.html  styles.css  app.js  diff.js     the page (hash-routed; DOM built with textContent only)
  data/
    config.json            public settings (preview=false, articlePageLinks=false, concern channels off)
    taxonomy.json          verification levels, evidence/claim types, change categories, review states, statuses
    id-registry.json       every id ever issued (ids are never reused)
    ledger.json            compiled index the page loads (generated)
    ledger-status.json     when the Ledger last compared the public text (the only file that changes on a quiet run)
    publications/PUB-###.json   one per published essay
    sources/SRC-###.json        one per cited source, with verification history
    claims/CLM-###.json         claims, each linked to sources with a support assessment
    reviews/RVW-###.json        editorial review records (none completed yet)
    revisions/RVN-###.json      documented changes (none yet)
    corrections/COR-###.json    formal corrections (none yet)
    snapshots/<slug>/           saved normalised text of each version, plus a log
    timeline/events.json        dated events that appear in the Research Timeline
    policies/methodology.json   the 11 methodology policies (0 approved)
    article-notices.json        approved, prominent corrections the essay pages may show (empty)
scripts/
  ledger_lib.py                       shared helpers (ids, hashing, canonical JSON)
  seed_research_ledger.py             one-off first population from the existing site data
  capture_public_revisions.py         version capture (see below)
  verify_ledger_sources.py            optional Crossref/DataCite/arXiv metadata check (manual)
  validate_research_ledger.py         the validator: refuses dishonest or inconsistent records
  build_research_ledger.py            rebuilds ledger.json from the records
  build_ledger_preview.py             private preview builder (adds owner drafts and a clearly fictional demo)
  research-ledger-tests/              tests (run_all.py runs everything)
```

## Identifiers

`PUB-` publication · `SRC-` source · `CLM-` claim · `RVW-` review · `RVN-` revision · `COR-` correction · `EVT-` timeline event. Numbers are issued from `id-registry.json` and never reused, even if a record is later withdrawn.

## Version capture

`capture_public_revisions.py` reads `feed.xml` (the same public source the essay pages are built from), never git history.

1. The public text is split into normalised blocks (title, deck, category, body, sources), turned into canonical JSON and hashed with SHA-256.
2. **Unchanged hash → nothing is written.** A scheduled rebuild therefore never creates a revision.
3. **Changed hash → pending.** The change is only recorded when the same new text is seen again on a later run at least 30 minutes after the first sighting (`--confirm-now` skips the wait; nothing else does). This guards against a half-published or transient feed.
4. A confirmed change saves a snapshot and an **unclassified** revision record. The script never decides what a change means. A person classifies it (Typographical, Clarification, Source Addition, Evidence Update, Substantive Revision, Correction, Retraction …) and writes the reason.
5. If the feed cannot be read, the script exits with an error and leaves every record as it was.

The refresh-feed workflow runs this step with `continue-on-error`, validates, rebuilds, and discards the run if anything fails.

## Public and private

The repository is public, so anything committed is public. Therefore:

- **Unapproved policy wording is not in the repository.** The 11 policies are published as titles and “not yet approved” statuses only. Draft wording lives in `scripts/research-ledger-src/policy-drafts.json`, which is git-ignored, and appears only in the owner's private preview (`build_ledger_preview.py --include-drafts` / the private Artifact).
- The **demonstration record** (a fictional essay with a fictional revision and correction, ids prefixed `DEMO-`) is built in a temporary directory by the real capture pipeline, is excluded from every count, and is never committed. It exists so the revision, comparison and correction screens can be seen working.
- The validator fails the build if `preview` is true in committed data or if draft policy text appears in public data.

## Running things

```
python3 scripts/capture_public_revisions.py              # compare feed.xml with saved versions
python3 scripts/validate_research_ledger.py              # refuse inconsistent or dishonest records
python3 scripts/build_research_ledger.py                 # regenerate research-ledger/data/ledger.json
python3 scripts/verify_ledger_sources.py                 # dry run: report what the metadata check would record
python3 scripts/verify_ledger_sources.py --apply         # write Metadata Confirmed entries / observations
python3 -I scripts/research-ledger-tests/run_all.py      # every check
```

`verify_ledger_sources.py` can establish only that a DOI or arXiv id exists and that its title and year match the printed citation. That is **Metadata Confirmed**, the first rung above “Verification Incomplete”. It never reaches Abstract Reviewed or higher, never checks retractions, and records a mismatch as an open observation, not a verification. It could not be run against the live services in the build environment (outbound access to them is blocked); it is tested with canned responses only.

## Integration with the rest of the site

All additive, all inert until the Ledger page itself is deployed:

- `scripts/build_published.py`: an approved, prominent correction adds a correction notice to the essay page; a “Research Record” link is added only when `articlePageLinks` is true (off). With today's data the generated essay pages are byte-identical to the committed ones.
- `scripts/build_research_index.py`: each article in the shared research index gains `ledgerUrl`, so Inquiry Engine cards and Search results can show “View Research Record →”.
- `.github/workflows/refresh-feed.yml`: runs the Ledger step on the schedule; `push` is limited to `main` so feature branches do not trigger it.
- `docs/research-ledger/patches/index-html-ledger-links.patch`: a **proposed** homepage patch, not applied.

## The Architect

Nothing in the Ledger touches Architect authentication or the publishing backend. How Architect could write Ledger records in future is described, as a proposal only, in [ARCHITECT-INTEGRATION-PROPOSAL.md](ARCHITECT-INTEGRATION-PROPOSAL.md).
