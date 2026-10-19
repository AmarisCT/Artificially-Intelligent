# Submission service contract

This is the specification for the one thing the Research Commons needs from a backend: **a private inbox that accepts contributions and never publishes them.**

The Architect backend is hosted outside this repository and serves only `GET /api/public/articles` today, so **no part of this contract exists in production yet**. `scripts/commons_contract.py` is a runnable reference implementation of every rule below, and `contract/conformance-cases.json` (45 cases) is the acceptance test: any real implementation must pass it.

```bash
python3 scripts/commons_conformance.py                        # reference implementation: 45 cases, 0 failed
python3 scripts/commons_conformance.py --base https://api.example.org --stateful   # a real service
```

The browser form is also tested against the reference implementation, so the page and the contract cannot drift apart silently.

## Endpoints

| Method and path | Purpose |
|---|---|
| `POST /api/public/contributions` | The inbox. Four types: `question`, `publication`, `topic`, `perspective`. |
| `POST /api/public/question-submissions` | **Existing Unanswered Archive endpoint, kept as an alias** for `type: "question"` with the Archive's original request body. One inbox, not two. |
| `OPTIONS` on both | CORS preflight. |

Nothing else is public. There is no public read endpoint for submissions, no status lookup by guessable id and no list. `statusEndpoint` in `research-commons/config.json` stays `null` until the owner decides a receipt-status feature is wanted.

## Request

`Content-Type: application/json`, at most **16 KiB**. Unknown fields are rejected (`400 unknown-fields`).

Common fields:

| Field | Rule |
|---|---|
| `type` | `question`, `publication`, `topic` or `perspective`. Required on `/contributions`. Implied `question` on the legacy alias (and the only type it accepts). |
| `consent` | Must be the boolean `true`. Required. |
| `consentVersion` | Version of the approved guidelines the visitor saw, `[A-Za-z0-9._-]{1,40}`. Optional. Stored with the submission so consent is tied to a wording. |
| `attribution` | `{"mode":"anonymous"}` (default) or `{"mode":"display-name","name":"…"}`; the name is 2–40 characters, no links, no email, no control characters. It is unverified and need not be a real name. |
| `hp` | Honeypot. Must be empty. |
| `elapsedMs` | Whole number of milliseconds the form was open. Less than **2500** is refused (`too-fast`). |
| `origin` | `research-commons` or `unanswered-archive`. Informational. |

Text is normalised (Unicode NFC, control and zero-width characters removed, whitespace collapsed; line breaks kept only in long-text fields) **before** length checks and storage, and is stored as plain text. It must be escaped at output everywhere it is shown, including in the moderation screens.

Per type (limits are characters after normalisation):

| Type | Fields (min–max) |
|---|---|
| `question` | `question` 15–400 (required), `explanation` 0–1000, `category` optional |
| `publication` | `title` 5–300 (required), `authors` ≤300, `venue` ≤200, `year` 1000–2100 (integer), `doi` (`10.xxxx/…`, URL prefixes stripped), `url` (public https only), `why` 40–1200 (required), `category` optional |
| `topic` | `title` 8–200, `description` 60–2000, `why` 40–1200, `category` optional (all required except category) |
| `perspective` | `title` 8–300, `text` 200–4000, `references` ≤800 (at most 3 links, links allowed only here), `relatedQuestion` ≤300, `category` optional |

`category` is one of `human`, `ai`, `neuro`, `mind`, `memory`, `ethics`, `human-machine`. The **legacy alias accepts only the Archive's six** (no `human-machine`) and its original body `{"question","category"|null,"consent":true,"hp":"","elapsedMs"}`.

Content rules: links are refused in every free-text field (they belong in `url` or `references`); email addresses are refused everywhere; `url` must be `https`, a public host, no credentials, no IP literal, no `localhost`/`.local`/`.internal`, no known link shortener, ≤500 characters. Phone-number-like text, promotional language, possible threats or doxxing, mostly-capitals text and repeated characters do **not** reject; they are **flags** for the editor (`flags` on the stored record).

## Responses

Success is always `{"ok": true, "receipt": "rcpt_…"}`. The browser shows success **only** when `ok === true` is in the body (on the legacy alias, any 2xx), and shows a receipt only if one was returned. A reply it cannot confirm is shown as *not confirmed*, never as success.

