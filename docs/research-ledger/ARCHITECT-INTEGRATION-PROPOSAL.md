# Architect integration: proposal only

**Status: proposal. Nothing here is built, and nothing in the Ledger reads, calls or changes the Architect's authentication or publishing backend.** This document describes one way the Architect could later write Ledger records, so the owner can accept, change or reject it.

## Constraint

The Ledger is a public static page backed by JSON files in a public repository. Anything an editor does (classify a revision, record a correction, mark a review, record a source verification) must therefore end up as a validated change to those JSON files. It must not be possible for a visitor to do any of it.

## Proposed shape

1. **No admin controls on the public page.** The Ledger page stays read-only. No keys, tokens or endpoints that grant write access are placed in public JavaScript.
2. **Server-side only.** The Architect's authenticated area gets a small function that takes an editor's input (for example “classify RVN-007 as Clarification, because …”). It checks the editor is logged in with the Architect's existing authentication (unchanged), validates the input against the same rules as `validate_research_ledger.py`, and writes the record.
3. **Writes go through review.** The function opens a pull request against the repository using a GitHub credential stored only in the server environment, not by pushing to `main`. The existing validator runs on the pull request. The owner merges. This keeps a public, reviewable trail of every editorial record, which suits a ledger.
4. **Publish-time hook.** When the Architect publishes or updates an essay, it could call the same function to record `publishedAt`/`updatedAt` for that publication, so the Ledger no longer has to infer the date from the feed. Capture would still compare text, so an edit made outside the Architect is not missed.
5. **Concern form.** The same server area could host the “report a concern” form (writing to a private store, not the public repository) and give the Ledger a secure `concernChannels.endpoint`. Until then the Ledger says it cannot receive reports.

## What must not happen

- No credential, token or write endpoint in public JavaScript or in the public repository.
- No change to how the Architect logs people in, or to the existing publishing flow, as part of this work.
- No automatic classification of a change, no automatic correction notice, and no editing of an existing snapshot. Snapshots are append-only; the validator detects tampering.
- No record may claim a review, correction or verification that a named person did not make.

## Questions that decide the design

1. Does the Architect's publish API expose an `updatedAt` or version identifier for an essay? (Not known; I cannot inspect the Architect from here.)
2. May the Architect hold a GitHub credential that can open pull requests on `AmarisCT/Artificially-Intelligent`, and where would it be stored?
3. Who is allowed to record a correction, and does a second person need to approve it?
4. Should corrections made in the Architect appear immediately, or only after the pull request is merged and the site redeploys (the safer default)?

## Rough order of work, if approved

1. Read-only: the Architect shows an editor the Ledger's “unclassified changes” list.
2. Classification and reason, as a pull request.
3. Corrections and review records, as a pull request.
4. Publish-time `updatedAt` hook.
5. Secure concern endpoint.
