# Startzy SP: working rules for Claude Code

Next.js 16, React 19, TypeScript, vitest. Founder HQ: an 18-phase Startup Journey (SJ) and a 16-step Solution Planning (SP) workflow, run by an agent office on a core engine.

## Before you change anything
- Run `npm run verify` (legacy freeze check, typecheck, lint, tests). It must pass before every commit.
- Plan first and wait for the user's approval before implementing. Work in small slices: one epic or one layer per PR.
- Never commit or push without the user asking. Commits end with the Co-Authored-By line from the session.

## Do not touch
- Legacy files frozen against `6974845`: `src/engine/engine.ts`, `model.ts`, `personas.ts`, `useEngine.ts`, `src/engine/__tests__/driver.ts`, `src/engine/__tests__/engine.test.ts`, `src/onboarding/ideaDraft.test.ts` (see `scripts/check-legacy-freeze.mjs`).
- `archive/phase1-journey-switch` is history. Never merge it.

## Architecture
- New engine core: `src/engine/core` (`project.ts` is the `createCore(clock)` API). Test first; golden traces live in `__tests__/__snapshots__/golden`.
- SP UI: `src/features/sp` (viewModel, workflow, components). Every tab reads the same core instance, so tabs cannot disagree.
- Two independent workflows with separate state and gates. SP9 to SP15 sit inside SJ11. SP16 hands off to Solution Builder.
- Gate 1 is at the end of SP3. Go, Pivot or Stop only at SJ8.
- Artifact versions are immutable and pin their inputs. Revalidation creates a new version.

## Rules for UI and content
- Anything simulated is labelled "Simulated", everywhere.
- Demo presets are demo or test data only. Real founders start from their own idea.
- Demo answers are explicit "demo-answer" records, never verified persona facts.
- No secrets, keys or credentials in code, specs or documents.

## Spec
- Source of truth: Google Sheet "Slots mapped" (`Sheet2` = 27 epics and features, `Mapping` = task tables with slots, owners and supporting roles). A repo copy goes in `docs/spec/`.
- Open mismatches to settle before building: epic 2 and 3 order, epic to phase/step crosswalk, the CSO and BA roles versus the engine roster, "Needs refinement" at Gate 1 versus Pivot.
