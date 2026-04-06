# Parent Toolkit Upgrade — Design Spec

**Date:** 2026-04-06
**Scope:** 3 features — RLS fix, Routine Builder overhaul, IEP Toolkit enhancement
**Files affected:** `app.html`, `worker.js`, new SQL migration

---

## Feature 1: Community Comments RLS Fix

### Problem

The app code (`app.html:2079`) inserts into `community_comments` with columns that don't exist in the original schema (`_reference/modern-village-database-setup.sql:108`). The original table has `text`; the app uses `content`, `author_name`, `parent_comment_id`, `status`, and `flagged_words`.

### Solution

Single SQL migration that:

1. Adds missing columns with safe defaults (idempotent via `ADD COLUMN IF NOT EXISTS`)
2. Migrates existing data from `text` to `content`
3. Drops and recreates RLS policies to ensure correctness

### Migration SQL

```sql
ALTER TABLE public.community_comments
  ADD COLUMN IF NOT EXISTS author_name text DEFAULT 'Anonymous',
  ADD COLUMN IF NOT EXISTS content text,
  ADD COLUMN IF NOT EXISTS parent_comment_id uuid REFERENCES public.community_comments(id),
  ADD COLUMN IF NOT EXISTS status text DEFAULT 'active',
  ADD COLUMN IF NOT EXISTS flagged_words text[];

UPDATE public.community_comments
  SET content = text
  WHERE content IS NULL AND text IS NOT NULL;

DROP POLICY IF EXISTS "Anyone views comments" ON public.community_comments;
DROP POLICY IF EXISTS "Users create own comments" ON public.community_comments;
DROP POLICY IF EXISTS "Users update own comments" ON public.community_comments;

CREATE POLICY "Anyone views comments"
  ON public.community_comments FOR SELECT USING (true);
CREATE POLICY "Users create own comments"
  ON public.community_comments FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users update own comments"
  ON public.community_comments FOR UPDATE USING (auth.uid() = user_id);
```

### No app code changes needed

The app already handles errors gracefully (`app.html:2089-2092`). Once the DB schema matches, comments will work.

---

## Feature 2: Routine Builder Overhaul

### Goals

- Replace localStorage with Supabase persistence (HIPAA-safe under existing BAA)
- Add per-child routine support
- Add AI-generated routines using the existing adaptive engine
- Improve mobile drag-and-drop with touch events

### New Table: `routines`

```sql
CREATE TABLE public.routines (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id uuid REFERENCES public.profiles(id) ON DELETE CASCADE NOT NULL,
  child_id uuid REFERENCES public.children(id) ON DELETE SET NULL,
  title text NOT NULL,
  steps jsonb NOT NULL DEFAULT '[]',
  source text DEFAULT 'manual',
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

ALTER TABLE public.routines ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users view own routines"
  ON public.routines FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Users create own routines"
  ON public.routines FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users update own routines"
  ON public.routines FOR UPDATE USING (auth.uid() = user_id);
CREATE POLICY "Users delete own routines"
  ON public.routines FOR DELETE USING (auth.uid() = user_id);
```

**Steps JSONB format:** `[{icon: "🌅", name: "Wake up", dur: 5, tip: "Use a visual timer"}]`

- `tip` field is optional, populated by AI-generated routines only

### App Changes (app.html)

**Functions to modify:**

| Function | Current | New |
|----------|---------|-----|
| `saveRoutine()` (line 2909) | localStorage write | Supabase INSERT into `routines` |
| `loadSavedRoutines2()` (line 2923) | localStorage read | Supabase SELECT with child_id filter |
| `loadSavedRoutine(idx)` (line 2946) | localStorage by index | Supabase SELECT by id |
| `deleteSavedRoutine(idx)` (line 2958) | localStorage splice | Supabase DELETE by id |

**New functions to add:**

| Function | Purpose |
|----------|---------|
| `generateAIRoutine()` | Calls fetchChildContext() → builds prompt → sends to worker → populates builder |
| `touchDragStart(e)` | Touch-friendly drag initiation |
| `touchDragMove(e)` | Touch-friendly drag tracking with visual feedback |
| `touchDragEnd(e)` | Touch-friendly drop and reorder |

**UI changes to Routine Builder overlay:**

1. Add child selector dropdown at top of routine builder (populated from `S.children` array, defaults to active child)
2. Add "AI Suggest" button next to template row:
   ```
   [Morning] [After School] [Bedtime] [Transitions]  |  [✨ AI Suggest]
   ```
3. When AI-generated, show tips below each step in a subtle sage-colored hint box
4. Add `data-id` attribute to saved routine cards for Supabase ID tracking

**localStorage migration:** On first load after update, check if `mv_routines` exists in localStorage. If so, migrate each routine to Supabase (INSERT with `source: 'manual'`), then clear localStorage. Show toast: "Routines synced to your account!"

### AI Routine Generation

**Trigger:** Parent taps "AI Suggest" button, selects context from dropdown:
- Morning routine
- After school / arrival home
- Bedtime / wind-down
- Transition between activities
- Homework / focus time
- Mealtime

**Flow:**

1. Call `fetchChildContext()` to get behavioral patterns (reuses existing function)
2. Build prompt with child profile + pattern summary + selected routine context
3. Send to Cloudflare Worker (existing `/` endpoint, same auth)
4. System prompt instructs Claude to return valid JSON only:
   ```
   Return a JSON object: {"title": "...", "steps": [{"icon": "emoji", "name": "step name", "dur": minutes, "tip": "brief ABA tip"}]}
   Include 5-8 steps. Each step should be concrete and actionable. Tips should reference ABA principles.
   ```
