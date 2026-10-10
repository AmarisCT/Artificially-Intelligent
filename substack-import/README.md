# Artificially Intelligent: Substack Import Package

Status: **Prepared, not imported into Substack**

This folder prepares 24 unfinished research articles for Substack, using the exact article body `research in development` and a link back to each article's Data Stream view.

## Files

- `research-in-development.xml`: an RSS 2.0 feed containing exactly 24 articles. **This is not the existing `feed.xml` used for the published archive.**
- `articles.json`: one-to-one article ID mappings between Data Stream and the corresponding future Substack post URL.

Import URL: https://amarisct.github.io/Artificially-Intelligent/substack-import/research-in-development.xml

## Important publishing behavior

Substack's import tool can accept an RSS feed. When you confirm Import, imported posts become published web posts on Substack, not unpublished drafts. The import must only be started after explicit review and approval. Imported posts do not automatically email subscribers. Use Substack's Posts section if you later choose to email a post separately.

## Manual import steps

1. Sign in to https://artificialxintelligence.substack.com/ and open your publication dashboard.
2. Open **Settings** and choose **Import/Export**, then **Import posts**.
3. Paste the import URL listed above.
4. Review the discovered post count, titles, body text, and accessibility.
5. Only when you're ready for public Substack publication, choose **Import**.
6. Check that all 24 imported web posts exist and that their Data Stream links work.
7. Copy each actual Substack post URL into its matching `substack_url` field in `articles.json` and set `substack_status` to `published`. This activates reciprocal links in the GitHub Data Stream.
8. Keep future revisions coordinated manually. RSS import is **not** continuous two-way synchronization, and importing the same items again may create duplicates unless the update-existing option is chosen.

## Editorial safeguards

- Importing the 24 placeholders does not change the existing Data Stream API or Architect database.
- The `feed.xml` file remains unchanged and only contains the existing published research.
- Do not re-import the development feed without first reviewing duplicate and update behavior.
- The placeholders are intentionally not sent to subscribers at preparation time.
