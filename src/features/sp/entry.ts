// In this branch Solution Planning is the front door. The Startzy account screens (sign-in, sign-up,
// dashboard) and the bare root open it instead. The Startzy project routes (/project/...) and the
// standalone demo are untouched and still work by their own address; nothing links to them any more.
export const SP_HOME = '/sp';

const ENTRY_ROOTS = ['/auth', '/dashboard'];
export function opensSolutionPlanning(path: string | null | undefined): boolean {
  if (!path) return false;
  if (path === '/') return true;
  return ENTRY_ROOTS.some(root => path === root || path.startsWith(`${root}/`));
}
