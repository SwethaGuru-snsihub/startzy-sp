# Epic 1 (Idea Understanding & Brief) UI slice plan

Status: plan approved on 3 decisions (2026-11-06). Implementation not yet approved.

## Decisions
1. The "goal" question stays a required question for the core. The five sheet slots are asked and extracted alongside it.
2. T2 Domain Classifier and T9 CEO sign-off are labelled simulated UI sub-steps. No engine change in this slice.
3. Two PRs: a pure layer first, then the UI.

## Mapping (sheet task to feature to engine task)

| Sheet tasks | Feature | Engine task |
|---|---|---|
| T1 idea submit | Idea Capture | goal |
| T2 classify, T3 CEO allocate, T4 extract 5 slots | Key fields Extraction / intent detection | goal (simulated sub-steps) |
| T5 slot questions, T6 founder answers | Targeted Clarifying Questions | clarify |
| T7 draft, T8 review, T9 CEO sign-off, T10 founder confirm, T11 lock v1 | Idea Brief Review & Confirmation | brief |

Slots: idea, problem, target_users, expected_outcome, constraints (owner and supporting per slot in `spec.json`).

## PR 1: pure layer (no UI)
- Typed loader for `docs/spec/spec.json` under `src/features/sp/spec/`.
- `epic1.ts`: the 11 tasks mapped to features and engine tasks. Sub-step status derives from engine task status, never stored separately.
- Slot model: value, provenance (founder-confirmed, AI-inferred, assumption), confidence, evidence quote. Extraction stays deterministic and labelled simulated.
- Tests: spec totals (11 tasks, 5 slots, 4 features), every sheet task maps to an engine task, statuses never disagree with the core.

## PR 2: UI
- Reusable epic task timeline (task, responsible, status, slot chips), used by every later epic.
- Workflow tab: each SP1 feature expands to its sheet tasks. User tasks show as "Needs you".
- Slots panel: owner and supporting avatars, value, provenance label, evidence quote.
- Documents tab: Idea Brief v1 shown as locked, with slot values.
- Rail and Office unchanged; they read the same core instance.

## Acceptance
`npm run verify` passes, then a browser check of the full flow: idea, T1 to T11, brief v1 locked, SP2 unlocks.
