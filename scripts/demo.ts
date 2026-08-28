/**
 * ProofGate — `yarn demo` / `npm run demo`
 *
 * One narrated run through all five scenes:
 *   Scenes 1-4: already executed on CC3 testnet (see deployments.md) — the demo
 *     replays the narrative and prints the REAL tx hashes as evidence. The same
 *     scenes are also executable offline: `forge test` runs them against the
 *     saved Attestcoin proof fixtures.
 *   Scene 5 (LIVE): a lender speaks English -> the LLM compiles a policy ->
 *     commits it on-chain -> the LLM decides on the Attestcoin-proven history
 *     -> requestCredit executes. The agent has no privileged role anywhere.
 *
 * Usage:  yarn demo            (or: npm run demo)
 * Env:    CREDITCOIN_RPC_URL, CREDITCOIN_WALLET_PRIVATE_KEY, LLM_* (see .env)
 */
const { execFileSync } = require('node:child_process');
const { ethers } = require('ethers');

const BORROWER = '0x7Fe2d9F882544d2EE23fc0A4719B4DB95Db5d27B';
const CREDIT_TOKEN_ADDRESS = '0x62aBdb6fCB4Fee617542Fc1c42a0bD3E96d073fD';
const ERC20_ABI = ['function balanceOf(address account) view returns (uint256)'];

function banner(title: string): void {
  const line = '='.repeat(72);
  console.log(`\n${line}\n  ${title}\n${line}`);
}

async function pause(seconds = 2.5): Promise<void> {
  await new Promise((r) => setTimeout(r, seconds * 1000));
}

function run(script: string, args: string[]): void {
  execFileSync(process.execPath, [script, ...args], { stdio: 'inherit' });
}

async function main(): Promise<void> {
  const provider = new ethers.JsonRpcProvider(process.env.CREDITCOIN_RPC_URL);
  const credit = new ethers.Contract(CREDIT_TOKEN_ADDRESS, ERC20_ABI, provider);
  const bal0 = await credit.balanceOf(BORROWER);

  banner('PROOFGATE — AI-compiled lending policies, enforced by Attestcoin proofs');
  console.log('A lender writes rules in plain English. The AI compiles them into a');
  console.log('machine-readable policy committed on-chain BEFORE anyone applies.');
  console.log('After that, credit moves only when the Attestcoin Protocol has');
  console.log('cryptographically proven the repayment history on the source chain.');
  console.log(`\nBorrower: ${BORROWER}`);
  console.log(`PGC balance before demo: ${ethers.formatEther(bal0)}`);
  await pause();

  banner('SCENE 1 — Honest borrower (LIVE on testnet, Day 3)');
  console.log('Three real Sepolia repayments (20 + 15 + 15 PGUSD) were proven via the');
  console.log('Attestcoin precompile and 50 PGC was released — the decoded total.');
  console.log('Evidence:');
  console.log('  proofs verified:  0xd0e48c0a...adf83e9 / 0x2e8fbd3e...883da7e / 0x708b7cfc...be3ac81');
  console.log('  requestCredit:    0x0fe91edf0f72a41bb24fb2aa4eb427d3377f6258fa104639f078a1eefe7b33e1');
  console.log('  Offline replay:   forge test --match-test test_Scene1');
  await pause();

  banner('SCENE 2 — Fabrication attempt (LIVE on testnet, Day 4)');
  console.log('We tampered one byte inside a proof (repayment 20 -> 21 PGUSD).');
  console.log('The Attestcoin precompile itself rejected it: "Merkle proof validation failed".');
  console.log('No proof, no credit.');
  console.log('Evidence (REVERTED on-chain):');
  console.log('  0x1701337e3cab0861e8bd85b57dfb4a0e39d020c0d784d279ffa0adcccde60838 (status 0)');
  console.log('  Offline replay: forge test --match-test test_Scene2');
  await pause();

  banner('SCENE 3 — Inflated AI claim (LIVE on testnet, Day 4)');
  console.log('Under Policy #2 (cap 500), the agent claimed 500 PGUSD against a proven');
  console.log('history of 50. The contract released the decoded 50 — never the claim.');
  console.log('Evidence:');
  console.log('  policy commit:    0x281a60b201e2ea683bd66b95b42809c5b56c9bf32cf2480041deb484823be0cb');
  console.log('  requestCredit:    0x8c6096578855da22b762f26ec9da49aa08b169f794ea259894f2aed57d90f3fb');
  console.log('  CreditReleased:   released=50, claimed=500 — the decision receipt.');
  await pause();

  banner('SCENE 4 — Policy violation (LIVE on testnet, Day 4)');
  console.log('Same proven history, two policies:');
  console.log('  Policy #3 "Conservative" (needs 5 repayments): REVERTED —');
  console.log('    0xc89c97c2f8e138fce22604392bff00f1ec501b681239cf83cd7354cfd8e81612 (status 0)');
  console.log('  Policy #4 (cap 500), agent claimed 600: REVERTED —');
  console.log('    0xd2b53bf5a44030e567b4df780767470a8db6e0d8c5050847d3be81ce0e8ede21 (status 0)');
  console.log('The AI interprets policy; the contract enforces it.');
  await pause();

  banner('SCENE 5 — LIVE: lender speaks English, the AI compiles and decides');
  console.log('A brand-new policy is compiled by the LLM right now, committed on-chain,');
  console.log('then the LLM evaluates the Attestcoin-proven history and decides.\n');
  await pause(1);

  run('agent/compile_policy.ts', [
    'Lend up to 75 PGUSD to anyone with 3 or more completed repayments to my vault on Ethereum Sepolia, paid in PGUSD.',
  ]);
  await pause(1);

  const registryAbi = ['function policyCount() view returns (uint256)'];
  const registry = new ethers.Contract('0x4E4Ce51642053DD43eEa17840878e6cC8463aD6C', registryAbi, provider);
  const newPolicyId = (await registry.policyCount()).toString();
  console.log(`\nnew policyId on-chain: ${newPolicyId}`);

  run('agent/decide.ts', [newPolicyId, BORROWER, '50']);

  const bal1 = await credit.balanceOf(BORROWER);
  banner('DEMO COMPLETE');
  console.log(`Borrower PGC balance: ${ethers.formatEther(bal0)} -> ${ethers.formatEther(bal1)}`);
  console.log('Every claim the AI made is checkable against an on-chain hash.');
  console.log('Full audit trail: deployments.md');
}

main().catch((err) => {
  console.error('\nDEMO FAILED:', err.shortMessage || err.message || err);
  process.exit(1);
});
