/**
 * ProofGate web — server-side LLM module (ESM port of agent/llm.ts).
 * Provider-agnostic: LLM_BASE_URL, LLM_API_KEY, LLM_MODEL. Temperature 0,
 * strict JSON, validate everything, abort loudly. NEVER fabricate a decision.
 * SERVER ONLY — must never be imported by client components.
 */
import OpenAI from 'openai';

export interface PolicyJSON {
  maxLoanAmount: string;
  minCompletedRepayments: number;
  requiredSourceChainId: number;
  requiredSourceChainKey: number;
  requiredSourceToken: string;
  vaultAddress: string;
  rationale: string;
}

export interface AgentDecisionJSON {
  approved: boolean;
  amount: string;
  rationale: string;
}

function client(): OpenAI {
  const baseURL = process.env.LLM_BASE_URL;
  const apiKey = process.env.LLM_API_KEY;
  if (!baseURL || !apiKey || !process.env.LLM_MODEL) {
    throw new Error('LLM_BASE_URL, LLM_API_KEY and LLM_MODEL must be set');
  }
  return new OpenAI({ baseURL, apiKey });
}

async function chatJSON(system: string, user: string): Promise<unknown> {
  const res = await client().chat.completions.create({
    model: process.env.LLM_MODEL!,
    temperature: 0,
    response_format: { type: 'json_object' },
    messages: [
      { role: 'system', content: system },
      { role: 'user', content: user },
    ],
  });
  const content = res.choices?.[0]?.message?.content;
  if (!content) throw new Error('LLM returned empty content');
  try {
    return JSON.parse(content);
  } catch {
    throw new Error(`LLM returned invalid JSON: ${String(content).slice(0, 200)}`);
  }
}

const ADDR = /^0x[0-9a-fA-F]{40}$/;
const DECIMAL = /^[0-9]+(\.[0-9]+)?$/;

function validatePolicy(p: unknown): PolicyJSON {
  const o = p as Record<string, unknown>;
  if (!o || typeof o !== 'object') throw new Error('compiled policy is not an object');
  if (typeof o.maxLoanAmount !== 'string' || !DECIMAL.test(o.maxLoanAmount) || Number(o.maxLoanAmount) <= 0) {
    throw new Error(`invalid maxLoanAmount: ${o.maxLoanAmount}`);
  }
  if (!Number.isInteger(o.minCompletedRepayments) || (o.minCompletedRepayments as number) < 1) {
    throw new Error(`invalid minCompletedRepayments: ${o.minCompletedRepayments}`);
  }
  if (o.requiredSourceChainId !== 11155111) throw new Error(`chainId must be 11155111, got ${o.requiredSourceChainId}`);
  if (o.requiredSourceChainKey !== 1) throw new Error(`chainKey must be 1, got ${o.requiredSourceChainKey}`);
  if (typeof o.requiredSourceToken !== 'string' || !ADDR.test(o.requiredSourceToken)) {
    throw new Error(`invalid requiredSourceToken: ${o.requiredSourceToken}`);
  }
  if (typeof o.vaultAddress !== 'string' || !ADDR.test(o.vaultAddress)) {
    throw new Error(`invalid vaultAddress: ${o.vaultAddress}`);
  }
  if (typeof o.rationale !== 'string' || o.rationale.length < 20) {
    throw new Error('missing compiler rationale');
  }
  return o as unknown as PolicyJSON;
}

function validateDecision(d: unknown): AgentDecisionJSON {
  const o = d as Record<string, unknown>;
  if (!o || typeof o !== 'object') throw new Error('decision is not an object');
  if (typeof o.approved !== 'boolean') throw new Error(`invalid approved: ${o.approved}`);
  if (typeof o.amount !== 'string' || !DECIMAL.test(o.amount)) {
    throw new Error(`invalid amount: ${o.amount}`);
  }
  if (typeof o.rationale !== 'string' || o.rationale.length < 20) {
    throw new Error('missing decision rationale');
  }
  return o as unknown as AgentDecisionJSON;
}

export async function compilePolicy(
  englishText: string,
  context: { sourceToken: string; vaultAddress: string },
): Promise<PolicyJSON> {
  const system = `You are the ProofGate policy compiler. A lender states lending rules in plain English.
You compile them into STRICT JSON with EXACTLY these fields:
  maxLoanAmount (string, decimal, whole PGUSD — the hard cap per release),
  minCompletedRepayments (integer >= 1 — how many proven past repayments a borrower needs),
  requiredSourceChainId (integer, ALWAYS 11155111 for Ethereum Sepolia),
  requiredSourceChainKey (integer, ALWAYS 1 — Sepolia's chainKey on Creditcoin CC3 testnet),
  requiredSourceToken (string, ALWAYS the PGUSD token address given in the context),
  vaultAddress (string, ALWAYS the vault address given in the context),
  rationale (one paragraph explaining how each English phrase maps to each field).
Rules: output JSON only, no markdown. If the English asks for something the fields
cannot express, keep the fields faithful to what CAN be enforced and say so in the
rationale. Never invent limits the lender did not state; the stated cap is maxLoanAmount.`;
  const user = `Context:\n- PGUSD token (source chain): ${context.sourceToken}\n- Lender vault (source chain): ${context.vaultAddress}\n\nEnglish policy:\n${englishText}`;
  return validatePolicy(await chatJSON(system, user));
}

export async function decide(
  policyJson: Record<string, unknown>,
  provenRepayments: Array<{ amountPgusd: string; token: string; to: string; blockHeight: number; txHash: string }>,
  borrowerAsk: { borrower: string; requestedAmount: string },
): Promise<AgentDecisionJSON> {
  const system = `You are the ProofGate decision agent. You receive:
1. a lender's policy, committed on-chain BEFORE this borrower applied (immutable),
2. a borrower's repayment history where EVERY entry was cryptographically proven
   on the source chain by the Attestcoin Protocol (these are facts, not claims),
3. the borrower's request.
Decide WITHIN the policy. Rules:
- The policy is the ceiling: amount must never exceed maxLoanAmount.
- If proven repayments are fewer than minCompletedRepayments, you must reject
  (approved=false) — approving would revert on-chain anyway.
- The honest amount is the sum of proven repayments, capped at maxLoanAmount.
  You may approve less; never more.
- Output STRICT JSON: {"approved": boolean, "amount": string (whole PGUSD),
  "rationale": string}. No markdown. The rationale is hashed on-chain as the
  permanent decision receipt — write it as if an auditor will read it.`;
  const user = `Committed policy:\n${JSON.stringify(policyJson, null, 2)}\n\n` +
    `Cryptographically proven repayments (Attestcoin-verified):\n${JSON.stringify(provenRepayments, null, 2)}\n\n` +
    `Borrower request:\n${JSON.stringify(borrowerAsk, null, 2)}`;
  return validateDecision(await chatJSON(system, user));
}
