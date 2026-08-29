import { NextResponse } from 'next/server';
import { ethers } from 'ethers';
import {
  ADDRESSES, REGISTRY_ABI, GATE_ABI,
  provider, demoSigner, getFixtures, fixtureToTuple, tamperedTuple,
  sendEvenIfReverting, parsePolicyCommitted, explorerTx,
} from '@/lib/chain';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 120;

/**
 * Try to cheat. The failure IS the feature: both modes return the protocol's
 * own on-chain revert as evidence (status 0 + revert reason + tx hash).
 *
 * mode=fabricate — one byte of a proven txBytes is rewritten (20 -> 21 PGUSD);
 *   the Attestcoin precompile itself rejects it: "Merkle proof validation failed".
 * mode=inflate — a fresh cap-50 policy is committed, one real repayment is
 *   proven, and the agent claims 500: "Agent claim exceeds policy cap".
 *   (claim == cap would NOT revert — it would release the decoded amount,
 *   which is scene 3; the cheat here is claiming MORE than the lender committed.)
 */
export async function POST(req: Request) {
  try {
    const { mode } = await req.json();
    const gate = new ethers.Contract(ADDRESSES.gate, GATE_ABI, demoSigner());

    if (mode === 'fabricate') {
      const registry = new ethers.Contract(ADDRESSES.registry, REGISTRY_ABI, provider());
      const policyId = await registry.policyCount(); // any committed policy works
      const fixture = getFixtures()[0];
      const tuple = tamperedTuple(fixture, '21');

      const result = await sendEvenIfReverting(
        (o) => gate.submitRepaymentProof(policyId, ADDRESSES.borrower, tuple, o),
        () => gate.submitRepaymentProof.staticCall(policyId, ADDRESSES.borrower, tuple),
      );
      return NextResponse.json({
        mode,
        detail: 'Submitted a repayment proof with one tampered byte (amount 20 → 21 PGUSD).',
        ...result,
        explorerUrl: explorerTx(result.txHash),
      });
    }

    if (mode === 'inflate') {
      const registry = new ethers.Contract(ADDRESSES.registry, REGISTRY_ABI, demoSigner());
      // Fresh throwaway policy: cap 50 PGUSD, min 1 repayment.
      const commitTx = await registry.commitPolicy({
        maxLoanAmount: ethers.parseEther('50'),
        minCompletedRepayments: 1n,
        requiredSourceChainId: 11155111n,
        requiredSourceChainKey: 1n,
        requiredSourceToken: ADDRESSES.pgusd,
        vaultAddress: ADDRESSES.vault,
        policyTextHash: ethers.keccak256(ethers.toUtf8Bytes('Dashboard cheat-demo policy: cap 50, min 1')),
      });
      const commitRcpt = await commitTx.wait();
      const committed = parsePolicyCommitted(commitRcpt!);
      if (!committed) throw new Error('PolicyCommitted not found');
      const policyId = BigInt(committed.policyId);

      // Prove the real 20 PGUSD repayment under the fresh policy.
      const fixture = getFixtures()[0];
      const proofTx = await gate.submitRepaymentProof(policyId, ADDRESSES.borrower, fixtureToTuple(fixture));
      const proofRcpt = await proofTx.wait();

      // The agent claims 500 PGUSD — 10x the committed cap.
      const decision = { approved: true, claimedAmount: ethers.parseEther('500'), rationale: 'dashboard inflate attempt' };
      const result = await sendEvenIfReverting(
        (o) => gate.requestCredit(policyId, ADDRESSES.borrower, decision, o),
        () => gate.requestCredit.staticCall(policyId, ADDRESSES.borrower, decision),
      );
      return NextResponse.json({
        mode,
        detail: `Committed a fresh cap-50 policy (#${committed.policyId}), proved a real 20 PGUSD repayment, then the agent claimed 500.`,
        policyId: committed.policyId,
        proofTxHash: proofRcpt!.hash,
        ...result,
        explorerUrl: explorerTx(result.txHash),
      });
    }

    return NextResponse.json({ error: 'mode must be fabricate|inflate' }, { status: 400 });
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 500 });
  }
}
