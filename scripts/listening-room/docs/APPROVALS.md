# The Listening Room: what needs your approval

Nothing below has been applied to the live site. The two recordings are demonstrations; none is public.

## A. Decisions for you

| # | Decision | My recommendation |
|---|---|---|
| 1 | Approve the preview as the basis for the live Listening Room, or request changes. | Review on a phone and a laptop first; listen to a few minutes of each recording. |
| 2 | Who narrates the first approved recordings: you or another person, or a reviewed synthetic voice? | A human narrator for the first one or two essays (see EVALUATION.md section 2). |
| 3 | If synthetic: which service, chosen after a listening test of the same paragraphs from two or three candidates. | Test first; no purchase until you choose. |
| 4 | The narration edits in section B. | Approve B1-B4; they change how the essay is *spoken* only. |
| 5 | The proposed chapter titles in section D (they are drafts, hidden in production). | Edit freely; they are your wording. |
| 6 | Whether to add "Listening Room" to the site navigation and homepage when the feature goes live. | Yes, after approval; nothing in the live site changes until you say so. |
| 7 | Whether to set up the optional podcast feed (needs a title, description, cover image, category). | Later, once at least one real recording is published. |
| 8 | Whether to put the recordings on Substack. | Not yet; see EVALUATION.md section 6. |
| 9 | Where audio should live once the collection grows. | GitHub Pages now; Cloudflare R2 later, both ready. |

## B. Proposed edits for spoken narration (for approval)

The written essay is never changed. The transcript shows the article's own words and spelling. These are the only
differences between what is written and what is spoken, applied to both essays:

* **B1. Citation markers are not spoken.** Markers such as `[1]` are shown in the transcript and linked to the Sources;
  the voice skips them. (Only the first essay has inline markers.)
* **B2. The Sources list is not read aloud.** It is shown in the transcript and the closing note says "The sources are
  listed in the written article."
* **B3. A spoken recording note and closing line are added.** Opening: "Demonstration recording. This narration uses a
  synthetic voice and has not been reviewed. It is not an approved recording. *Title.* An essay from Artificially
  Intelligent, published *date*." Closing: "End of the essay. The sources are listed in the written article." For an
  approved recording these would be rewritten, for example to name the narrator, and the "demonstration" sentences removed.
* **B4. Pronunciation respellings** (change only how a word is voiced, never the transcript):

| Written | Voiced as | Reason |
|---|---|---|
| AI, AI's | "A I", "A I's" | The engine otherwise says "eye". |
| UK | "U K" | Letters spoken separately. |
| ChatGPT | "Chat G P T" | Otherwise spelled letter by letter. |
| Domesday | "Doomsday" | Standard pronunciation of Domesday Book. |
| Ashurbanipal | "Ashur bahnee pahl" | Common scholarly pronunciation. |
| 1086 | "ten eighty-six" | A year, not a quantity. |

None of these has been checked by a person's ear. They were verified only by reading the engine's phonemes back. Please
listen to the places they occur: *Ashurbanipal* and *Domesday* (essay 1), *AI* throughout.

No argument, sentence order or wording of the essays is altered.

## C. An observation about the published articles (not changed)

The Sources list of the consciousness essay shows literal asterisks where italics were evidently intended
(for example `*Nature, 642*`). That is in the published article text, not in the Listening Room, which shows the Sources
exactly as published. It may be worth fixing in the article source in Architect.

## D. Proposed chapter titles (drafts; hidden in production)

The published essays have no section headings, so the approved chapters are structural only (Recording note, The essay,
Closing note, Sources). The titles below are drafts that follow the essays' actual paragraphs; each starts at a
measured time. They appear only in the preview, marked as proposed. Change any wording you like.

**Essay 001, We Are All Archives Now**

| Draft title | Starts |
|---|---|
| A mark pressed into clay | 0:17 |
| The Library of Ashurbanipal | 1:50 |
| Domesday Book | 3:00 |
| What survives, and what is selected | 3:45 |
| Records in ordinary life today | 4:40 |
| Artificial intelligence and the archive | 6:31 |
| Consciousness, records and the self | 7:55 |
| The archive as subject and method | 9:11 |

**Essay 002, Is Human Consciousness Connected to Artificial Intelligence?**

| Draft title | Starts |
|---|---|
| What exactly is consciousness? | 0:19 |
| Intelligence is not consciousness | 2:28 |
| Turing and the Chinese Room | 3:08 |
| Language models and the brain | 4:05 |
| Human to machine to human | 5:12 |
| The extended mind and cognitive offloading | 7:08 |
| Identity and the recursive mirror | 10:05 |
| Language is the bridge | 12:57 |
| What the evidence supports | 15:14 |
| Where does the self end? | 17:21 |
| Something quieter | 18:28 |

## E. How a recording becomes public (today)

1. The article is published through Architect as usual. The 6-hour workflow lists it in the production queue as **Not Yet
   Recorded**. It is never playable at this point.
2. A narration script is prepared from the article's approved text, with pronunciations.
3. Audio is recorded or generated by an authorized method.
4. The verification script checks the transcript against the published article, the audio file's format, duration and
   checksum, and the timing against the decoded audio.
5. **You listen** and review pronunciation and omissions.
6. In the recording's record, set `status` to `published`, fill `review` (reviewer, date), and set `releaseDate`. Both
   `published` and a `releaseDate` are needed; either alone leaves it not playable.
7. The next build publishes it. Until step 6, public visitors cannot play it, however the files got there.

If the article's narrated text later changes, the queue flags the recording **Revision Required**. The recording is left
untouched; it stays playable with a notice that the written essay changed, until you approve a replacement.
