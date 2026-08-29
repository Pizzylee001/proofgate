import { NextResponse } from 'next/server';
import { ethers } from 'ethers';
import { compilePolicy } from '@/lib/llm';
import { ADDRESSES, REGISTRY_ABI, demoSigner, parsePolicyCommitted, explorerTx } from '@/lib/chain';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function POST(req: Request) {
  try {
    const { englishText } = await req.json();
    if (!englishText || typeof englishText !== 'string') {
      return NextResponse.json({ error: 'englishText required' }, { status: 400 });
    }
    // LLM compiles English -> validated Policy JSON
    const compiled = await compilePolicy(englishText, {
      sourceToken: ADDRESSES.pgusd,
      vaultAddress: ADDRESSES.vault,
    });

    // keccak of the ENGLISH text binds the contract to the lender's words
    const policyTextHash = ethers.keccak256(ethers.toUtf8Bytes(englishText.trim()));

    const registry = new ethers.Contract(ADDRESSES.registry, REGISTRY_ABI, demoSigner());
    const tx = await registry.commitPolicy({
      maxLoanAmount: ethers.parseEther(compiled.maxLoanAmount),
      minCompletedRepayments: BigInt(compiled.minCompletedRepayments),
      requiredSourceChainId: BigInt(compiled.requiredSourceChainId),
      requiredSourceChainKey: BigInt(compiled.requiredSourceChainKey),
      requiredSourceToken: compiled.requiredSourceToken,
      vaultAddress: compiled.vaultAddress,
      policyTextHash,
    });
    const receipt = await tx.wait();
    const committed = parsePolicyCommitted(receipt!);
    if (!committed) throw new Error('PolicyCommitted event not found');

    return NextResponse.json({
      policyId: committed.policyId,
      lender: committed.lender,
      txHash: receipt!.hash,
      explorerUrl: explorerTx(receipt!.hash),
      policy: compiled,
      policyTextHash,
    });
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 500 });
  }
}
