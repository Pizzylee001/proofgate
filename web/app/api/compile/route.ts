import { NextResponse } from 'next/server';
import { compilePolicy } from '@/lib/llm';
import { ADDRESSES } from '@/lib/chain';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function POST(req: Request) {
  try {
    const { englishText } = await req.json();
    if (!englishText || typeof englishText !== 'string') {
      return NextResponse.json({ error: 'englishText required' }, { status: 400 });
    }
    const policy = await compilePolicy(englishText, {
      sourceToken: ADDRESSES.pgusd,
      vaultAddress: ADDRESSES.vault,
    });
    return NextResponse.json({ policy, rationale: policy.rationale });
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 500 });
  }
}
