'use client';
import { useState } from 'react';
import { useEngine } from '@/engine/useEngine';
import OfficeMap from '@/components/office/OfficeMap';
import { InboxCard, WorkQueue, EngineDetail, ActivityFeed } from '@/components/rail/Rail';

/* G05 v2 · Founder HQ */
export default function FounderHQ() {
  useEngine();
  const [sel, setSel] = useState<string | null>(null);
  return (
    <div className="grid gap-4 items-start" style={{ gridTemplateColumns: 'minmax(0,1fr) 360px' }}>
      <div className="min-w-0"><OfficeMap selected={sel} onSelect={setSel} /></div>
      <div className="flex flex-col gap-4">
        {sel ? <EngineDetail id={sel} onClose={() => setSel(null)} /> : <InboxCard limit={4} />}
        <WorkQueue />
        <ActivityFeed n={5} />
      </div>
    </div>
  );
}
