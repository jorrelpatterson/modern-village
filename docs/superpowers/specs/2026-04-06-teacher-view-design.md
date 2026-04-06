# Teacher View — Design Spec

**Date:** 2026-04-06
**Scope:** Sub-project 4 of Phase 3 — Teacher features
**Depends on:** Sub-project 1 (Role system), Sub-project 2 (Caregiver network)
**Files affected:** `app.html`, small SQL migration for RLS update

---

## Overview

Build the teacher experience: aggregated behavior summaries with expandable detail, behavior logging capability, and integration with existing IEP toolkit, read-only routines, and care team notes.

**What teachers can do:**
- View aggregated behavior summaries (trends, top behaviors, triggers, peak times)
- Expand to see individual behavior log entries
- Log behaviors that happen at school (attributed to teacher)
- Use IEP Toolkit (all wizards)
- View routines (read-only)
- Read and post care team notes
- View resources

**What teachers cannot do:**
- Use AI Coach
- Access Community or Pros/marketplace
- Create/edit routines
- See parent AI conversations or daily check-ins
- Access billing/subscription

---

## Behavior Summary Overlay

New overlay page showing aggregated child behavioral data:

- This week: incident count + comparison to last week
- 30-day trend: improving/increasing/stable with percentage
- Peak times: morning/afternoon/evening/night breakdown
- Top behaviors: ranked by frequency
- Top triggers: ranked by frequency
- Strategy effectiveness: what works
- Expandable "View Recent Logs" section with individual entries

Uses existing `detectPatterns()` function — different presentation, same data.

## RLS Update

Add 'school' to the caregiver behavior log INSERT policy so teachers can log.

## Sidebar Updates

Add "Behavior Summary" and "Behavior Tracker" to teacher role items.

## Implementation Order

1. SQL migration — RLS policy update for teacher behavior logging
2. Behavior Summary — HTML overlay + CSS + JS
3. Sidebar updates — add teacher items
4. Final verification
