# Plain language, labels and error messages

#### When to use this file

Reach for this file for criteria **L1, L3, L6, J3 and J6**, for every error and empty state, and for any button, link or heading that a finding calls unclear. It condenses the US plain-language guidelines, GOV.UK content design and the Nielsen Norman Group's work on error messages. This file is the whole reference: do not fetch those sources.

## Core discipline (include in the reviewer prompt)

```
- Quote the exact on-screen words. A copy finding without a quote is not reported.
- Judge as a reader who has never seen this product, never as the author.
- A term is explained when its meaning is on screen or one hover or click away. A term the reader must already know is a finding.
- One name per thing across every screen. A second name for the same thing is a finding even when each is clear alone.
- Do not rewrite for style. Report only words that make the reader stall, guess wrong or give up.
```

## Writing rules

- **Point first.** The first sentence of a text says what it is for or what to do.
- **Short sentences.** Aim for 15 to 20 words; flag a sentence over 25. One idea per sentence.
- **Common words.** "Use", not "utilise". "Start", not "initiate". A security or developer term appears once with its meaning, then the same word is used each time.
- **Active voice and "you".** "Elise copies the repository", not "The repository is copied".
- **No filler.** Cut "please note", "in order to", "simply", "just".
- **Numbers and units say what they are.** "$0.42 for this scan", not "0.42". A time says its zone when it could be misread.
- **Reading text** follows `DESIGN.md`: 14px or larger, line height 1.5 or more, 52 characters a line or less.

## Labels, buttons and links

- A button starts with a verb and names the result: "Start audit", not "Submit" or "OK".
- A destructive button names what it deletes: "Delete repository", not "Delete".
- Link text makes sense alone: "Read the report", never "click here" or "here".
- A column or field label says what it holds. Add a hint beside anything a first-time reader could misread: a unit, a time zone, a filter, what "unrated" means.
- The same control has the same label everywhere.

## Error messages

Every error, failed state and empty state answers three questions in plain words:

1. **What happened.** "The scan stopped before it finished."
2. **Why**, when it is known and the reader can use it. "The repository is private and Elise has no access."
3. **What to do next**, with the control or link that does it. "Connect your GitHub account, then start the scan again."

Also:

- Say it where it happened, next to the field or action.
- Do not blame the reader. "That link has expired", not "You entered an invalid link".
- Keep what the reader typed. Never make them enter it again.
- No codes or stack text in the main message. A reference code may follow, after the sentence.
- Never "Something went wrong" or "An error occurred" alone.
- An empty state says what will appear here, and the one step that fills it.
- When nothing is wrong, say so in words ("No open findings"), not a blank area.

## Costly or irreversible actions

Before the action runs, the screen says what it will do, what it costs or uses, and whether it can be undone. A costly, irreversible or outward-facing action asks the reader to confirm in a sentence that names the object.
