# Nielsen's ten usability heuristics and severity scale

#### When to use this file

Reach for this file for criterion **D12**, for judgement calls that no rule in `DESIGN.md` or WCAG decides, and to map a finding to a severity. This file is the whole reference: do not fetch the source.

## Core discipline (include in the reviewer prompt)

```
- A heuristic is a rule of thumb, not a test. Every finding names the heuristic by number and quotes the screen text or screenshot that breaks it.
- A finding that only says "feels cluttered" is not reported. Say what the reader cannot do or will get wrong.
- Heuristics 2 and 4 are the source for J6 and L6 (one name per thing, in the reader's words). Heuristics 5 and 9 are the source for J3, J4 and L4.
- Where a heuristic disagrees with DESIGN.md (density against whitespace, say), DESIGN.md decides.
```

## The ten

1. **Visibility of system status.** The screen says what is happening: loading, saved, running, failed, and how far along. Fails when a long action shows nothing.
2. **Match between the system and the real world.** Words, order and icons are the reader's, not the system's. Fails on internal names, enum values and codes in the main text.
3. **User control and freedom.** A mistake has a clear way out: cancel, undo, back. Fails when an action cannot be undone and is not marked so.
4. **Consistency and standards.** One name per thing, one place per control, platform conventions kept. Fails when "Scan" on one page is "Run" on another.
5. **Error prevention.** The design stops the error before it happens: confirm a costly action, disable what cannot work, constrain input. Fails when the error is only reported afterwards.
6. **Recognition rather than recall.** Options and context are on screen, not in the reader's memory. Fails when a form asks for something the screen has already shown.
7. **Flexibility and efficiency of use.** A first-time reader and a daily user are both served: shortcuts, defaults, filters. Fails when the common task takes many steps.
8. **Aesthetic and minimalist design.** Every element earns its place. Extra information competes with the needed. Fails when the one next step is buried.
9. **Help users recognize, diagnose, and recover from errors.** Plain words, the problem stated exactly, and a fix offered. Fails on "Something went wrong".
10. **Help and documentation.** The help the reader needs is short, findable, task-focused and next to where it is needed. Fails when the only explanation is a long page elsewhere.

## Severity scale

| Score | Meaning | Maps to this skill |
|---|---|---|
| 0 | not a usability problem | no finding |
| 1 | cosmetic: fix when time allows | minor |
| 2 | minor: low priority | minor |
| 3 | major: important to fix | major |
| 4 | catastrophe: must fix before release | blocker |

Judge a problem on three things together: how often it is met, how much it hurts when met, and whether the reader gets past it on their own.
