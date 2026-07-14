# Clinical rules questionnaire — for Ariana

**Why you're getting this:** two features in the BCBA module are built right up to the point where they need a *clinical* decision, and we don't want to invent clinical logic. Everything below is a real choice that changes what the numbers mean in a billable record.

**How to answer:** each question has a **suggested default** — if you agree, just write "yes / default." Only spend time where you disagree. Should take ~15 minutes. There are no wrong answers; there is a wrong outcome if we guess.

**Context you need:** the app currently records a trial with one of two taps.
- **"Independent"** → saved as prompt level `independent`, response `correct`.
- **"Needed help"** → opens a sheet with: *Verbal prompt · Gestural prompt · Partial physical prompt · Full physical prompt · Incorrect*.
  - Choosing any prompt level saves response = `prompted`.
  - Choosing "Incorrect" saves response = `incorrect` **with no prompt level**.

---

## Section A — How a trial gets scored

Two outcomes are currently **impossible to record**, and we think both are real:

1. **Prompted and correct.** A kid who completes the step correctly with a gestural prompt is making genuine progress down the hierarchy — but today that's filed as `prompted`, which does not count as correct.
2. **Prompted and still incorrect.** If you give a full physical prompt and they *still* don't do it, you can either log "Full physical" (which implies it worked) or "Incorrect" (which throws away the prompt level). You can't record both.

A knock-on effect: because `correct` can only come from the Independent button, **`% correct` and `% independent` are currently always the identical number** — one of them is decorative.

**A1.** After the therapist picks a prompt level, should the app then ask **correct or incorrect**?
> *Suggested default: **Yes** — one extra tap, and it makes both missing outcomes recordable.*
>
> **Answer:**

**A2.** If yes to A1 — is that extra tap acceptable **during a live session**, or is speed so critical that you'd rather keep it to one tap and accept the data loss?
> *Suggested default: acceptable — accuracy beats one tap.*
>
> **Answer:**

**A3.** How should the two headline numbers be defined?
> *Suggested default:*
> - *`% independent` = independent-and-correct ÷ total trials* — **this is the mastery-relevant number**
> - *`% correct` = (independent-correct **+** prompted-correct) ÷ total trials* — *shows the child is acquiring the skill even while still prompted*
>
> **Answer:**

**A4.** Which number should drive **the progress graph** the BCBA and the parent look at?
> *Suggested default: graph `% independent` as the primary line, with `% correct` as a lighter secondary line — so you can see acquisition and independence diverge.*
>
> **Answer:**

**A5.** Do you want a **prompt-level breakdown** (how many trials at each level this session)? That's what actually shows prompt fading — e.g. "moved from mostly partial-physical to mostly gestural."
> *Suggested default: **Yes**, shown on the session summary and the target graph.*
>
> **Answer:**

---

## Section B — Mastery

Right now the app **collects** mastery criteria on every target but **never evaluates them.** Targets never advance on their own, nothing is ever marked mastered, and the "first trial independent" checkbox currently does nothing at all.

The fields already on each target are:
- **`response_pct`** — a percentage threshold (defaults to 80)
- **`consecutive_sessions`** — a number of sessions (defaults to 3)
- **`first_trial_independent`** — a yes/no checkbox

**B1.** Is the `response_pct` threshold measured on **% independent** or **% correct**? (Depends on A3.)
> *Suggested default: **% independent**.*
>
> **Answer:**

**B2.** Must **each** of the last N sessions hit the threshold, or is it the **average** across them?
>  This one matters a lot. The code today averages, and averaging is wrong: a child scoring **100%, 100%, 40%** averages to 80% and would falsely trip an 80% criterion — even though they clearly regressed.
>
> *Suggested default: **each** of the last N consecutive sessions must independently meet the threshold.*
>
> **Answer:**

**B3.** **Minimum trials per session** for that session to count toward mastery at all? Without this, a 2-trial session at 100% can trigger mastery.
> *Suggested default: **5** trials minimum.*
>
> **Answer:**

**B4.** What does **"first trial independent"** actually mean operationally? (It's a checkbox today with no defined behavior.)
> *Suggested default: the **first trial of each** of those N consecutive sessions must be independent — i.e. it's cold-probe evidence they retained it, not that they warmed up into it.*
>
> **Answer:**

**B5.** When criteria are met, should the app **auto-promote** the target (mark it mastered), or **suggest it and require a BCBA to confirm**?
> *Suggested default: **suggest + require confirmation.** Silently changing a clinical status with no human in the loop seems like a bad idea; a "3 targets ready for mastery review" prompt seems right.*
>
> **Answer:**

**B6.** After mastery — what should happen? The target already has maintenance settings (`probe_frequency`, `probes_required`, default 2 probes).
> *Suggested default: move to **maintenance** and start scheduling probes at the configured frequency.*
>
> **Answer:**

**B7.** Should a mastered target that later **fails maintenance probes** automatically drop back into active treatment, or just flag for review?
> *Suggested default: **flag for review** (same reasoning as B5).*
>
> **Answer:**

---

## Section C — Anything we've got wrong

**C1.** Does anything above not match how you'd actually run a program? Anything we've mis-modeled, or a rule your practice uses that we haven't asked about?

> **Answer:**

**C2.** Is there any regulatory/payer requirement (insurance, BACB) that constrains how mastery or prompt levels must be documented, which we should be encoding?

> **Answer:**

---

*Once this comes back, both features get built directly from these answers — no interpretation in between.*
