/**
 * ProofGate — agent/decide.ts
 *
 * The decision loop: load the committed policy, present the cryptographically
 * proven repayment history to the LLM, and let the LLM decide — then execute
 * its decision on-chain. The rationale is hashed into CreditReleased: the
 * permanent receipt of what the AI claimed vs what the proofs supported.
 *
 * Usage:
 *   node agent/decide.ts <policyId> <borrowerAddress> [requestedAmountPgusd]
 *
 * The agent signs with CREDITCOIN_WALLET_PRIVATE_KEY like any caller; it has
 * NO privileged role in the contracts.
 */
const fs = require('node:fs');
const path = require('node:path');
const { ethers } = require('ethers');
const { decide } = require('./llm.ts');

const GATE_ADDRESS = '0xb9B4ec47C1DEE16254f35c2699384542082AE731';
const REGISTRY_ADDRESS = '0x4E4Ce51642053DD43eEa17840878e6cC8463aD6C';
const CREDIT_TOKEN_ADDRESS = '0x62aBdb6fCB4Fee617542Fc1c42a0bD3E96d073fD';
const PGUSD = '0x736AA38bc60384DB13b03b2D6aa1D810230C9Dd0';
const VAULT = '0xd1F1FA3CbA5B6532a01C842c43D26FCE54E81A38';
const FIXTURE_PATH = path.join(__dirname, '..', 'test', 'fixtures', 'proofs.json');

const REGISTRY_ABI = [
  'function getPolicy(uint256 policyId) view returns ((uint256 maxLoanAmount, uint256 minCompletedRepayments, uint64 requiredSourceChainId, uint64 requiredSourceChainKey, address requiredSourceToken, address vaultAddress, bytes32 policyTextHash))',
];
const GATE_ABI = [
  'function submitRepaymentProof(uint256 policyId, address borrower, (uint64 chainKey, uint64 blockHeight, bytes encodedTransaction, bytes32 merkleRoot, (bytes32 hash, bool isLeft)[] siblings, bytes32 lowerEndpointDigest, bytes32[] continuityRoots) proof)',
  'function requestCredit(uint256 policyId, address borrower, (bool approved, uint256 claimedAmount, string rationale) decision)',
  'function provenRepaymentCount(uint256 policyId, address borrower) view returns (uint256)',
  'event CreditReleased(uint256 indexed policyId, address indexed borrower, uint256 releasedAmount, uint256 claimedAmount, bytes32 rationaleHash, uint256 proofsUsed)',
];
const ERC20_ABI = ['function balanceOf(address account) view returns (uint256)'];

function must(name: string): string {
  const v = process.env[name];
  if (!v) throw new Error(`missing env var ${name}`);
  return v;
}

function fixtureToTuple(f: any) {
  return {
    chainKey: f.chainKey,
    blockHeight: f.blockHeight,
    encodedTransaction: f.txBytes,
    merkleRoot: f.merkleProof.root,
    siblings: f.merkleProof.siblings,
    lowerEndpointDigest: f.continuityProof.lowerEndpointDigest,
    continuityRoots: f.continuityProof.roots,
  };
}

