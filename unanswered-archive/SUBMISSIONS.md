# Suggest a Question: what the Architect side needs

The form on the archive is finished and validated in the browser, but **it cannot deliver anything yet**. The Architect backend currently publishes only `GET /api/public/articles`. It has no place to receive, store or moderate visitors' questions, and it is a separately hosted service that this repository does not contain. Sending is therefore switched off (`config.json` has `"submitEndpoint": null`).

## To switch it on
1. Add the backend feature below to Architect (it is hosted outside this repo, so it has to be built where Architect is built).
2. Put the public submission URL in `unanswered-archive/config.json`, for example `{"submitEndpoint": "https://<architect-host>/api/public/question-submissions"}`. It must be `https`. No other change to the page is needed.

## Contract the form follows
`POST <submitEndpoint>`, `Content-Type: application/json`, no cookies or credentials.

```json
{"question":"string, 15 to 400 chars","category":"human|ai|neuro|mind|memory|ethics|null","consent":true,"hp":"","elapsedMs":12345}
```
Responses: `2xx` accepted; `429` rate limited; anything else is shown as a failure and the visitor keeps their text.

## Server-side rules Architect must enforce (the browser checks are not security)
- Re-validate length, type and `consent`; reject links; strip control characters; store as plain text; never render submitted text as HTML.
- Reject when `hp` is non-empty; treat a very small `elapsedMs` as suspect.
- Rate limit per IP and globally; add a bot challenge (for example Cloudflare Turnstile) before launch.
- CORS: allow only `https://amarisct.github.io`.
- Store only the question text, optional subject, timestamp and a moderation status. No name, email or IP kept longer than needed for abuse limits.
- New submissions are `pending`. **Nothing is ever published automatically.**

## Architect (login-only) screens
- An inbox of submissions: pending, approved, declined.
- Approve creates a draft archive question marked "Awaiting Research Review". Decline hides it. A reply or answer is written by the author, not generated.
- Published archive questions are then exposed through a read-only public endpoint (for example `GET /api/public/questions`), approved items only.

## Prompt to give whoever builds Architect
"Add a public question-submission feature to Architect. Create `POST /api/public/question-submissions` accepting JSON `{question, category, consent, hp, elapsedMs}`; validate (15 to 400 chars, no links, consent true, honeypot empty), rate limit, CORS only for https://amarisct.github.io, and store as `pending` with only text, subject and timestamp. Add a login-only Architect inbox to review, approve (creating a draft 'Awaiting Research Review' question), or decline. Never publish automatically, and do not change the existing login, password or public articles endpoint."
