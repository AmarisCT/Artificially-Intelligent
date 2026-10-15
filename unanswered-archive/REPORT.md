# The Unanswered Archive: preview report

Status: private preview on branch `unanswered-archive-preview`. `noindex`, not linked from the site, not in the sitemap. No change to Architect, the backend, workflows or the sitemap generator.

## What is in it
- 25 questions (the 24 from the brief, plus Q025 "Is self-awareness necessary for intelligence?", added as a proposed question and marked unreviewed).
- 5 reviewed investigations (Q001, Q002, Q003, Q008, Q009) with sections A to H. The other 20 are "Awaiting Research Review" and contain no findings.
- 6 statuses with fixed definitions. A question can carry more than one. Each reviewed status has a written justification and review date.
- Question network: 37 editorial relations, each with a type and a stated reason. No causal claims.
- Two history timelines (Can machines think? / How can consciousness be studied?), each entry tied to a source.
- Search (titles, concepts, theories, summaries, categories), subject and status filters, sorting by subject, latest review, or date added. Counts are computed, not claimed.
- Theory Chamber links (comparison and theory pages) use stable ids. Reading Desk saves questions and sources into the existing browser-local store without touching other entries.
- Suggested related articles come from the public manifest by keyword and topic match and are labelled as unreviewed suggestions. They never change a status.
- Suggest a Question: a working form (validation, honeypot, time check, consent, no personal data collected) under the library, on the Statuses page and at `#suggest`. Sending is switched off because Architect has no endpoint to receive questions; see `SUBMISSIONS.md` for the exact contract and the prompt to give whoever builds Architect. The send path was tested against a mock endpoint only.

## Sources
20 sources, 14 reused from the Theory Chamber and 6 new: Turing 1950, McCarthy et al. 1955 (Dartmouth proposal), Searle 1980, Chalmers 1995, Nagel 1974, Brown et al. 2020. Each source records what was actually read; most were read at abstract level. Turing's DOI and page range, the Dartmouth volume and the Nagel journal version were not confirmed and are omitted.

## Known gaps
- "Emerging Research" has no category yet because no reviewed question belongs there.
- Earlier philosophical history of "Can machines think?" is not included because no verified source was read.
- The Theory Chamber does not yet link back to archive questions (needs a small change to that page after approval).
- The main-site Reading Desk does not yet display question and source items; it hides unknown kinds rather than deleting them.
- Not yet checked: screen-reader pass, live link checks, tablet widths.

## To go live
Copy `unanswered-archive/` to main, remove `noindex`, add canonical and Open Graph tags, add a nav entry, add `/unanswered-archive/` to `scripts/build_published.py` and the sitemap files, add reverse links in the Theory Chamber, extend the main Reading Desk.
