# Decisions only the owner can make

Nothing below has been decided on the owner's behalf. Until an item is approved, the Ledger shows it as “not yet approved” or leaves it switched off. Draft wording for the policies exists only in the owner's private preview, not in this repository.

## A. Before anything goes live

| # | Decision | Default until decided |
|---|----------|----------------------|
| 1 | Merge `feature/research-ledger` and deploy the `/research-ledger/` page | Not merged; nothing is live |
| 2 | Add the Ledger to the sitemap | Not added |
| 3 | Add Ledger links to the navigation / homepage (a ready patch is in `docs/research-ledger/patches/`) | Not applied; navigation and homepage unchanged |
| 4 | Switch on the “Research Record” link on essay pages (`articlePageLinks` in `research-ledger/data/config.json`) | Off; essay pages are unchanged |
| 5 | Confirm that the Architect login and a real publish still work after your last deploy | Untested by me; the Ledger does not touch either |

## B. Methodology policies (POL-01 to POL-11)

None is approved. For each, the Ledger will say so until you approve it, and a validator rule refuses an “approved” policy without an approver and date. The private preview shows draft wording for each; the questions that wording depends on are:

- **POL-01 Authorship.** Who is credited: a named person, “Artificially Intelligent”, or Amaris.Studio? Are contributors credited by name? Does the credit also appear on the essay page?
- **POL-02 Source selection.** Are encyclopaedias, blog posts or company reports ever acceptable, and under what label? Must a source be openly accessible? May a preprint be the only source for an empirical claim?
- **POL-03 Source verification.** Who may record a verification level (only you, or named assistants)? Must every source reach Full Source Reviewed, or only those carrying a central claim? How soon after publication?
- **POL-04 Evidence classification.** Should historical descriptions currently labelled “empirical” be reclassified once reviewed? Which claims must be mapped before an essay is called Editorially Reviewed?
- **POL-05 Editorial review.** Which steps must be complete before publication and which may follow? Who is the editor and how is the reviewer named publicly? Should “Review Completed With Limitations” be available?
- **POL-06 Revisions.** How quickly should a detected change be classified? Is every change explained publicly or only substantive ones?
- **POL-07 Corrections.** Which changes deserve a notice on the essay page? Do you want to commit to a response time? Who decides whether a report becomes a correction?
- **POL-08 Research in development.** Should in-development ideas be visible anywhere in the Ledger?
- **POL-09 AI assistance.** How was AI used in writing and researching each published essay? Where is that disclosed (essay, Ledger, both)? Do AI-assisted source checks count toward a verification level?
- **POL-10 Conflicts of interest.** Are there interests to disclose for the existing essays? Do you accept sponsorship, affiliate income or paid collaboration?
- **POL-11 Contact and concerns.** Which channel: an email address, a form served by Architect, Substack comments, or GitHub issues (public)?

## C. Choices about how the Ledger operates

1. **Concern channel.** The Ledger cannot receive reports: no secure submission endpoint exists, and it says so. Options: an Architect-served form (see the proposal), a published email address, or the public GitHub-issues route (`concernChannels.githubIssues.enabled`; anything sent there is visible to everyone).
2. **Substack.** Is the Substack post or the site essay the authoritative version? Should the Ledger capture Substack text separately? Today only the site's own published text (`feed.xml`) is captured.
3. **Classifying changes.** Capture records changes as *unclassified*. Who classifies and explains them, and where is that done? (Until Architect integration exists, by editing the JSON record.)
4. **Honest labels already on the records.** All 20 source records and 23 claim records were prepared during construction with AI assistance and have not been re-checked by a human editor; each says so. 9 of the 20 sources are still “Verification Incomplete”. All 23 claim-to-source links are “Not assessed”. You may want to review or relabel these before the Ledger goes public.
5. **Metadata check.** Allow `scripts/verify_ledger_sources.py` to run (by hand, or as a manual-trigger workflow)? It would record automated Metadata Confirmed entries for sources with a DOI or arXiv id, labelled as automated.
6. **The branch `feature/listening-room`** still holds the shelved Listening Room code. Delete it, or keep it?
7. **Reference lists.** The published essays' reference lists contain literal Markdown asterisks (for example `*Nature, 642*`). They are copied faithfully into the Ledger; correcting them would be an editorial change to the essays and so is yours to decide (and would appear in the Ledger as a documented revision).

## D. For the Architect

See [ARCHITECT-INTEGRATION-PROPOSAL.md](ARCHITECT-INTEGRATION-PROPOSAL.md). Questions to answer before any work: does the Architect's publish API expose an updated-at or version field; should it be able to open pull requests on this repository; and who is permitted to record a correction.
