# Case Grid: preview report

Status: **preview branch only** (`feature/theory-case-grid`). The page is marked `noindex`, is not in the sitemap, and the only change to an existing file is one added line in the homepage Explore menu. Nothing on `main` has been changed by this branch.

## What this branch adds
- `theory-grid/` with `index.html`, `styles.css`, `app.js`, and `data/cases.json`. The page reads the Theory Chamber's `theories.json` and `sources.json`; it does not copy them.
- One line in `index.html`: the Explore menu entry "Case Grid" under "Theory Chamber".
- `scripts/validate_theory_grid.py`: checks every theory-by-case pairing has a cell, every claim id and source id exists and belongs to the right theory, every cell has a question, and no cell uses verdict, score, or ranking wording.
- `scripts/theory-grid-tests/test_theory_grid.py`: 26 browser and data tests (see below).
- `scripts/build_theory_grid_preview.py`: builds a single-file private preview with the data inlined.

## What the page does
Four cases (a bat, a simple thermostat, an image seen versus missed, a chatbot built on a language model) against the six theories already recorded in the Theory Chamber. For each pairing it shows what the theory looks at, the question it raises for the case, and whatever the Theory Chamber has on file for that pairing (recorded predictions, mechanisms, criticisms, or the 2023 AI assessment). An overview table shows which of the 24 pairings have anything on file. Where nothing is on file the page says so.

## How the content was prepared
- Theory descriptions, predictions, criticisms and AI assessments are quoted from the Theory Chamber records unchanged, with their source chips and "what was read" notes. A test checks the displayed text equals the record text.
- The framing questions, case descriptions and one-line "looks at" summaries are this site's own wording. They are written as questions, restate each theory's recorded condition, and give no verdict. The validator rejects verdict, score and ranking wording.
- One source was added: Nagel 1974 (passages used were read in the text), for the bat case.
- No scores, rankings or consensus figures anywhere.

## Known limits
- Every record the page draws on is Awaiting Evidence Review. None was read in full by a person.
- The thermostat and chatbot descriptions are plain descriptions without a source. The chatbot assessments rest on the abstract of one 2023 report.
- Recurrent processing theory is described from a secondary source; higher-order theories and predictive processing have thin records. The page shows the gaps the Theory Chamber lists.
- Framing questions have not been reviewed by an editor.

## Tests run
26 tests: validator and its rejection cases, each case renders six theories, records match exactly, deep links and invalid hashes, overview buttons, keyboard use, no horizontal overflow at 320/390/820/1280 px, phone and desktop collapsing behavior, preview mode makes no data requests, load failure message, no stray placeholders, Explore menu link on desktop and phone, homepage change is exactly one added line, internal links resolve. The existing suites (`run_all.py`) and the menu and chip checks were re-run on this branch.

## Not yet done (waits for approval)
- Editorial review of the framing questions and case wording.
- Remove `noindex`, add the page to the sitemap, add Atlas and Theory Chamber back-links, and add Reading Desk saving if wanted.
- Manual screen-reader and full keyboard walkthrough.
