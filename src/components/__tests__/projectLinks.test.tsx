// Inside a startup project every link of the existing Founder HQ screens must stay inside that
// project; outside a project (the demo) the very same screens link exactly as before.
import type { ReactElement } from 'react';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { renderToString } from 'react-dom/server';
import { start, setSpeed, S } from '@/engine/engine';
import Header from '@/components/shell/Header';
import { ProjectBaseProvider } from '@/components/shell/ProjectBase';
import { InboxCard, WorkQueue } from '@/components/rail/Rail';
import Workspace from '@/app/page';
import StagePage from '@/app/stage/[i]/page';
import InboxPage from '@/app/inbox/page';
import BlockPage from '@/app/block/[id]/page';

const nav = vi.hoisted(() => ({ params: {} as Record<string, string> }));
vi.mock('next/navigation', () => ({
  useParams: () => nav.params,
  usePathname: () => '/project/p1',
  useSearchParams: () => new URLSearchParams(),
  useRouter: () => ({ push() {}, replace() {}, back() {}, forward() {}, refresh() {}, prefetch() {} }),
}));

const hrefs = (html: string) => [...html.matchAll(/href="([^"]*)"/g)].map(m => m[1].replace(/&amp;/g, '&'));
const inProject = (el: ReactElement) => renderToString(<ProjectBaseProvider value="/project/p1">{el}</ProjectBaseProvider>);

beforeAll(() => { setSpeed(100); start('veejay'); });
afterAll(() => { setSpeed(1); (S as { started?: boolean }).started = false; });

describe('Founder HQ screens inside a startup project', () => {
  const screens: [string, () => ReactElement, Record<string, string>][] = [
    ['header', () => <Header />, {}],
    ['workspace', () => <Workspace />, {}],
    ['stage', () => <StagePage />, { i: '0' }],
    ['inbox page', () => <InboxPage />, {}],
    ['inbox card', () => <InboxCard limit={4} />, {}],
    ['work queue', () => <WorkQueue />, {}],
    ['block (by blockId)', () => <BlockPage />, { id: 'p1', blockId: 'profile' }],
  ];
  for (const [name, el, params] of screens) {
    it(`${name}: every internal link stays inside /project/p1`, () => {
      nav.params = params;
      const links = hrefs(inProject(el())).filter(h => h.startsWith('/') && !h.startsWith('//'));
      expect(links.length).toBeGreaterThan(0);
      for (const h of links) expect(h.startsWith('/project/p1'), `${name}: ${h}`).toBe(true);
    });
    it(`${name}: outside a project the links are unchanged`, () => {
      nav.params = params;
      const links = hrefs(renderToString(el())).filter(h => h.startsWith('/'));
      for (const h of links) expect(h.startsWith('/project/'), `${name}: ${h}`).toBe(false);
    });
  }

  it('the block page reads the block from blockId inside a project (id is the project)', () => {
    nav.params = { id: 'p1', blockId: 'profile' };
    expect(inProject(<BlockPage />)).toContain('Founder profile');
  });

  it('the header offers the dashboard instead of "Switch founder" inside a project', () => {
    nav.params = {};
    expect(inProject(<Header />)).toContain('All startups');
    expect(renderToString(<Header />)).toContain('Switch founder');
  });
});
