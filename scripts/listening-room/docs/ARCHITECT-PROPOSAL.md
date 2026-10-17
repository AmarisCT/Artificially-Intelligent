# The Listening Room and Architect: integration proposal

**Status: proposal only.** Nothing in Architect, its login, its password handling or its publishing backend was read,
changed or called from the Listening Room. The public Listening Room is built to work completely without any of this.

## 1. What exists today

* The public site is static, on GitHub Pages. Architect is a separate password-protected console connected to a secure
  backend, outside this repository.
* Every 6 hours a workflow reads the public articles feed generated from Architect's public articles API, builds the
  published article pages and sitemaps, and (new) runs the Listening Room queue, which:
  * lists each published article as **Not Yet Recorded** (eligible for audio, never playable);
  * flags a recording **Revision Required** if the narrated text of its article changed, leaving the recording untouched;
  * writes only `listening-room/data/audio-queue.json`; it never creates, approves or publishes a recording.
* Approving a recording today means a person edits the recording's record in the repository (`status`, `review`,
  `releaseDate`). That is safe but not convenient.

## 2. Principles (from your brief)

1. Do not rebuild or touch authentication; reuse Architect's.
2. No passwords or tokens in the public site, the repository or the browser.
3. No administrative controls in public JavaScript, hidden or otherwise. The public Listening Room only reads data.
4. Audio approval stays separate from article publishing, and requires an explicit human action.

## 3. Proposed Architect capabilities

All of these live behind Architect's existing login, in its backend, not in this repository.

| Capability | What it does | Notes |
|---|---|---|
| **Audio request** | On a published article, "Request audio" creates an audio record in status *In Production* with who and when. | Cheap; no audio is generated. |
| **Narration script review** | Shows the script derived from the approved article text (citation markers and Sources removed, recording note added) with the pronunciation list; you edit and approve. | The same transformation `lr_narrate.py` performs; the approved script is stored with the record. |
| **Audio upload** | Authenticated upload of an MP3 to **private** storage. The backend checks type, size and duration and computes a SHA-256. | Not public until approved. |
| **Verification** | Runs the same checks as `lr_verify.py` (text equals the article, format, duration, checksum, timing) and shows the result. | Can run in a workflow or in the backend. |
| **Transcript review** | Shows the sentence timings against the audio for correction. | Needed for recordings not made by the demo pipeline. |
| **Narrator attribution** | Narrator name, credit line, narration type (human, synthetic, synthetic demonstration). | A synthetic voice cannot be approved without its disclosure. |
| **Approval** | An authorized Architect plays the private file, then approves. Approval sets status *Published Audio* and the release date, publishes the file to public storage and the record to the public data. | Separate from article publishing. Logged. |
| **Revision** | When the article changes, the audio is flagged; a replacement is uploaded and approved the same way; version history is kept. | Never overwrites an approved recording automatically. |
| **Status management** | The five statuses (Not Yet Recorded, In Production, Awaiting Audio Review, Published Audio, Revision Required). | Matches the public site's definitions. |

## 4. How the public site would learn about an approved recording

Two options; I recommend the first because it uses the path that already works.

1. **Extend the public articles API/feed** with an optional `audio` object per article (below). The existing 6-hour
   workflow (or a manual run) turns it into `audio-library.json`. No new credentials anywhere.
2. The backend commits the record and files to the repository through a narrowly scoped GitHub App. More immediate, but it
   adds a credential that must be stored and rotated.

Proposed public `audio` object (only for approved recordings; absent otherwise):

```json
{
  "id": "LR003",
  "status": "published",
  "releaseDate": "2026-11-02",
  "narration": { "type": "human", "narrator": "Name", "credit": "Read by Name." },
  "audio": { "url": "https://…/LR003.mp3", "format": "audio/mpeg", "bytes": 0, "durationSec": 0, "sha256": "sha256:…" },
  "articleVersion": { "bodyHash": "sha256:…", "sourcesHash": "sha256:…" },
  "transcriptUrl": "…", "reviewedOn": "2026-11-01"
}
```

The Listening Room already accepts an absolute `https` audio URL, so audio can live in object storage (EVALUATION.md
section 4).

## 5. Security requirements for whoever builds it

* Reuse the existing Architect session; role-check approval separately from editing.
* CSRF protection on every state-changing request; no state change through GET.
* Uploads: server-side validation of content type, size and duration; private storage; short-lived signed URLs for review
  playback; malware scanning if the storage provider offers it.
* An audit log of who requested, uploaded, reviewed and approved, and when. Do not invent or backfill dates.
* No auto-approval path. A scheduled or API-triggered approval would need a separately approved written policy.
* Secrets only in the backend's secret store, never in this repository or any page.

## 6. What I need to take this further

I cannot see Architect's source or API from this workspace, so I have not tested any of this against it. To build the
integration I would need either read access to the Architect backend's code or API documentation, or whoever maintains it
to implement section 3 against the contract in section 4. Until then the repository workflow in APPROVALS.md section E is
the working, safe path.
