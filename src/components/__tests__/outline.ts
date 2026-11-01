// Turns server-rendered HTML into a readable outline for structural snapshots: one element or
// text run per line, indented by depth. Only attributes that carry meaning are kept (links, roles,
// labels, states). Inline styles, class names and generated ids are left out, and SVG drawings
// are reduced to their <svg> line, so the snapshots change when text, structure or behaviour
// changes, not when a colour or pixel position does.
const VOID = new Set(['area', 'base', 'br', 'col', 'embed', 'hr', 'img', 'input', 'link', 'meta', 'source', 'track', 'wbr']);
const KEEP = new Set(['role', 'href', 'type', 'disabled', 'checked', 'value', 'placeholder', 'title', 'aria-label', 'aria-expanded', 'aria-disabled', 'aria-haspopup', 'aria-invalid', 'aria-live', 'aria-hidden']);
const TOKEN = /<!--[\s\S]*?-->|<\/([a-zA-Z][\w-]*)\s*>|<([a-zA-Z][\w-]*)((?:\s+[^\s=>/]+(?:="[^"]*")?)*)\s*(\/?)>|([^<]+)/g;
const ATTR = /([^\s=]+)(?:="([^"]*)")?/g;

const decode = (s: string) => s.replace(/&quot;/g, '"').replace(/&#x27;/g, "'").replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&');

function attrs(raw: string) {
  const kept: string[] = [];
  for (const [, name, value] of raw.matchAll(ATTR)) {
    if (!KEEP.has(name)) continue;
    kept.push(value == null || value === '' ? `[${name}]` : `[${name}=${decode(value)}]`);
  }
  return kept.join('');
}

export function outline(html: string): string {
  const out: string[] = [];
  let depth = 0;
  let hideBelow: number | null = null;
  for (const [, close, open, rawAttrs, selfClose, text] of html.matchAll(TOKEN)) {
    if (close) { depth--; if (depth === hideBelow) hideBelow = null; continue; }
    if (open) {
      const shown = hideBelow === null;
      if (shown) out.push('  '.repeat(depth) + open + attrs(rawAttrs));
      if (!VOID.has(open) && !selfClose) { if (shown && open === 'svg') hideBelow = depth; depth++; }
      continue;
    }
    const t = text ? decode(text).replace(/\s+/g, ' ').trim() : '';
    if (t && hideBelow === null) out.push('  '.repeat(depth) + JSON.stringify(t));
  }
  return out.join('\n') + '\n';
}
