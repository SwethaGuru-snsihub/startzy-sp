'use client';
import { useEngine } from '@/engine/useEngine';
import { S } from '@/engine/engine';
import Landing from '@/components/shell/Landing';
import Workspace from '@/app/page';

/* Explicit route for the legacy standalone landing page and demo experience */
export default function LegacyDemoPage() {
  useEngine();
  if (!S.started) {
    return <Landing />;
  }
  return <Workspace />;
}
