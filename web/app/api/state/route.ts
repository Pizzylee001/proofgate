import { NextResponse } from 'next/server';
import { ethers } from 'ethers';
import { ADDRESSES, REGISTRY_ABI, GATE_ABI, ERC20_ABI, provider, getFixtures, explorerTx, explorerAddress } from '@/lib/chain';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(req: Request) {
  try {
    const { searchParams } = new URL(req.url);
    const policyIdParam = searchParams.get('policyId');
    const p = provider();
    const registry = new ethers.Contract(ADDRESSES.registry, REGISTRY_ABI, p);
    const gate = new ethers.Contract(ADDRESSES.gate, GATE_ABI, p);
    const credit = new ethers.Contract(ADDRESSES.creditToken, ERC20_ABI, p);

    const policyCount = Number(await registry.policyCount());

    let policy = null;
    let provenOnRecord = 0;
    if (policyIdParam) {
      const policyId = BigInt(policyIdParam);
      if (policyId >= 1n && policyId <= BigInt(policyCount)) {
        const raw = await registry.getPolicy(policyId);
        policy = {
          policyId: policyId.toString(),
          maxLoanAmount: ethers.formatEther(raw.maxLoanAmount),
          minCompletedRepayments: Number(raw.minCompletedRepayments),
          requiredSourceChainId: Number(raw.requiredSourceChainId),
          requiredSourceChainKey: Number(raw.requiredSourceChainKey),
          requiredSourceToken: raw.requiredSourceToken,
          vaultAddress: raw.vaultAddress,
          policyTextHash: raw.policyTextHash,
        };
        provenOnRecord = Number(await gate.provenRepaymentCount(policyId, ADDRESSES.borrower));
      }
    }

    // The Attestcoin-verified repayment history (facts proven on Day 3).
    const provenHistory = getFixtures().map((f) => ({
      amountPgusd: f.amountPgusd,
      blockHeight: f.blockHeight,
      txHash: f.txHash,
      explorerUrl: explorerTx(f.txHash),
      token: ADDRESSES.pgusd,
      to: ADDRESSES.vault,
    }));

    const borrowerBalance = ethers.formatEther(await credit.balanceOf(ADDRESSES.borrower));

    return NextResponse.json({
      policyCount,
      policy,
      provenOnRecord,
      provenHistory,
      borrower: ADDRESSES.borrower,
      borrowerExplorer: explorerAddress(ADDRESSES.borrower),
      borrowerBalance,
      gate: ADDRESSES.gate,
      gateExplorer: explorerAddress(ADDRESSES.gate),
    });
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 500 });
  }
}
