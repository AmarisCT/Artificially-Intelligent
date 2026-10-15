# The Museum of Human Memory: preview report

Status: private preview on branch `museum-preview`. Not linked from the site, `noindex`, not in the sitemap, no workflow or backend changes.

- 7 rooms, 7 objects, 10 sources, each read on 15 October 2026.
- Every factual line carries a source button. The interpretive "reading" in each room and the artwork are labelled as the exhibit's own.
- Differences between sources (reign dates, tablet counts, discovery dates) are shown on the Notes page, not reconciled.
- Gaps: the Library of Congress personal-archiving page could not be fetched (robots), so only its 2010 news item was used; the British Museum K.3999 description is truncated at source; the GPT-3 paper was read at abstract level only.
- The Gutenberg survival ratio (49 of about 180) is used in the print artwork and labelled as such.

To go live: copy `museum/` to main, remove `noindex`, add canonical/OG, add a nav entry, add the URL to `scripts/build_published.py` and the sitemap.
