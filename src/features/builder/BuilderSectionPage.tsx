'use client';
import { useReadyProject } from '@/features/shell/ProjectProvider';
import { BUILDER_SECTIONS, R, type BuilderSection } from '@/features/shell/routes';
import { EmptyState, PageHeader } from '@/ui';

const COPY: Record<BuilderSection, { title: string; purpose: string }> = {
  package: { title: 'Package review', purpose: 'Review the approved handoff package: its inputs, versions and pins, and whether it is current or stale, then accept or return it.' },
  build: { title: 'Build workspace', purpose: 'Work items and assignments for the build, tracked in the Builder\'s own state, separate from Solution Planning.' },
  quality: { title: 'Testing & quality', purpose: 'Test runs and quality results against the quality plan from Solution Planning step 15.' },
  release: { title: 'Release & delivery', purpose: 'Release candidates, delivery status and release decisions.' },
  operate: { title: 'Optimization & operations', purpose: 'Operating the delivered product and feeding what is learned back to Founder HQ.' },
};

/* A Solution Builder section. The Builder's execution state does not exist yet (Stage I), so this
   page says so and shows no data. */
export default function BuilderSectionPage({ section }: { section: BuilderSection }) {
  const { id } = useReadyProject();
  const c = COPY[section];
  const stage = BUILDER_SECTIONS.find(s => s.key === section)!.stage;
  return (
    <div className="flex flex-col gap-5">
      <PageHeader eyebrow="Solution Builder" title={c.title} />
      <EmptyState title={`${c.title} is not available yet`} stage={stage} href={R.builder(id)} hrefLabel="Back to Builder home">
        {c.purpose} Solution Builder keeps its own execution state, separate from Solution Planning; that state has not been created for this project.
      </EmptyState>
    </div>
  );
}
