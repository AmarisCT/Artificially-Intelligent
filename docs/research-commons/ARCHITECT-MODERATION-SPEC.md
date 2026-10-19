# Architect moderation inbox: integration specification

**Status: specified, not built.** The Architect login and publishing backend is hosted outside this repository. I was not given access to it, did not modify it, and have not claimed that any part of this exists. This document is what the Architect (or whoever builds the receiving side) needs to implement so that the Research Commons works end to end without any unmoderated publication. It is written to reuse Architect's existing authentication and to add nothing public beyond the two POST endpoints in [CONTRACT.md](CONTRACT.md).

## 1. Principles

1. **Submission is not publication.** The public endpoints can only create a private record in state `submitted`. No public page, search entry, constellation node or feed item can come from a submission. Only an editor's explicit *Approve for public display* action creates a public record.
2. **Reuse Architect's authentication.** Every moderation screen and API sits behind the existing Architect login. No new account system, no public login, no moderator accounts on the public site.
3. **Two environments.** Private (this inbox, Architect) and public (`research-commons/data/*.json` in the repository). The only bridge is an *export* of approved records, which `scripts/sync_commons.py` validates and imports.
4. **Separate records, so the wrong thing can never leak.** Five different record kinds, never one row with a "public" flag (§3).
5. **The editor approves exact text.** What is published is what the editor saw on the approval screen, character for character. Editing is allowed only as a tracked edit, and the contributor's original is always kept.
6. **Nothing the visitor typed is trusted.** All of it is plain text, escaped on output everywhere, including inside Architect.

## 2. Public intake (already specified in CONTRACT.md)

`POST /api/public/contributions` and the legacy alias `POST /api/public/question-submissions`, unauthenticated, CORS limited to `https://amarisct.github.io`, rate limited, honeypot, minimum time, idempotent, validated twice. Responds `202 {"ok":true,"receipt":…}`. The existing `GET /api/public/articles` is untouched.

## 3. Records (private unless stated)

| Record | Holds | Visibility |
|---|---|---|
| **Submission** | The normalised content exactly as received, type, subject, attribution choice, consent version and time, idempotency key, sender-key hash (short retention), origin, system flags, receipt hash. Immutable after creation. | Private. Never exported. |
| **Moderation Record** | One per submission: state, assignee, private notes, decline reason (internal), clarification thread, similarity matches, decision history. Append-only audit entries (§6). | Private. Never exported. |
| **Public Contribution** | Created only by *Approve*. The fields in §5, including the approved text (which may be the original or a tracked edit), the editor's context note, subject, concepts, related research, collections, status, dates. | Exported. Public. |
| **Source Recommendation** | For `publication` submissions: the visitor's bibliographic details plus the editor's verification level and what was matched. A *copy* of the public fields lives inside the Public Contribution (`source`). | Private until approved; then the `source` object only. |
| **Editorial Relationship** | A link between a Public Contribution and another record, with its kind (`editorial` / `suggested` / `preliminary`), a one-sentence reason, and who set it. | Exported as `relations` when approved. |

A Submission is never edited, never made public, and never deleted except under the retention and erasure rules in §8.

## 4. States and transitions

`submitted → pending-review → (needs-clarification ⇄ pending-review) → accepted-for-consideration → approved-for-public-display`, with `declined` available from `pending-review`, `needs-clarification` and `accepted-for-consideration`, and `withdrawn` available after approval.

| State | Meaning | Visible to the visitor |
|---|---|---|
| `submitted` | Received. Nothing read yet. | No |
| `pending-review` | Waiting for an editor. | No |
| `needs-clarification` | An editor needs more information. | No (see §7) |
| `accepted-for-consideration` | Suitable to consider. **Not approval to publish.** | No |
| `approved-for-public-display` | An editor approved this exact text. | Yes: public record exists |
| `declined` | Not taken further. Never shown publicly, and the reason is never published. | No |
| `withdrawn` | Removed from public view at the contributor's request, or for a stated reason. | Yes: tombstone only |

After approval the public `status` may advance to `selected-for-investigation` or `incorporated` (still public), and may go to `withdrawn` at any time. A withdrawn record never returns; a corrected version is a new submission and a new id. Transitions not listed are refused by the server, not just hidden in the interface.

## 5. Approval and the public record

*Approve for public display* is a single guarded action that requires, on one screen:

- the exact approved text, shown beside the original, with a visible diff if the editor changed anything (then `Edited for clarity` is recorded; only light edits for clarity are allowed, never edits that change the meaning, and since there is no contact path by default (§7) a contribution that cannot be published as written is declined);
- a **subject** and any **Atlas concepts** (chosen from the shared index; unknown ids are refused);
- the **attribution**: `anonymous`, or the name the contributor chose, with `authorized: true` (the checkbox is ticked by the system from the stored attribution choice, not by the editor);
- for a publication: the bibliographic details, and a **verification level** (`unverified`, `metadata-confirmed` with a note saying what was matched, or `editor-reviewed`); none of these means peer reviewed;
- an optional **editorial context** note, always credited to *Artificially Intelligent* (the Commons never names moderators);
- optional collections, related research and open questions, written as plain sentences without links.

