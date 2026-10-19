#!/usr/bin/env python3
"""Fictional demonstration contributions for tests and the private preview. NEVER committed to public data.

The Research Commons has no approved visitor contributions, because no submission service exists yet. To let the owner see how the library,
a detail page, the Correspondence Collection and the Question Constellation behave with real-looking records, and to test the pipeline,
this module writes a small set of clearly fictional records. Each one is written by the developer for demonstration, not by a visitor.
The one publication recommendation points at a real paper that exists (Chalmers 2023); it is marked unverified, as every visitor
recommendation starts out.

  records(prefix)   -> list of public-shape records
  relations(prefix) -> list of relations
  demo()            -> the same with ids DEMO-0001.. and `demo: true`, for the preview only
"""
from __future__ import annotations

import copy

PERSPECTIVE_1 = (
    "Memory, I want to suggest, needs a past that mattered to someone. A hard drive holds a record of yesterday without having lived through it, "
    "and a language model trained on a million diaries can describe a childhood it never had. If we call either of those memory, we are using the "
    "word in a thinner sense than the one we use for a person who remembers a summer.\n\n"
    "That does not make the thin sense useless. Archives are valuable precisely because they do not depend on anyone's experience surviving. But the "
    "two senses can be run together, and the confusion matters when we ask what it would mean for a machine to remember its own past. The "
    "question is not only whether the information is stored, but whether the stored information stands in the right relation to something that "
    "was, at the time, undergone.\n\n"
    "I may be wrong that experience is the missing ingredient. A functional account of remembering might do all the work I want experience to do. "
    "But I would like to see that account spelled out before I accept that a record and a memory are the same kind of thing."
)
PERSPECTIVE_2 = (
    "I think the usual question, whether a system understands, hides a more useful one: what could a system do, in situations it was not prepared "
    "for, that we would take as showing understanding in a person? A student who can recite a proof has shown something. A student who can adapt the "
    "proof to a new problem has shown more. That second kind of evidence is also the kind that a lookup table cannot supply.\n\n"
    "This does not settle whether understanding requires experience. It changes what we would need to observe before reaching for that question. "
    "If a system fails the adaptation test, we do not need a theory of consciousness to say it does not yet understand. If it passes, we have "
    "learned something real, and the harder question is still open."
)


