// Founder idea draft for the "Start a new company" entry. Client-side only: nothing here is
// sent to a server, and no workspace is created. `submitIdea` is async on purpose, so the real
// onboarding call can replace its body later without changing the screens that use it.

export const IDEA_MIN = 10;
export const IDEA_MAX = 4000;
const KEY = 'startzy.ideaDraft.v1';

export type IdeaError = 'empty' | 'too_short' | 'too_long';
export type SubmitResult = { ok: true; persisted: boolean } | { ok: false; error: IdeaError };

export const IDEA_ERROR_TEXT: Record<IdeaError, string> = {
  empty: 'Tell Atlas a little about your idea to continue.',
  too_short: `A sentence is enough, but please write at least ${IDEA_MIN} characters.`,
  too_long: `That is longer than ${IDEA_MAX.toLocaleString('en-IN')} characters. Trim it to the essentials; you can add detail later.`,
};

/** An incomplete idea is fine. Only reject empty, near-empty and oversized input. */
export function validateIdea(text: string): IdeaError | null {
  const t = text.trim();
  if (!t) return 'empty';
  if (t.length < IDEA_MIN) return 'too_short';
  if (t.length > IDEA_MAX) return 'too_long';
  return null;
}

let memory = '';

export function loadDraft(): string {
  try { const v = window.sessionStorage.getItem(KEY); if (v != null) return v; } catch { /* storage blocked */ }
  return memory;
}

export function saveDraft(text: string): boolean {
  memory = text;
  try { window.sessionStorage.setItem(KEY, text); return true; } catch { return false; }
}

export function clearDraft() {
  memory = '';
  try { window.sessionStorage.removeItem(KEY); } catch { /* storage blocked */ }
}

export async function submitIdea(text: string): Promise<SubmitResult> {
  const error = validateIdea(text);
  if (error) return { ok: false, error };
  return { ok: true, persisted: saveDraft(text.trim()) };
}
