# The Learning Institute: build and test report (2026-10-16)

## What exists
- `/learning-institute/`: interactive app (home, pathway library, course pages, lesson reader, Learning Compass, Journey Map, Research Seminar, My learning, How it works).
- Two complete courses: **Introduction to Consciousness** (8 lessons) and **Foundations of Artificial Intelligence** (8 lessons). 16 lessons, 64 knowledge checks (objective checks with per-option feedback, plus a reflection per lesson), about 6,800 words of original lesson text, 39 source records.
- Six planned pathways (003 to 008) are listed and clearly labelled "Planned". They have no lessons, are not in search, are not in the sitemap and cannot be started.
- Research Seminar S001, "Can Artificial Intelligence Be Conscious?" (seven stages, primary sources, not accredited).
- Static plain-text pages for every published course and lesson under `/learning-institute/courses/` (crawlable, JSON-LD `LearningResource` with no accreditation claims), added to the sitemap.
- Data in `data/`: courses, lessons, assessments, sources, glossary, learning-pathways, seminars. Interface code never contains course content.
- Search: published courses and lessons are indexed in the shared research index (`inquiry-engine/data`). Planned courses are not.
- Inquiry Engine: its "Continue" step suggests matching lessons ("Learn the foundations"); every lesson has "Investigate This Further" back to the Engine.
- Reading Desk: lessons and courses are saved in the same `ai_desk_v1` key and shape; the main site's Reading Desk shows them. Unknown items are preserved.
- Progress: `ai_learn_v1` in the browser only. No accounts, nothing sent anywhere. Delete and export controls included.

## How content was kept honest
- Sources are only records already verified on this site (Lexicon, Theory Chamber, Observatory, Archive) plus six checked for this course (Rumelhart 1986, LeCun 2015, NIST AI RMF via Crossref; Vaswani 2017 on arXiv; Ouyang 2022 and Mitchell and Krakauer 2022 confirmed by search results, cited as arXiv). Each source shows how it was checked and flags preprints.
- Lexicon terms link to the Lexicon and use its definitions; the 25 course-only terms are labelled as defined for the course.
- Contested questions are presented as contested; reflection questions show discussion points, never grades.

## Tests run (all passed)
- Browser (Playwright, 66 checks): home, library filters, course pages, all 16 lessons render sections A to J with activity and 3+ checks, term popovers, checks with feedback, reflection saving, progress and the Continue card, Compass recommendations, Journey Map (map and list), Seminar, My learning, delete, completion record, missing-lesson page, 390px width.
- Working activities: overfitting explorer, tiny-network trainer (XOR fails with no hidden units and is learned with 3), toy language model.
- Accessibility (custom checks on 15 views): one h1, main landmark, accessible names on all controls, no duplicate ids, no skipped heading levels, text contrast at least 4.5:1, keyboard operation of term popovers (Enter, Escape), no horizontal scroll at 320px.
- Data safety: a new essay in the manifest appears only as "Suggested, not reviewed"; lesson text and checks do not change. A lesson revision keeps progress and reflections and shows a notice. A lesson missing from the data does not break the course page.
- Search, Inquiry Engine and Reading Desk regression tests re-run after the change.

## Not tested, or needs a person
- Real screen readers (NVDA, JAWS, VoiceOver); axe-core could not be installed here, so automated WCAG scanning was replaced by the custom checks above.
- Safari and Firefox; real phones.
- The live GitHub Pages deployment and the Actions run that rebuilds the index and sitemap.
- Content has had no outside expert review. Every course says "Awaiting editorial review". Please read the lessons before treating them as final.
- Architect-managed course editing is not built. It needs a secure backend design and your approval; nothing here touches Architect.
- Lessons are written to a foundations level at roughly 400 words of core text each plus an example; they are real but not exhaustive. More depth, images and audio are future work.
