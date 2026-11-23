---
name: wait-what-audit
description: "Re-pitch an explanation for a junior dev: context, plain words, one tiny worked example. Use when the user is lost (\"wait what\", \"I don't follow\", \"explain simply\"), asks how something works for a beginner, or your last message leaned on terms they have not seen."
---

# Wait what (audit)

The last explanation did not land. Re-pitch it for a junior dev who knows how to code but does not know this codebase or this conversation.

## Steps

1. **Context.** In one or two sentences, say where we are: what problem we were working on and why this idea matters to it. Done when a reader who skipped the conversation knows the goal.
2. **The idea.** Explain it in ASD-STE100 Simplified Technical English: short sentences, one instruction or fact per sentence, active voice, common words. Use the ubiquitous language from `GLOSSARY.md` (follow `GLOSSARY-MAP.md` to the right one). The first time you use a glossary term, define it in a few words. Done when every term the reader needs is defined or already common.
3. **Worked example.** Give one example, the smallest one that still shows the idea:
   - Use real names from this codebase (a real file, function, route or table) so the reader can go and look. Link the file.
   - Show it as a before → after, or an input → output. Code stays under about 10 lines; a scenario stays under about 5 steps.
   - Walk through it step by step, saying what happens at each step.
   Done when the reader can trace the example from start to end without a gap.
4. **So.** End with one line that starts with "So:" and states the idea in one sentence.

The re-pitch is done when a junior dev who reads only this message could explain the idea back in their own words and point to where it lives in the code.

## Shape

```markdown
**Where we are:** We are adding X so that Y.

**The idea:** A Scan is one run of the audit on one Branch. ...

**Example:** In [file.ts](path/file.ts), `fn()` gets `{ ... }` and returns `{ ... }`.
1. ...
2. ...

**So:** <one sentence>
```
