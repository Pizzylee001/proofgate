import { ethers } from 'ethers';
import { decide } from '@/lib/llm';
import {
  ADDRESSES, REGISTRY_ABI, GATE_ABI, ERC20_ABI,
  provider, demoSigner, parseCreditReleased,
  getFixtures, fixtureToTuple, explorerTx,
} from '@/lib/chain';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 300;

/**
 * Streaming decision loop (SSE) — the dashboard stepper follows REAL phases:
 *   proving (only if proofs not yet on record) -> thinking (LLM) -> executing -> done
 * Events: {"phase": "..."} lines; final phase is done|declined|error.
 */
export async function POST(req: Request) {
  const { policyId: policyIdRaw, borrower, askAmount } = await req.json();
  const encoder = new TextEncoder();

  const stream = new ReadableStream({
    async start(controller) {
      const send = (obj: Record<string, unknown>) =>
        controller.enqueue(encoder.encode(`data: ${JSON.stringify(obj)}\n\n`));
      try {
        if (!policyIdRaw || !borrower || !askAmount) throw new Error('policyId, borrower, askAmount required');
        const policyId = BigInt(policyIdRaw);

        const p = provider();
        const registry = new ethers.Contract(ADDRESSES.registry, REGISTRY_ABI, p);
        const gate = new ethers.Contract(ADDRESSES.gate, GATE_ABI, demoSigner());
        const credit = new ethers.Contract(ADDRESSES.creditToken, ERC20_ABI, p);

        const raw = await registry.getPolicy(policyId);
        const policyJson = {
          maxLoanAmount: ethers.formatEther(raw.maxLoanAmount),
          minCompletedRepayments: Number(raw.minCompletedRepayments),
          requiredSourceChainId: Number(raw.requiredSourceChainId),
          requiredSourceChainKey: Number(raw.requiredSourceChainKey),
          requiredSourceToken: raw.requiredSourceToken,
          vaultAddress: raw.vaultAddress,
          policyTextHash: raw.policyTextHash,
        };
        send({ phase: 'policy', policy: policyJson });

        const fixtures = getFixtures();
        const onRecord = Number(await gate.provenRepaymentCount(policyId, borrower));
        const proofTxHashes: string[] = [];
        if (onRecord < fixtures.length) {
          send({ phase: 'proving', total: fixtures.length, done: onRecord });
          for (let i = onRecord; i < fixtures.length; i++) {
            const tx = await gate.submitRepaymentProof(policyId, borrower, fixtureToTuple(fixtures[i]));
            const rcpt = await tx.wait();
            proofTxHashes.push(rcpt!.hash);
            send({ phase: 'proving', total: fixtures.length, done: i + 1, txHash: rcpt!.hash, explorerUrl: explorerTx(rcpt!.hash) });
          }
        }

        send({ phase: 'thinking' });
        const provenRepayments = fixtures.map((f) => ({
          amountPgusd: f.amountPgusd, token: ADDRESSES.pgusd, to: ADDRESSES.vault,
          blockHeight: f.blockHeight, txHash: f.txHash,
        }));
        const decision = await decide(policyJson, provenRepayments, { borrower, requestedAmount: String(askAmount) });

        if (!decision.approved) {
          send({ phase: 'declined', rationale: decision.rationale, proofTxHashes });
          controller.close();
          return;
        }

        send({ phase: 'executing' });
        const balBefore = ethers.formatEther(await credit.balanceOf(borrower));
        const tx = await gate.requestCredit(policyId, borrower, {
          approved: true,
          claimedAmount: ethers.parseEther(decision.amount),
          rationale: decision.rationale,
        });
        const receipt = await tx.wait();
        const released = parseCreditReleased(receipt!);
        const balAfter = ethers.formatEther(await credit.balanceOf(borrower));

        send({
          phase: 'done',
          rationale: decision.rationale,
          proofTxHashes,
          txHash: receipt!.hash,
          explorerUrl: explorerTx(receipt!.hash),
          receipt: released,
          balanceBefore: balBefore,
          balanceAfter: balAfter,
        });
      } catch (e) {
        send({ phase: 'error', message: (e as Error).message });
      } finally {
        controller.close();
      }
    },
  });

  return new Response(stream, {
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      Connection: 'keep-alive',
    },
  });
}
