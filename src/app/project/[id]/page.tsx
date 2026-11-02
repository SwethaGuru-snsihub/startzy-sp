'use client';
import Workspace from '@/app/page';
import JourneyPanels from '@/components/project/JourneyPanels';

/* /project/[id]: the Founder HQ workspace (the same page the demo opens), with this startup's
   18-phase Startup Journey and 16-step Solution Planning workflow under it. "Enter Founder HQ" opens
   the Office Map. The frame, session and links are provided by the project layout. */
export default function ProjectHome() {
  return (
    <>
      <Workspace />
      <JourneyPanels />
    </>
  );
}
