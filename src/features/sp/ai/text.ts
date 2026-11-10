// Small text helpers for showing a provider's answer.

/** "A.; B?; C." joined cleanly: items that already end in a full stop or similar do not get a second one. */
export const sentenceList = (items: string[]): string => {
  const clean = items.map(s => s.trim().replace(/[\s.;:,]+$/, '')).filter(Boolean);
  if (!clean.length) return '';
  const text = clean.join('; ');
  return /[?!]$/.test(text) ? text : `${text}.`;
};
