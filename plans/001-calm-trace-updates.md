# 001 — Calm the Trace tree's update motion

- **Status**: DONE (applied in bc050e15; feel check still needs a person)
- **Commit**: 81fbda2c
- **Severity**: MEDIUM
- **Category**: Purpose & frequency (too many simultaneous motions), Performance
- **Estimated scope**: 1 file, about 40 changed lines

## Problem

One file: `apps/elise-frontend-web/src/modules/scan/components/trace-concepts/concept-timeline.tsx`.

Every update (a new entry arrives while a Scan runs) fires about six separate motions at once, and two infinite loops run all the time. The result reads as busy, not as a clear signal.

Per update today:
1. The new row slides in 6px and fades (`Branch`, inner `motion.div`, lines 34-39).
2. Every existing row shifts down (`layout="position"`, line 33).
3. The row that falls off the 5-row list fades out (`exit`, line 33, and `AnimatePresence` at lines 82, 119).
4. A grown count fades (`Count`, lines 14-22).
5. The "doing now" text slides up 4px and fades (lines 61-75).
6. Always on: `animate-ping` on the "doing now" dot (line 57) and `animate-pulse` on the current Phase node (line 109). Neither is gated for reduced motion.

Items 1, 4 and 5 all say "something new arrived" in three places on the screen. The row shift (2) already shows where the new row went, so the slide (1) is redundant.

```tsx
// concept-timeline.tsx:33-39 — current
<motion.li layout={reduce ? false : "position"} transition={{ duration: 0.2, ease: EASE_OUT }} exit={{ opacity: 0, transition: { duration: 0.12 } }}>
  <motion.div
    initial={{ opacity: 0, transform: reduce ? "translateY(0px)" : "translateY(-6px)" }}
    animate={{ opacity: 1, transform: "translateY(0px)" }}
    transition={{ duration: 0.2, ease: EASE_OUT }}
    className="relative pl-6"
  >
```

```tsx
// concept-timeline.tsx:14-22 — current
<motion.span key={value} initial={{ opacity: 0.3 }} animate={{ opacity: 1 }} transition={{ duration: 0.25, ease: EASE_OUT }} className="font-normal tabular-nums text-muted-foreground/70">
```

```tsx
// concept-timeline.tsx:57 and :109 — current
<span className="absolute inline-flex size-full animate-ping rounded-full bg-primary/60" />
{current ? <span className="size-2 animate-pulse rounded-full bg-primary" /> : ...}
```

## Target

Two motions per update, nothing else:
- the rows below the new one shift down (200ms, the strong ease-out)
- the new row fades in (200ms, no movement)

Everything else changes instantly. One slow loop stays: the ping on the "doing now" dot, gated for reduced motion. Curve everywhere: `cubic-bezier(0.23, 1, 0.32, 1)`, already `EASE_OUT` in the file (line 10).

```tsx
// Branch — target
function Branch({ last, children }: { last: boolean; children: ReactNode }) {
  const reduce = useReducedMotion();
  return (
    <motion.li layout={reduce ? false : "position"} transition={{ duration: 0.2, ease: EASE_OUT }}>
      <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ duration: 0.2, ease: EASE_OUT }} className="relative pl-6">
        {/* the two connector spans and the content div stay exactly as they are */}
      </motion.div>
    </motion.li>
  );
}

// Count — target: a plain span, no motion
function Count({ value }: { value: number }) {
  return <span className="font-normal tabular-nums text-muted-foreground/70">×{value}</span>;
}
```

Other target changes:
- "doing now": replace the `motion.span` (lines 61-75) with a plain `span` that has no animation.
- Remove both `AnimatePresence` wrappers (lines 82/153 and 119/146). Without them a row that leaves the list is removed at once, which is intended.
- Current Phase node (line 109): a static dot, `className="size-2 rounded-full bg-primary"` (no `animate-pulse`).
- The ping (line 57): add `motion-reduce:animate-none`.
- The Phase `motion.li` (lines 92-98) keeps its 250ms opacity fade and `layout`; a new Phase is rare and worth a fade. No change.

## Repo conventions to follow

- Comments: only `// -----` blocks (oxlint `anti-slop/no-unlisted-comments`). Add none.
- Colours: theme tokens only.
- `import { motion, useReducedMotion } from "motion/react"` stays; drop `AnimatePresence` from the import once unused (oxlint fails on unused imports).
- Use the Edit tool on the file, no scripted read-modify-write.

## Steps

1. Edit `Count` to the plain span above (remove `motion.span`, `key`, `initial`, `animate`, `transition`).
2. Edit `Branch` to the target above: remove the `exit` prop and the `translateY` initial/animate; keep `layout`; the inner `motion.div` animates opacity only.
3. In `ConceptTimeline`, replace the `motion.span key={newest.id}` block with a plain `<span>` holding the same label and count children.
4. Remove the two `<AnimatePresence initial={false}>` wrappers and their closing tags; fix indentation of the children.
5. Remove `animate-pulse` from the current Phase node dot (line 109).
6. Add `motion-reduce:animate-none` to the ping span (line 57).
7. Remove `AnimatePresence` from the `motion/react` import.

## Boundaries

- Do NOT touch any file other than `concept-timeline.tsx`.
- Do NOT change markup, copy, colours or the tree connectors.
- Do NOT add dependencies.
- If a step does not match the code you find (drift since commit 81fbda2c), STOP and report instead of improvising.

## Verification

- **Mechanical**: from the worktree root, `git add -A && node scripts/check-changed.mjs` prints `check ok`.
- **Feel check** (needs a person): open `http://localhost:3101/dev/trace-concepts?v=1` at 1x speed. Each new entry should read as one calm event: the list opens a gap and the new row fades into it. At 5x it should not feel like a flicker. Play it with the DevTools Animations panel at 10% speed to check that the shift and the fade end together.
- **Reduced motion**: with `prefers-reduced-motion: reduce` emulated, rows still appear (fade) but nothing shifts and nothing pings.