async function main(): Promise<void> {
  const [policyIdArg, borrower, requested = '50'] = process.argv.slice(2);
  if (!policyIdArg || !borrower) throw new Error('usage: decide.ts <policyId> <borrower> [requestedAmountPgusd]');
  const policyId = BigInt(policyIdArg);

  const provider = new ethers.JsonRpcProvider(must('CREDITCOIN_RPC_URL'));
  const agent = new ethers.Wallet(must('CREDITCOIN_WALLET_PRIVATE_KEY'), provider);
  const registry = new ethers.Contract(REGISTRY_ADDRESS, REGISTRY_ABI, provider);
  const gate = new ethers.Contract(GATE_ADDRESS, GATE_ABI, agent);
  const credit = new ethers.Contract(CREDIT_TOKEN_ADDRESS, ERC20_ABI, provider);

  console.log('=== ProofGate decision agent ===');
  console.log(`policyId: ${policyId}  borrower: ${borrower}  ask: ${requested} PGUSD\n`);

  // 1. Load the policy that was committed BEFORE this borrower applied.
  const p = await registry.getPolicy(policyId);
  const policyJson = {
    maxLoanAmount: ethers.formatEther(p.maxLoanAmount),
    minCompletedRepayments: Number(p.minCompletedRepayments),
    requiredSourceChainId: Number(p.requiredSourceChainId),
    requiredSourceChainKey: Number(p.requiredSourceChainKey),
    requiredSourceToken: p.requiredSourceToken,
    vaultAddress: p.vaultAddress,
    policyTextHash: p.policyTextHash,
  };
  console.log('committed policy (on-chain, immutable):');
  console.log(JSON.stringify(policyJson, null, 2));

  // 2. The proven history: real Attestcoin-verified repayment facts.
  const fixtures = JSON.parse(fs.readFileSync(FIXTURE_PATH, 'utf8'));
  const provenRepayments = fixtures.map((f: any) => ({
    amountPgusd: f.amountPgusd,
    token: PGUSD,   // decoded from the proven receipt at submission time
    to: VAULT,      // decoded from the proven receipt at submission time
    blockHeight: f.blockHeight,
    txHash: f.txHash,
  }));
  console.log(`\nproven repayment facts (${provenRepayments.length} Attestcoin-verified txs):`);
  console.log(JSON.stringify(provenRepayments, null, 2));

  // 3. Ensure the proofs are on record under THIS policyId. Resumable: if a
  //    previous run died mid-submission (RPC timeout etc.), submit only the
  //    proofs not yet recorded. The per-policy replay guard rejects resubmission
  //    of recorded ones, so starting at index `onRecord` is exactly right.
  const onRecord = Number(await gate.provenRepaymentCount(policyId, borrower));
  if (onRecord < fixtures.length) {
    console.log(`\n${onRecord} proof(s) already on record — submitting the remaining ${fixtures.length - onRecord}...`);
    for (let i = onRecord; i < fixtures.length; i++) {
      const tx = await gate.submitRepaymentProof(policyId, borrower, fixtureToTuple(fixtures[i]));
      const rcpt = await tx.wait();
      console.log(`  proof ${i + 1}/${fixtures.length} verified on-chain: ${rcpt.hash}`);
    }
  }
  const count = await gate.provenRepaymentCount(policyId, borrower);
  console.log(`proven repayments on record for policy ${policyId}: ${count}`);

  // 4. The LLM decides — WITHIN the committed policy.
  console.log('\nasking the LLM to decide...');
  const decision = await decide(policyJson, provenRepayments, { borrower, requestedAmount: requested });
  console.log('LLM decision:');
  console.log(JSON.stringify(decision, null, 2));

  if (!decision.approved) {
    console.log('\nAgent DECLINED. No requestCredit sent (it would revert). Rationale above is the record.');
    return;
  }

  // 5. Execute the LLM's decision on-chain.
  const balBefore = await credit.balanceOf(borrower);
  const call = { approved: true, claimedAmount: ethers.parseEther(decision.amount), rationale: decision.rationale };
  const tx = await gate.requestCredit(policyId, borrower, call);
  const rcpt = await tx.wait();
  console.log(`\nrequestCredit tx: ${rcpt.hash} (status ${rcpt.status})`);

  const iface = new ethers.Interface(GATE_ABI);
  for (const log of rcpt.logs) {
    try {
      const parsed = iface.parseLog(log);
      if (parsed && parsed.name === 'CreditReleased') {
        console.log('CreditReleased:');
        console.log(`  released: ${ethers.formatEther(parsed.args.releasedAmount)} PGC (decoded, proven)`);
        console.log(`  claimed:  ${ethers.formatEther(parsed.args.claimedAmount)} PGC (what the LLM said)`);
        console.log(`  rationaleHash: ${parsed.args.rationaleHash}`);
        console.log(`  proofsUsed: ${parsed.args.proofsUsed}`);
      }
    } catch { /* not a gate log */ }
  }
  const balAfter = await credit.balanceOf(borrower);
  console.log(`\nborrower PGC balance: ${ethers.formatEther(balBefore)} -> ${ethers.formatEther(balAfter)}`);
}

main().catch((err) => {
  console.error('\nFAILED:', err.shortMessage || err.message || err);
  process.exit(1);
});
