# Epic to phase/step crosswalk (draft, needs founder review)

Sources: Google Sheet "Slots mapped" (`Sheet2` epics, `Mapping` tasks) and `src/engine/core/definitions.ts` and `register.ts` (read 2026-11-05).

## Mapping

| Sheet epic | Engine home | Engine tasks today | Note |
|---|---|---|---|
| 1 Idea Understanding & Brief | SP1 (in SJ2) | goal, clarify, brief | Sheet has 11 tasks, engine has 3 |
| 3 Problem Discovery & Validation | SP2 (in SJ3) | research, interviews, problem | Sheet lists it third, but runs before Opportunity |
| 2 Opportunity, Market & Customer Discovery | SP3 (in SJ4), Gate 1 | market, personas, competitors, gate1 | Sheet T21 is Gate 1 (Go, Needs refinement, Stop) |
| 4 Solution Discovery | SP4 (in SJ6) | solution | |
| 5 Business Model & Feasibility | SP5 (in SJ9) | model, estimate, gate2 | Sheet has no Gate 2; engine does |
| 6 Product Definition | SP6 (in SJ10) | mvp | |
| 7 Requirement Register | SP7 (in SJ10) | reqs | Sheet ends with Baseline v1 |
| 8 Documents & Handoff | SP8 (in SJ10) | brd, prd, srs | Sheet adds MRD, FRS and a Handoff Package v1. Engine handoff is SP16 |
| 12 Solution Architecture Design | SP9 (in SJ11) | sad | |
| 22 UX & Product Design | SP10 (in SJ11) | wires | |
| 13 to 21 (HLD, AI, Integration, Database, API, Security, Infrastructure, LLD, Technical) | SP11 (in SJ11) | tech | Nine epics collapse into one engine task |
| 23 Design Validation & Governance | SP12 (in SJ11) | designreview, gate3 | |
| 25 Implementation Backlog Generation | SP13 (in SJ11) | stories | |
| 26 Task Dependency & Sequencing | SP14 (in SJ11) | roadmap | |
| 27 Solution Builder Agent Handoff | SP16 (outside every phase) | handoff | |
| 24 Requirement Traceability | across SP12 to SP16 | none | Pass 1 after design, pass 2 after backlog |
| 9 Change Management | platform | core impact and edit-impact modules | Not a step |
| 10 Skill Integration | platform | none | No engine support yet |
| 11 C-Suite Integration | platform | gates and reviews | Executive review at each gate, no engine model yet |

## Gaps

1. SP15 Quality, Release & Operations has no epic in the sheet.
2. Startup Journey phases SJ1, SJ7, SJ8, SJ12 to SJ18 have no epics in the sheet.
3. Epic 10 (Skill Integration) and the review layer of epic 11 have no engine counterpart.
4. Sheet tasks are finer than engine tasks, so the engine needs sub-task or feature records under each task.
5. Tasks 13.1 and 22.1 start "After S.1", which is not defined in the sheet. Needs a real reference.

## Decisions (founder, 2026-11-06)

1. Epic 2 and 3 order: follow the engine run order. SP2 is Problem Discovery (sheet epic 3), SP3 is Opportunity & Market (sheet epic 2). The crosswalk absorbs the sheet numbering.
2. Gate 1 "Needs refinement": rework inside SP3. Gate 1 gets a "return for rework" outcome. Pivot stays at SJ8 only.
3. Gate 2 and Gate 3: keep the engine gates. The sheet's confirm tasks (5.T13, 23.5) map onto them.
4. Missing epics: add an SP15 epic to the sheet. SJ12 to SJ18 wait until after the Solution Planning UI.

Still true: CSO and BA already exist in the engine roster (`CoreAgentId`). Domain Classifier does not.
