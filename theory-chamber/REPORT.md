# Theory Chamber: preview report

Status: **preview branch only**. Not linked from the site navigation, not in the sitemap, marked `noindex`. Nothing on `main` has been changed by this branch.

## What this branch adds
- `theory-chamber/` with `index.html`, `styles.css`, `app.js`, and structured data in `data/` (`theories.json`, `sources.json`, `concepts.json`, `comparisons.json`, `questions.json`).
- `scripts/validate_theory_chamber.py`: checks required fields, unknown or duplicate IDs and DOIs, claims without sources, missing descriptions, metadata-only sources, and counts claims still awaiting review. Run `python3 scripts/validate_theory_chamber.py` (add `--online` to check DOIs against Crossref).
- No workflow, sitemap, feed, backend, or Architect file is touched.

## How content was prepared
Six frameworks (GNWT, IIT, higher-order theories, recurrent processing theory, attention schema theory, predictive processing) have structured records. Each claim carries one or more source IDs. Sources were looked up on 2026-10-15 through publisher, repository, and open-access pages. Descriptions are paraphrases of what those pages said. Every source record states what was actually read (`access` and `read` fields).

## Verification status of the 17 sources
- Bibliographic details confirmed from a retrieved page: all except where noted below.
- Abstract or page text read: Seth and Bayne 2022; Dehaene and Changeux 2011; Mashour et al. 2020; Dehaene et al. 1998; Tononi 2004; Albantakis et al. 2023; Melloni et al. 2023; Cogitate 2025 (abstract level); Doerig et al. 2019 (abstract level); Lau and Rosenthal 2011 (summary only); Graziano and Webb 2015; Hohwy and Seth 2020; Butlin et al. 2023 (arXiv abstract).
- **Metadata only, content not read:** Tononi et al. 2016; Lamme 2006. No claim rests on their text.
- **Secondary:** a Closer To Truth web entry (used only as a pointer for RPT) and a Scientific American news report (used only to document that a dispute exists).
- Not verified: the final page range of Dehaene and Changeux 2011; the Doerig DOI differs from one sometimes quoted (the record uses the retrieved one, 10.1016/j.concog.2019.04.002).
- The pages were retrieved and summarized by an automated reader. None of the papers was read in full by a person, so **every record is marked Awaiting Evidence Review**.

## Known gaps (shown in the interface as Awaiting Evidence Review)
- Higher-order theories: the separate higher-order variants are not distinguished; no specific predictions recorded.
- Recurrent processing theory: described from a secondary source; primary abstract not read; no predictions or supporting studies.
- Predictive processing: no mechanisms, predictions, supporting evidence, or criticisms recorded.
- Only one pair (GNWT and IIT) has a full contrast record, taken from the adversarial-collaboration protocol. Two other pairs have limited records. All other pairs show an explicit empty state.
- No numerical scores, rankings, or consensus figures anywhere.

## Interface tests run (local browser, 1920, 1366, 820, 390 px)
Theory search and perspective filter; adding two theories to the tray; comparison URLs for GNWT/IIT, HOT/AST, RPT/PP; swap; changing a theory in place; highlight controls; expand and collapse; source inspector open and Escape to close; evidence filters; concept diagram selection both ways; question detail; mobile Theory A / B / side-by-side tabs; invalid pair falls back safely; Reading Desk save leaves existing items and the `last` field intact. No horizontal overflow and no script errors in these runs.

## Not yet done
- Manual screen-reader and full keyboard walkthrough; formal WCAG audit.
- Live-site link checks (cross-links to the Atlas, Inquiry Room, and article pages are built from the main site's hash routes and need checking after deployment).
- Integration: navigation entry, Atlas back-links, Reading Desk display of saved theories, sitemap entry, removing `noindex`. These wait for approval.
- Editorial review of every record against the full papers.

## Article connections
The page reads `../research/published/manifest.json`. Essays that name a theory in their text are linked as such. Other essays appear only as "suggested topic connections" based on shared Atlas topics and are never classified as supporting or refuting a theory. New essays appear after the existing 6-hourly feed refresh.
