# Solution Planning: progress summary

As of 2026-11-06. Branch `claude/solution-planning` (from `feature/sp-agent-office`), PR: https://github.com/SwethaGuru-snsihub/startzy-sp/pull/1

## 1. Goal
Bring the phases and steps mapped in the Google Sheet "Slots mapped" into the Founder HQ UI, built fully with Claude Code (Pro login, GitHub co-author commits). Working method: plan first, wait for approval, then build in small slices. `npm run verify` must pass before every commit.

## 2. Background
- Two workflows under one project: the 18-phase Startup Journey (SJ) and the 16-step Solution Planning (SP).
- SP9 to SP15 sit inside SJ11. SP16 hands off to Solution Builder. Gate 1 is at the end of SP3. Go/Pivot/Stop is only at SJ8.
- The sheet has 27 epics, 250 tasks, 147 slot rows and 271 features. The engine has far fewer tasks (for example, 3 for SP1).
- Decision: map the sheet onto the engine in the UI layer only. No engine change.

## 3. Done

| Item | Status | Where |
|---|---|---|
| Project rules (`CLAUDE.md`) | Done | repo root |
| Epic to step crosswalk, with founder decisions | Done | `docs/spec/crosswalk.md` |
| Sheet parsed to data (250 tasks, 147 slots) | Done | `docs/spec/spec.json` |
| Gap report (sheet tasks vs engine tasks, counts only) | Done | `docs/spec/gap-report.md` |
| Epic 1 plan | Done | `docs/spec/epic1-plan.md` |
| Epic 1 pure layer (PR 1): spec loader, 11-task mapping, 5-slot model | Done, committed | `src/features/sp/spec/`, `slots.ts` |
| Epic 1 UI (PR 2): task timeline, slots panel, "Idea brief v1 locked" | Done, committed | `src/features/sp/components/` |
| Push and PR | Done | PR #1, open, not merged |

Verification: `npm run verify` passes (475 tests). Lint shows 6 older warnings in `Header.tsx` and `routes.ts`. The flow was also walked in the browser: idea, 3 answers, brief, confirm, SP1 4/4, SP2 starts.

## 4. Founder decisions (2026-11-06)
- Epic order follows the engine: Problem Discovery is epic 2, Opportunity is epic 3. The sheet's original number is kept as `sheetEpic`.
- Gate 1: "Needs refinement" becomes a return for rework in SP3. The engine change is agreed in principle, not built.
- Gates 2 and 3: keep the engine's gates.
- Missing epics: add an SP15 (test plan) epic only.
- Goal question stays required.
- Extra sheet steps become UI sub-steps, simulated.
- Delivery: two PRs per epic (pure layer, then UI).

## 5. How epic 1 was built (the template for the rest)
- 11 sheet tasks laid over 3 engine tasks: `goal`, `clarify`, `brief`.
- Statuses are derived from engine task statuses and never stored, so screens cannot disagree with the core.
- Steps the engine does not have (T2 to T5, T9) are marked UI-only and labelled "Simulated".
- Slots carry provenance (explicit, inferred, confirmed, assumption, empty), confidence, evidence quote and rationale. Max 3 questions per round, 2 rounds.
- Tests first: vitest, server-render component tests, and a real core runtime with in-memory storage.

## 6. Plan: epic 2, Problem Discovery & Validation (awaiting approval)
- Sheet: 14 tasks, 9 slots, 5 features. The founder has 3 tasks: T4 answers, T7 framing pick, T13 confirm.
- Engine SP2 has 3 tasks. Mapping: `research` = T1 to T3, `interviews` = T4, `problem` = T5 to T14.
- Differences from epic 1: facts with source, date, confidence and `ai_estimated`/`sourced` label; a rule that blocks framing unless `problem` and `affected_users` are known; a root cause tree linked to facts; an evidence score; a ranked assumption register. The slot model must be generalized per epic.
- Loops in the sheet (T8, T11, T13 returning to earlier tasks) are shown as notes, not modelled.
- Slices: PR 3 pure layer, PR 4 UI.
- Open questions for the founder: (1) is T7 a UI-only pick with T13 as the real approval, (2) all facts simulated and labelled `ai_estimated`, (3) same question limits as epic 1.

## 7. Remaining work

| Item | Notes |
|---|---|
| Epic 2 | Plan written, needs the 3 answers above, then PR 3 and PR 4 |
| Epics 3 to 27 | Reuse the timeline and slot components. Epics 13 to 21 collapse into one engine task (SP11 `tech`) |
| SP15 epic spec | Agreed to add to the sheet, not drafted |
| Task-level gap report | Only counts exist so far |
| Gate 1 "return for rework" | Decided, engine change not made |
| Optional: move the xlsx parser into `scripts/` | Parser currently lives outside the repo |

## 8. Known notes
- All agent output in the UI is simulated today and labelled so. Real founders will need an API key and a check of Anthropic's current terms; a Pro login is fine for building this project with Claude Code.
- The start popup's project-name box is prefilled, so typing appends to it. This was already the case.
- The sheet's T1 has no output text, so the screen uses its process text as the title.
- Slots show in Extraction and Clarifying, not in the Brief tab.
- Hooks (for example a pre-commit `verify`) are not set up. `CLAUDE.md` rules are followed by Claude but not enforced by the app.
