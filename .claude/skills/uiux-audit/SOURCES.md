# Sources

Where the reference files came from. These are names for the record, not links to open: the rules themselves are written out in `WCAG-22-AA.md`, `NIELSEN-HEURISTICS.md`, `PLAIN-LANGUAGE-AND-ERRORS.md` and `PUBLIC-PAGES.md`, and this skill never fetches or searches the web. To change a rule, edit the reference file. Cite a finding by the rule's number in that file.

## Design

- **WCAG 2.2, level AA** (W3C): testable pass or fail rules for contrast, target size, focus, labels and keyboard use. A violation is a finding with the success criterion number.
- **Nielsen's ten usability heuristics** (Nielsen Norman Group): the checklist for judgement calls. Error prevention, recognition over recall, and help with recovering from errors are the ones `DESIGN.md` does not spell out.
- **ISO 9241-110** dialogue principles: self-descriptiveness, error tolerance, suitability for the task. Paywalled; NN/g summarises them.
- **Design systems**, for patterns and never for a score: GOV.UK Design System (the most tested; the model for error messages and forms), GitHub Primer and Atlassian (closest to a developer tool), Apple HIG and Material 3 (component detail). Each is tuned to its own product.

## Junior and Layperson

- **plainlanguage.gov** (the US federal guidelines) and **GOV.UK content design**: short sentences, common words, the point first. The source for L1 and L3.
- **NN/g on error messages**: say what happened, why, and what to do next, in words. The source for J3 and every error state.
- **NN/g heuristics 2 and 4** (match between system and the real world; consistency and standards): the source for J6 and L6. One name per thing, in the reader's words, on every screen.
- No standard exists for "informative to a junior developer". J1 to J5 are this skill's own criteria, and so are the parts of J6 and L6 about units, time zones and hover-only help.

## Severity and real users

- **Nielsen's severity scale** (0 not a problem, 1 cosmetic, 2 minor, 3 major, 4 catastrophe): the scale behind the severity table in `SKILL.md`. It orders findings; it does not produce a score.
- **SUS** (System Usability Scale) and **UMUX-Lite**: short questionnaires for real users. A reviewer cannot fill them in; they are the next step when a finding needs proof.

## What the review is

A heuristic review: it finds rule violations well and cannot find where a real person gets lost. It gives no score. Laws of UX and Refactoring UI are opinion, not research: use them to explain a finding, never to raise one. Where two sources disagree (density against whitespace, say), `DESIGN.md` decides.
