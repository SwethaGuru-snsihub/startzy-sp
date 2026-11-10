import { NextResponse } from 'next/server';
import { providerFor, providerNameFromEnv } from '@/features/sp/ai';
import { handleIdeaBrief } from '@/features/sp/ai/handler';

export const runtime = 'nodejs';

export async function POST(request: Request) {
  let body: unknown = null;
  try { body = await request.json(); } catch { /* handled as a bad request */ }
  const provider = providerFor(providerNameFromEnv(process.env));
  const r = await handleIdeaBrief({ host: request.headers.get('host'), origin: request.headers.get('origin'), body, signal: request.signal }, provider);
  return NextResponse.json(r.body, { status: r.status, headers: r.headers });
}