def records(prefix="COM"):
    n = lambda i: f"{prefix}-{i:04d}"
    return [
        {"id": n(1), "type": "question", "title": "Can memory exist without lived experience?",
         "text": "A stored record, or a model that has learned from records, may have nothing that deserves the name memory if there was never an experience to remember. Is lived experience part of what makes something a memory?",
         "category": "memory", "concepts": ["concept:memory", "concept:identity"], "related": ["q:Q020", "q:Q016", "room:tablet"],
         "attribution": {"mode": "anonymous"}, "publishedOn": "2026-09-02", "updatedOn": "2026-09-14",
         "editorialContext": "The Unanswered Archive already asks whether artificial memory systems can reproduce the functions of human remembering (Q020). This question presses on a different point: whether the experience itself is part of what makes a record a memory. The Museum of Human Memory shows earlier technologies that stored what people knew outside their heads.",
         "editorialContextBy": "Artificially Intelligent", "status": "selected-for-investigation",
         "statusNote": "An editor chose to look at this alongside Q020. Selection is not an answer.", "collections": ["the-digital-self"], "featured": False,
         "openQuestions": ["Is there a sense of memory that does not depend on anyone having experienced the remembered event?", "Does an archive become a memory when someone reads it?"]},
        {"id": n(2), "type": "question", "title": "Could an artificial intelligence system develop an autobiographical sense of self?",
         "text": "", "category": "ai", "concepts": ["concept:self-modeling", "concept:memory"], "related": ["q:Q010"],
         "attribution": {"mode": "anonymous"}, "publishedOn": "2026-09-05", "updatedOn": "2026-09-05",
         "editorialContext": "Q010 in the Unanswered Archive asks whether an AI system could develop a meaningful representation of itself. An autobiographical sense of self adds a temporal dimension: a self that has a history.",
         "editorialContextBy": "Artificially Intelligent", "status": "approved-for-public-display", "collections": ["the-consciousness-question"], "featured": False},
        {"id": n(3), "type": "perspective", "title": "Memory may need a past that mattered to someone", "text": PERSPECTIVE_1, "category": "memory",
         "concepts": ["concept:memory"], "related": [], "respondsTo": n(1),
         "attribution": {"mode": "display-name", "display": "A. Reader", "authorized": True}, "publishedOn": "2026-09-20", "updatedOn": "2026-09-20",
         "editorialContext": "This is an argument, not a finding. It rests on a distinction between storing information and remembering an experience. Whether a functional account could do the same work is an open philosophical question, and the Lexicon's entry on Memory distinguishes several senses of the word.",
         "editorialContextBy": "Artificially Intelligent", "status": "approved-for-public-display", "collections": ["the-digital-self"], "featured": False},
        {"id": n(4), "type": "publication", "title": "Could a Large Language Model Be Conscious?",
         "text": "It lays out reasons for and against attributing consciousness to current language models and proposes what would have to change for the answer to move. Relevant to the question of what would count as evidence of machine consciousness.",
         "category": "ai", "concepts": ["concept:machine-consciousness"], "related": ["q:Q009"],
         "source": {"title": "Could a Large Language Model Be Conscious?", "authors": ["David J. Chalmers"], "year": 2023, "url": "https://arxiv.org/abs/2303.07103",
                    "verification": "unverified"},
         "attribution": {"mode": "anonymous"}, "publishedOn": "2026-10-01", "updatedOn": "2026-10-01",
         "editorialContext": "Recommended by a visitor and not yet checked. Its details are shown as the visitor gave them. It has not been reviewed for this site, and its presence here is not an endorsement.",
         "editorialContextBy": "Artificially Intelligent", "status": "approved-for-public-display", "collections": [], "featured": False},
        {"id": n(5), "type": "topic", "title": "Autobiographical narratives in artificial systems",
         "text": "How a system might construct, store and revise an account of its own past, and whether such an account has anything in common with the way people build a life story. Worth exploring because language models are already asked to speak about themselves.",
         "category": "ai", "concepts": ["concept:self-modeling", "concept:identity"], "related": ["q:Q010", "q:Q018"],
         "attribution": {"mode": "anonymous"}, "publishedOn": "2026-10-03", "updatedOn": "2026-10-03",
         "editorialContext": "This is a visitor's proposal for a subject to explore. It is not a research-in-development subject, and nothing has been investigated.",
         "editorialContextBy": "Artificially Intelligent", "status": "approved-for-public-display", "collections": ["human-x-machine"], "featured": False},
        {"id": n(6), "type": "perspective", "title": "Understanding is better tested by adaptation than by recitation", "text": PERSPECTIVE_2, "category": "ai",
         "concepts": ["concept:understanding", "concept:ai"], "related": ["q:Q012"], "respondsTo": "q:Q008",
         "attribution": {"mode": "anonymous"}, "publishedOn": "2026-10-08", "updatedOn": "2026-10-08",
         "editorialContext": "This responds to a question in the Unanswered Archive (Q008). It proposes a test, adaptation to unfamiliar problems, as a way to sidestep the question of experience. Whether that test is sufficient is itself debated, as the entries on Q012 show.",
         "editorialContextBy": "Artificially Intelligent", "status": "approved-for-public-display", "collections": ["the-meaning-of-intelligence"], "featured": False},
        {"id": n(7), "type": "question", "publishedOn": "2026-09-08", "updatedOn": "2026-10-10", "status": "withdrawn",
         "withdrawal": {"on": "2026-10-10", "publicNote": "Withdrawn at the contributor's request."}},
    ]


def relations(prefix="COM"):
    n = lambda i: f"contrib:{prefix}-{i:04d}"
    return [
        {"a": n(1), "b": "concept:memory", "kind": "editorial", "why": "The question asks what memory is.", "reviewedOn": "2026-09-14"},
        {"a": n(1), "b": "q:Q020", "kind": "editorial", "why": "Both ask what artificial systems would need for something to count as remembering.", "reviewedOn": "2026-09-14"},
        {"a": n(2), "b": "concept:identity", "kind": "suggested", "why": "Shares the words 'sense of self'. No one has reviewed this link."},
        {"a": n(2), "b": "q:Q010", "kind": "editorial", "why": "Q010 asks about an AI system's representation of itself; this adds a history to that self.", "reviewedOn": "2026-09-05"},
        {"a": n(4), "b": "q:Q009", "kind": "editorial", "why": "The paper discusses what would count as evidence of machine consciousness.", "reviewedOn": "2026-10-01"},
        {"a": n(3), "b": n(1), "kind": "editorial", "why": "A perspective written in response to this question.", "reviewedOn": "2026-09-20"},
    ]


def demo():
    """The same records with DEMO- ids and a demo flag. For the private preview only."""
    recs = []
    for r in copy.deepcopy(records("DEMO")):
        r["demo"] = True
        recs.append(r)
    return recs, relations("DEMO")


if __name__ == "__main__":
    import json
    print(json.dumps(records(), indent=1)[:600])
