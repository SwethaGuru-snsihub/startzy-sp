import { NextResponse } from 'next/server';
import { aiProviderFor, providerNameFromEnv } from '@/features/sp/ai';
import { handleAiTask, parseJsonBody } from '@/features/sp/ai/handler';

export const runtime = 'nodejs';

// POST /api/ai  { task, input }  runs one registered AI task. See features/sp/ai/handler.ts for the rules.
export async function POST(request: Request) {
  const parsed = parseJsonBody(await request.text().catch(() => ''));
  if (!parsed.ok) return NextResponse.json({ error: parsed.error }, { status: parsed.status });
  const provider = aiProviderFor(providerNameFromEnv(process.env));
  const r = await handleAiTask({ host: request.headers.get('host'), origin: request.headers.get('origin'), body: parsed.body, signal: request.signal }, provider);
  return NextResponse.json(r.body, { status: r.status, headers: r.headers });
}
