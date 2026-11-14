# WCAG 2.2 level AA: the testable rules

#### When to use this file

Reach for this file for criterion **D11** and whenever a finding is about contrast, target size, focus, keyboard use, labels, language, motion or reflow. Cite a finding as `WCAG 1.4.3`, the success criterion number, so a reader can look it up. This file is the whole reference: do not fetch the standard.

## Core discipline (include in the reviewer prompt)

```
- A WCAG finding names the success criterion number and quotes the evidence: a measured number, a screenshot path, or the on-screen text.
- Measure before judging. Contrast, target size and reflow come from measure.js or the snapshot, never from how the screen looks.
- Text on a translucent or image background cannot be measured by measure.js. Judge it on a screenshot and mark the finding "judged on screenshot".
- A criterion that does not apply (no video, no forms, no drag) is "not applicable", not a pass.
- WCAG 2.2 removed 4.1.1 Parsing. Do not report it.
```

## Perceivable

| SC | Rule | How to check from evidence |
|---|---|---|
| 1.1.1 | Every image that carries meaning has a text alternative; a decorative one has an empty alt or is hidden | snapshot: images and `role="img"` have names |
| 1.3.1 | Structure in the markup matches what is shown: headings, lists, tables, labels tied to fields | snapshot: heading order, list and table roles |
| 1.3.4 | The screen works in portrait and landscape | resize and screenshot |
| 1.3.5 | Fields about the person (name, email, address) carry an `autocomplete` value | read the field attributes |
| 1.4.1 | Colour is never the only signal (a red badge also says "Failed") | screenshot: remove colour in your head, is the meaning still there |
| 1.4.3 | Text contrast at least 4.5:1; large text (24px, or 18.66px bold) at least 3:1 | `measure.js` numbers |
| 1.4.4 | Text resizes to 200% with nothing lost | zoom and screenshot |
| 1.4.5 | Text is text, not an image of text (logos excepted) | snapshot |
| 1.4.10 | Reflow: at 320 CSS px wide there is no sideways scrolling, except for a table, map or code block | resize to 320 wide, check `scrollWidth` against `clientWidth` |
| 1.4.11 | Controls, icons that carry meaning and focus rings have at least 3:1 against what is next to them | `measure.js` or screenshot |
| 1.4.12 | Text still fits when line height is 1.5, paragraph spacing 2x, letter spacing 0.12em, word spacing 0.16em | inject the styles, screenshot |
| 1.4.13 | Content that appears on hover or focus can be dismissed, hovered over and stays until dismissed | hover, screenshot |

## Operable

| SC | Rule | How to check |
|---|---|---|
| 2.1.1 | Everything works from the keyboard | press Tab, Enter, Space, arrows through the screen |
| 2.1.2 | Focus is never trapped | Tab through a dialog and out of it |
| 2.1.4 | A single-key shortcut can be turned off or remapped | read the shortcuts |
| 2.2.1 | A time limit can be turned off, extended or is long | read the timeouts |
| 2.2.2 | Anything that moves by itself for more than 5 seconds can be paused, stopped or hidden | find autoplay, loops and marquees; look for the control. A "Pause animations" control satisfies it only if it actually stops them |
| 2.3.1 | Nothing flashes more than three times a second | animation review |
| 2.4.1 | A way to skip repeated blocks (a skip link or landmarks) | snapshot: `main`, `nav` landmarks |
| 2.4.2 | The page has a title that says what it is | `document.title` |
| 2.4.3 | Focus order follows the reading order | Tab and watch |
| 2.4.4 | A link's purpose is clear from its text and context ("Read the report", not "here") | snapshot link names |
| 2.4.5 | More than one way to find a page (menu, search, links) | read the nav |
| 2.4.6 | Headings and labels describe their topic | snapshot |
| 2.4.7 | Keyboard focus is visible | Tab and screenshot |
| 2.4.11 | **New in 2.2.** A focused control is never entirely hidden by a sticky header, banner or toast | Tab to the last control under a sticky bar |
| 2.5.1 | A path-based or multi-finger gesture has a one-pointer alternative | read the gestures |
| 2.5.2 | A click fires on release, so it can be cancelled | read the handlers |
| 2.5.3 | The accessible name of a control contains the text it shows | snapshot name against the visible label |
| 2.5.4 | A shake or tilt action has a button alternative | read the handlers |
| 2.5.7 | **New in 2.2.** Dragging has a click alternative | find drag handlers |
| 2.5.8 | **New in 2.2.** Pointer targets are at least 24 by 24 CSS px, or have enough space around them | `measure.js` target sizes. Exceptions: a link inside a sentence, and a browser-default control |

## Understandable

| SC | Rule | How to check |
|---|---|---|
| 3.1.1 | The page language is set (`<html lang>`) | read the attribute |
| 3.1.2 | A passage in another language is marked | read |
| 3.2.1 | Focusing a control changes nothing by surprise | Tab |
| 3.2.2 | Changing a field does not submit or navigate without warning | change a select |
| 3.2.3 | Navigation sits in the same place on every screen | compare screens |
| 3.2.4 | The same function has the same name on every screen | compare screens |
| 3.2.6 | **New in 2.2.** Help (contact, chat, a link to it) is in the same place on every screen that has it | compare screens |
| 3.3.1 | An error names the field and says what is wrong, in text | trigger an error |
| 3.3.2 | Every field has a visible label or instruction | snapshot |
| 3.3.3 | An error that has a known fix suggests it | trigger an error |
| 3.3.4 | An action that is legal, financial or deletes data can be reversed, checked or confirmed | find the action |
| 3.3.7 | **New in 2.2.** Information already entered is not asked for again in the same flow | walk the flow |
| 3.3.8 | **New in 2.2.** Signing in does not need a cognitive test (remembering a password is allowed if paste and password managers work) | try paste into the password field |

## Robust

| SC | Rule | How to check |
|---|---|---|
| 4.1.2 | Every control has a name, a role and a state that a screen reader can read | snapshot |
| 4.1.3 | A status message (saved, error, loading) is announced without moving focus (`role="status"` or `aria-live`) | read the markup of toasts and alerts |