| Status | `error.code` | Meaning |
|---|---|---|
| `202` | – | Stored privately as `pending-review`. **Never** public. |
| `202` | – | Honeypot hit: answered like success, stored nowhere, so bots learn nothing. |
| `200` | – | Identical resubmission: `{"ok":true,"receipt":…,"duplicate":true}`; no second record. |
| `400` | `bad-json`, `bad-request`, `unknown-fields`, `too-fast` | |
| `403` | `origin-not-allowed` | `Origin` header present and not the site's. |
| `404` / `405` | `not-found` / `method-not-allowed` | |
| `413` / `415` | `too-large` / `unsupported-media-type` | |
| `422` | `invalid-type`, `invalid-field`, `consent-required` | `error.fields` maps each bad field to a short code (`required`, `too-short (min N)`, `too-long (max N)`, `links-not-allowed-here`, `email-address-not-allowed`, `write-in-words`, `invalid`, `not-a-doi`, `must-be-a-public-https-link`, `too-many-links`, `name-must-be-2-to-40-characters-without-links-or-email`). |
| `429` | `rate-limited` | `Retry-After` header in seconds. |
| `5xx` | – | Shown to the visitor as "not sent", with an honest note that nothing was received. |

Error messages never echo submitted text and never reveal what other people have submitted. A similarity match against public records is **a flag for the editor** (`similar-to-public:<ids>`), invisible to the sender.

## CORS (a common failure)

```
Access-Control-Allow-Origin: https://amarisct.github.io        (the exact origin, never *)
Vary: Origin
Access-Control-Allow-Methods: POST
Access-Control-Allow-Headers: Content-Type
Access-Control-Max-Age: 600
Access-Control-Expose-Headers: Retry-After                      ← required, or browsers cannot read Retry-After on a 429
```

The page sends `credentials: "omit"` and `referrerPolicy: "no-referrer"`. No cookie is needed or accepted.

## Abuse controls (server side; the browser's checks are a courtesy)

- **Validate everything again** on the server with the rules above. Never trust the browser.
- **Rate limits**, reference values: 5 per hour and 20 per day per sender key, and 200 per hour overall. The sender key is a salted hash of the network address, the salt rotated daily, so **no address is stored**. The limit is checked before the duplicate check, so repeated identical sends still count against the sender.
- **Honeypot and minimum time** as above.
- **Idempotency**: key = SHA-256 of the normalised content; an identical resubmission returns the same receipt and stores nothing new.
- **Bot challenge**: none by default. If abuse appears, a privacy-respecting challenge (for example proof-of-work or a self-hosted challenge) can be added **after the owner approves it**. No paid or tracking service is assumed. See [APPROVALS.md](APPROVALS.md).
- **Size and type limits**, strict JSON parsing, no file uploads of any kind.
- **Receipts** are opaque random 128-bit tokens; the service stores only their hash. A receipt proves receipt of a submission and gives no access to anything.

## What the service stores (private)

Submission content (normalised plain text), type, subject, attribution choice, the consent version and time, the idempotency key, the salted sender key's hash with a short retention, flags, state and the editor's private notes. **Not stored:** name unless the visitor chose to show one, email address, account, raw network address, user agent. Retention period for declined and abandoned submissions is an owner decision (proposed in [APPROVALS.md](APPROVALS.md)).

## Export to the public library

The moderation system, not the submission endpoint, produces the approved export, one JSON document `{"contributions": […], "relations": […]}` containing **only records an editor approved** (`approved-for-public-display`, `selected-for-investigation`, `incorporated`) plus `withdrawn` tombstones. `scripts/sync_commons.py` validates the whole export before writing anything, and refuses an export that drops a record that is already public, changes a public id, type or first-publication date, or quietly un-withdraws a record. See [ARCHITECT-MODERATION-SPEC.md](ARCHITECT-MODERATION-SPEC.md) for the public record fields.

## Enabling the forms (after approval, not before)

1. The service exists, passes `commons_conformance.py --base … --stateful`, and the owner has approved it.
2. The owner has approved the contribution guidelines, and their wording is in `research-commons/data/guidelines.json` with `"guidelinesApproved": true` in `config.json`.
3. `config.json` `contributionEndpoint` is set to the https URL. (Until then, questions can use the Archive's existing endpoint through the fallback, but **only** once guidelines are approved.)

Each form is live only if both an endpoint and approved guidelines exist; otherwise it shows what is missing and cannot be submitted.