The server enforces the same rules as `scripts/commons_lib.py:check_contribution` (the single definition of what may be public). Public fields: `id` (`COM-0001`…), `type`, `title`, `text` (perspectives and, optionally, other types), `category`, `concepts`, `related`, `attribution`, `publishedOn`, `updatedOn`, `editorialContext`, `editorialContextBy`, `source`, `status`, `statusNote`, `collections`, `featured`, `openQuestions`, `respondsTo`, and for withdrawn records only `id`, `type`, `publishedOn`, `updatedOn`, `status`, `withdrawal {on, publicNote}`. **Anything else is refused.** In particular a public record can never carry an email, link inside approved text, IP address, notes, flags, reviewer identity, decline reason or receipt; the validator in this repository rejects those keys by name even if the service forgets.

Ids are assigned once and are permanent. `publishedOn` never changes.

## 6. Screens (login-only, inside Architect)

1. **Inbox**: counts by state; filter by type, subject, flags, age; oldest first by default. Never sorted by anything resembling popularity.
2. **Review**: the submission (escaped plain text), flags with their reasons, similarity matches against public items and other submissions, a link-safety panel for any URL (shown, not fetched), the visitor's attribution choice, consent version, private notes box, and the actions below.
3. **Actions**: *Request clarification*, *Accept for consideration*, *Decline* (internal reason required, never public), *Approve for public display* (the guarded form in §5), *Withdraw* (public note required), *Add editorial relationship*.
4. **Approved library**: edit editorial context, collections, relationships and public status; *Export*.
5. **Source recommendations**: the verification workflow for publications, with a one-way path to the Research Observatory *as a candidate for review*; a recommendation is never treated as reviewed or peer reviewed.
6. **Audit log**: read-only, filterable; no deletion.

Every action is a server-side authorised POST with CSRF protection. Disabled buttons are courtesy only.

## 7. Contact and clarification

The public form collects **no email address** by design, so a standard clarification reply is not possible by default. Options for the owner to decide (see [APPROVALS.md](APPROVALS.md)): (a) no contact path, so an unclear submission is simply declined or published only if self-explanatory; (b) an optional, separately consented contact field in the form that is stored only in the Moderation Record, never exported, and deleted after the decision. This repository ships (a); (b) requires the owner's approval and a form change.

## 8. Retention, erasure and withdrawal

- Declined and abandoned submissions are deleted after a retention period the owner chooses (a proposal is in APPROVALS.md). Approved submissions' originals are kept for the life of the public record, then deleted or anonymised on request.
- Sender-key hashes are deleted after the rate-limit window.
- **Withdrawal** is handled by an editor on request: public text is removed, the record becomes a tombstone, its static page and search entry are removed by the next build, and the contributor is not asked to explain. The tombstone says only that the item was withdrawn and when.
- Erasure requests cover the private record too, except the minimum audit entry that an action occurred.

## 9. Audit and security requirements

- Append-only audit entry for every state change: who, when, from state, to state, and the text hash at approval time. No deletion, even by administrators.
- Authorisation: any Architect-authenticated editor may moderate; only the owner role may approve, withdraw or export (the owner decides roles).
- Output escaping everywhere; Content-Security-Policy on moderation screens; links in submissions rendered inert (as plain text with the host shown) until an editor chooses to open one.
- Secrets for the endpoint (salt, signing keys) are server-side environment secrets, never in this repository or in page JavaScript.
- Rate-limit and abuse telemetry stores counts and hashes only.
- The public endpoints must be able to be switched off in one place, which returns the site to its current "no service" state without a redeploy (`contributionEndpoint: null`).

## 10. Export

`GET` (login-only, owner role) or a manual download from the Approved library produces:

```json
{ "contributions": [ <Public Contribution>… ], "relations": [ { "a": "contrib:COM-0001", "b": "q:Q008", "kind": "editorial", "why": "…" } ] }
```

It is a complete snapshot of everything public, including withdrawn tombstones, sorted by id. Import today is manual and safe:

```bash
python3 scripts/sync_commons.py --from-file approved.json --dry-run     # validates the whole export, writes nothing
python3 scripts/sync_commons.py --from-file approved.json               # writes only if valid; a failed sync changes nothing
python3 scripts/build_research_commons.py                               # status + one static page per approved record, removes pages of withdrawn ones
python3 scripts/build_research_index.py . --atlas scripts/atlas_dump.json   # search/Inquiry Engine index
python3 scripts/research-commons-tests/run_all.py
```

The pull request that results is reviewed by the owner before merge. Automating step 1 (a scheduled import from a `syncEndpoint`) is possible later (`patches/refresh-feed-commons-step.patch`); it should open a pull request, not push to `main`, until the owner approves unattended publication.

## 11. What to test before launch

`python3 scripts/commons_conformance.py --base <service> --stateful` (45 cases, including rate limits and duplicates), a manual walk-through of every state transition, an attempt to submit script/HTML/very long text/unicode tricks and confirm it is displayed inert in Architect, and a withdrawal drill: approve a throwaway record on a staging copy, withdraw it, and confirm the page, search entry and constellation node disappear.