5. Parse response, populate `routineSteps` array, set title, call `renderRoutineSteps()`
6. Parent can edit/reorder/remove steps before saving
7. On save, `source` field set to `'ai'`

**Worker change:** None needed — existing POST `/` handles arbitrary Claude requests.

### Mobile Drag-and-Drop

Replace current HTML5 drag events with touch events on mobile:

- `touchstart` → record finger position and dragged element, add `.dragging` class
- `touchmove` → translate element with finger, detect target step by `elementFromPoint()`, show insertion indicator
- `touchend` → reorder array, re-render, remove `.dragging` class
- Keep existing mouse drag events for desktop

New CSS:
```css
.routine-step.dragging { opacity: 0.5; transform: scale(1.02); }
.routine-step.drag-over { border-color: var(--sage); background: var(--sage-light); }
```

---

## Feature 3: IEP Toolkit — PDF Upload & AI Analysis

### Goals

- Add a new "Upload & Analyze" wizard to the IEP hub
- Client-side PDF text extraction (no PHI leaves the device as a file)
- AI analysis: extract goals, services, accommodations, flag gaps
- Cross-reference with child's behavioral data for personalized insights

### Dependencies

**pdf.js v3.x** — Mozilla's PDF text extraction library, loaded from CDN:
```html
<script src="https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.min.js"></script>
```
Exposes `pdfjsLib` as a global — no module system needed, matches vanilla JS style.

### New IEP Hub Entry

Add a 6th card to the IEP hub (alongside Letter, Prep, Explain, Rights, Goals):

```
📄 Upload & Analyze Your IEP
Upload a PDF and get a plain-English breakdown of goals,
services, and accommodations — plus personalized insights.
```

Clicking opens `startWizard('analyze')` → `renderAnalyzeWizard()`

### Upload & Analyze Wizard Flow

**Step 1 — Upload**
- File input accepting `.pdf` only, styled as a drop zone
- "Choose PDF" button + drag-and-drop area
- Max file size: 10MB (client-side check)
- On file select: extract text immediately, show page count and preview of first 200 chars

**Step 2 — Extract Text (client-side)**
```javascript
async function extractPdfText(file) {
  var arrayBuffer = await file.arrayBuffer();
  var pdf = await pdfjsLib.getDocument({data: arrayBuffer}).promise;
  var text = '';
  for (var i = 1; i <= pdf.numPages; i++) {
    var page = await pdf.getPage(i);
    var content = await page.getTextContent();
    text += content.items.map(function(item) { return item.str }).join(' ') + '\n';
  }
  return text;
}
```

**Step 3 — AI Analysis**
- Show "Analyzing your IEP..." loading state
- Call `fetchChildContext()` to get behavioral patterns
- Send to Cloudflare Worker with structured prompt

System prompt:
```
You are an IEP document analyst helping parents understand their child's
Individualized Education Program. Extract and explain all components in
plain English. Be warm, supportive, and empowering. Return valid JSON.
```

User prompt includes extracted IEP text + child profile + behavioral pattern summary.

Response JSON structure:
```json
{
  "goals": [{"area": "...", "goal_text": "...", "plain_english": "...", "measurement": "...", "questions": ["..."]}],
  "services": [{"type": "...", "frequency": "...", "provider": "...", "notes": "..."}],
  "accommodations": ["..."],
  "gaps": [{"concern": "...", "explanation": "...", "action": "..."}],
  "summary": "..."
}
```

**Step 4 — Display Results**

Results shown in expandable card sections:

1. **Summary** — 2-3 sentence overview at top
2. **Goals** — Each goal in its own card: original text (gray), plain-English translation (prominent), measurement, questions to ask
3. **Services** — Table: type, frequency, provider
4. **Accommodations** — Checklist format
5. **Gaps & Concerns** — Highlighted cards referencing child's behavioral data

**Bottom actions:**
- "Copy Full Analysis" — copies all sections as formatted text
- "Discuss with AI Coach" — opens chat tab with context pre-loaded
- "Re-upload" — clear and start over

### Worker Changes

No endpoint changes needed. Client sends `max_tokens: 2000` in request body. The worker already passes through `max_tokens` from the request (`worker.js:77`). Current cap is 2000, sufficient for structured JSON.

### New CSS

```css
.iep-upload-zone {
  border: 2px dashed var(--sand);
  border-radius: 16px;
  padding: 32px;
  text-align: center;
  cursor: pointer;
  transition: all 0.15s;
}
.iep-upload-zone:hover, .iep-upload-zone.dragover {
  border-color: var(--sage);
  background: var(--sage-light);
}
.iep-result-card {
  background: white;
  border-radius: 14px;
  padding: 16px;
  margin-bottom: 12px;
  border: 1px solid var(--sand);
}
.iep-result-card.gap {
  border-left: 4px solid var(--terracotta);
  background: #FFF8F5;
}
.iep-goal-original {
  font-size: 12px;
  color: var(--warm-gray-light);
  font-style: italic;
  margin-bottom: 8px;
}
.iep-goal-plain {
  font-size: 15px;
  line-height: 1.6;
  font-weight: 600;
}
```

---

## Implementation Order

1. **RLS Fix** — SQL migration (run in Supabase SQL editor)
2. **Routine Builder** — New table + localStorage migration + Supabase CRUD + child selector + touch drag + AI generation
3. **IEP Toolkit** — pdf.js CDN + new wizard + extraction + analysis + results UI

## Out of Scope

- IEP PDF storage (client-side only for HIPAA safety)
- Routine timer/countdown mode (future feature)
- IEP goal progress tracking over time (future feature)
- Offline support / service worker
- Changes to admin.html
