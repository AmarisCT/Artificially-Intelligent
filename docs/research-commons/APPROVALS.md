# Decisions and approvals needed from the owner

Nothing in this list has been done. Each item is something I will not do without a yes. The order is roughly the order they matter.

## A. Wording and policy

| # | Decision | What I prepared | My recommendation |
|---|---|---|---|
| A1 | **Contribution guidelines, consent and rights wording** | A concise draft covering all ten topics the brief lists (welcome, evaluation, moderation, what happens after sending, editing, attribution, declined, source checking, privacy, withdrawal) plus consent statements and a rights summary. **It is not in this repository**, because the repository is public and unapproved legal terms must not be published as adopted. It is in the gitignored file `scripts/research-commons-src/guidelines-draft.json` and appears only in your private preview, labelled "Draft for the owner. Not adopted." | Read it in the private preview's Guidelines page. Tell me what to change. Have a lawyer glance at the rights and withdrawal sections before adoption if you can. When you approve, I move the exact wording into `research-commons/data/guidelines.json` with a version and date and set `guidelinesApproved: true` |
| A2 | **Rights and licence terms** | The draft says the contributor keeps ownership and allows the project to publish, lightly edit for clarity and let it inform future research here, with credit if credit was chosen; withdrawal removes the published text | Your decision, not mine. Alternatives: a stated open licence (for example CC BY) or "permission to publish only". Choose before launch |
| A3 | **Retention** of declined and abandoned submissions | Draft proposes 90 days | Fine as a default; shorter is more private, longer helps spot repeat abusers |
| A4 | **Whether display names are allowed** | Anonymous is the default; a chosen name is optional, unverified, 2–40 characters, labelled as unverified | Keep both options |
| A5 | **A clarification / takedown contact path** | The form collects no email, so there is no way to reply to a contributor. Withdrawal today needs a route you choose (a dedicated address, a form) | Pick one route and I add it to the guidelines. I will not publish an address without you giving it |

## B. Service and moderation (outside this repository)

| # | Decision | Notes |
|---|---|---|
| B1 | **Who builds the receiving service and the moderation inbox, and where** | The Architect backend is hosted outside this repository. [CONTRACT.md](CONTRACT.md) and [ARCHITECT-MODERATION-SPEC.md](ARCHITECT-MODERATION-SPEC.md) are the brief. I did not touch the backend and will not unless you ask |
| B2 | **Approve the contract** | Endpoints, limits, rate limits, flags, retention. Change anything you want before building |
| B3 | **Bot protection** | The contract starts with a honeypot, a minimum time, rate limits and idempotency. A challenge (proof-of-work or a self-hosted one) can be added if abuse appears. I assume **no paid or tracking service** unless you approve one |
| B4 | **Who may approve and withdraw** | Proposed: any editor may review; only you approve, withdraw and export |
| B5 | **Staging first** | Proposed: build and test against a staging copy, run `commons_conformance.py --stateful`, and do one approve-and-withdraw drill before any public form is enabled |

## C. Going live (each is a separate yes)

1. **Merge `feature/research-commons` into `main`.** Merging publishes the page at `/research-commons/` (noindex, not linked), plus the additive changes to Search and the Inquiry Engine and the stricter workflow trigger (item 6). Expect small merge conflicts with `feature/research-ledger` in `scripts/build_research_index.py`, `search/search-app.js`, `.github/workflows/refresh-feed.yml` and `.gitignore`; I resolve them when you decide the order.
2. **Navigation / homepage link.** I have not added the Commons to any menu or the homepage. Where it goes (main nav, the Research section, footer only) is your call; I will prepare it as a small separate change and show you a preview first.
3. **Flip `noindex` to `index,follow`.** An empty library should not be searchable, so the page stays `noindex` while it is empty. A test requires `noindex` exactly while the library is empty, which means the flip happens with the first approved record. If you would rather wait for a handful of contributions, tell me and I will change that rule and the test together.
4. **Sitemap.** `python3 scripts/build_research_commons.py --list-urls` prints what would be added. I will not edit the sitemap without your approval.
5. **Enable submission.** Requires B1 done, A1 approved, then `contributionEndpoint` set in `research-commons/config.json`. Until then every form says plainly that it is not open.
6. **Workflow change.** `.github/workflows/refresh-feed.yml` deploys the entire repository to GitHub Pages and previously also ran on pushes to any branch for certain paths. This branch restricts `push` to `main` (and adds `scripts/commons_lib.py` to the watched paths, because the research index imports it). Optional extra step: [patches/refresh-feed-commons-step.patch](patches/refresh-feed-commons-step.patch) rebuilds the Commons status and static pages on the schedule; it validates but **never imports or publishes** new contributions. Not applied.
7. **Scheduled import of approved contributions.** Possible once there is a `syncEndpoint`: a scheduled job opens a *pull request* with the new approved records for you to review. I recommend never auto-publishing without a review, at least at first.

## D. Other open items from earlier work

- **`feature/listening-room`**: still exists (shelved). Delete it, or keep it?
- **Architect login and publishing**: please try logging in and publishing once on your side; I cannot reach it from here and have not changed it.
- **Search Console numbers** for the growth analysis, when you have them.

## Launch checklist (for when you say go)

- [ ] A1 approved and in `guidelines.json`; `guidelinesApproved: true`
- [ ] Service built, conformance passes (`--stateful`), staging drill done, endpoint approved and set
- [ ] Moderation inbox live behind Architect login; roles set; audit log on
- [ ] Withdrawal route published in the guidelines
- [ ] `python3 scripts/research-commons-tests/run_all.py` passes on the merge result
- [ ] Merge; confirm the live page, the empty-state messages and that no form claims to be open unless it is
- [ ] Approve and publish a first real contribution; run sync, build, tests; confirm its page, search entry and constellation node
- [ ] Withdraw it as a drill (or on a staging copy) and confirm everything disappears
- [ ] Then, and only then: navigation link, `index,follow`, sitemap
