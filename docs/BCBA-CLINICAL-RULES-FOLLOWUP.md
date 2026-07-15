# Quick follow-up for Ariana — one area

Your answers unblocked almost everything — thank you. Only one spot needs nailing down, plus one small detail. This should take 5 minutes.

## The mastery model (from your B2 answer)

You said mastery depends on how the goal is written — some are "80% across 16 consecutive sessions," others "80% across 2 consecutive months (monthly average)." That's exactly the thing we can't hardcode, so we want to let the BCBA build the criterion from a few dropdowns per goal:

> **Threshold** [80] **%independent, across** [N] **consecutive** [ sessions / weeks / months ], **evaluated as** [ each one must hit it / the pooled average must hit it ], **minimum** [5] **trials for a session/period to count.**

So your two examples would be entered as:
- "80% across 2 consecutive months" → 80% · 2 · months · **pooled average** · (min trials as you like)
- "80% across 16 consecutive sessions" → 80% · 16 · sessions · **??**

**Q1.** Does that dropdown model capture how you and your BCBAs actually write mastery goals? Anything it can't express?

**Q2.** For the **session** style ("16 consecutive sessions"), is the default **"each session must hit 80%"** or **"the average across the 16 must hit 80%"**? (For months you already said pooled average.)

**Q3.** Do you need **weeks** as a window, or are **sessions** and **months** enough?

**Q4.** For a **pooled-average** window (e.g. a month): does a month need a **minimum number of sessions** in it before it can count toward mastery, or is the min-trials rule enough on its own?

## One maintenance detail

You said a mastered goal that fails maintenance should **flag for review** — got it.

**Q5.** What counts as a maintenance probe **passing**? Is a probe a single opportunity where **independent = pass**, and how many **failed probes in a row** should trigger the flag (1? 2?)?

---

*That's everything. Once these come back, both the scoring changes and the full mastery evaluator get built straight from your answers.*
