/**
 * ProofGate: Day 4 scene runner. Parameterized; no scene logic hardcoded.
 *
 * Usage (env: CREDITCOIN_RPC_URL, SOURCE_CHAIN_RPC_URL, CREDITCOIN_WALLET_PRIVATE_KEY):
 *   node scripts/scene.ts commit-policy <file.md> <maxLoanPgusd> <minRepayments>
 *   node scripts/scene.ts prove <policyId> [--tamper <fixtureIdx> <newAmountPgusd>]
 *   node scripts/scene.ts request <policyId> <claimPgusd> [rationale...]
 *
 * `prove` resubmits the saved fixtures (test/fixtures/proofs.json) under the
 * given policyId; the per-policy replay guard makes this legitimate for a
 * new policy. With --tamper, one fixture's repayment amount inside txBytes is
 * rewritten before submission: the Attestcoin precompile must then reject it.
 *
 * Txs are sent with an explicit gasLimit so that EXPECTED reverts still land
 * on-chain as evidence (status 0 + tx hash), instead of dying at gas
 * estimation. The staticcall preflight prints the revert reason first.
 */
const fs = require('node:fs');
const path = require('node:path');
const { ethers } = require('ethers');

function must(name: string): string {
  const v = process.env[name];
  if (!v) throw new Error(`missing env var ${name}`);
  return v;
}

const GATE_ADDRESS = '0xb9B4ec47C1DEE16254f35c2699384542082AE731';
const REGISTRY_ADDRESS = '0x4E4Ce51642053DD43eEa17840878e6cC8463aD6C';
const CREDIT_TOKEN_ADDRESS = '0x62aBdb6fCB4Fee617542Fc1c42a0bD3E96d073fD';
const BORROWER = '0x7Fe2d9F882544d2EE23fc0A4719B4DB95Db5d27B';
const PGUSD = '0x736AA38bc60384DB13b03b2D6aa1D810230C9Dd0';
const VAULT = '0xd1F1FA3CbA5B6532a01C842c43D26FCE54E81A38';
const FIXTURE_PATH = path.join(__dirname, '..', 'test', 'fixtures', 'proofs.json');
const GAS_LIMIT = 3_000_000n; // explicit: reverts must land on-chain

const GATE_ABI = [
  'function submitRepaymentProof(uint256 policyId, address borrower, (uint64 chainKey, uint64 blockHeight, bytes encodedTransaction, bytes32 merkleRoot, (bytes32 hash, bool isLeft)[] siblings, bytes32 lowerEndpointDigest, bytes32[] continuityRoots) proof)',
  'function requestCredit(uint256 policyId, address borrower, (bool approved, uint256 claimedAmount, string rationale) decision)',
  'function provenRepaymentCount(uint256 policyId, address borrower) view returns (uint256)',
  'event CreditReleased(uint256 indexed policyId, address indexed borrower, uint256 releasedAmount, uint256 claimedAmount, bytes32 rationaleHash, uint256 proofsUsed)',
];
const REGISTRY_ABI = [
  'function commitPolicy((uint256 maxLoanAmount, uint256 minCompletedRepayments, uint64 requiredSourceChainId, uint64 requiredSourceChainKey, address requiredSourceToken, address vaultAddress, bytes32 policyTextHash) policy) returns (uint256)',
  'function getPolicy(uint256 policyId) view returns ((uint256 maxLoanAmount, uint256 minCompletedRepayments, uint64 requiredSourceChainId, uint64 requiredSourceChainKey, address requiredSourceToken, address vaultAddress, bytes32 policyTextHash))',
  'event PolicyCommitted(uint256 indexed policyId, address indexed lender, (uint256 maxLoanAmount, uint256 minCompletedRepayments, uint64 requiredSourceChainId, uint64 requiredSourceChainKey, address requiredSourceToken, address vaultAddress, bytes32 policyTextHash) policy, bytes32 policyTextHash)',
];
const ERC20_ABI = ['function balanceOf(address account) view returns (uint256)'];

function fixtureToTuple(f: any, tamperToPgusd?: string) {
  let txBytes: string = f.txBytes;
  if (tamperToPgusd !== undefined) {
    const oldAmt = ethers.toBeHex(ethers.parseEther(f.amountPgusd), 32).slice(2);
    const newAmt = ethers.toBeHex(ethers.parseEther(tamperToPgusd), 32).slice(2);
    if (!txBytes.includes(oldAmt)) throw new Error('amount pattern not found in txBytes');
    txBytes = txBytes.replace(oldAmt, newAmt);
    console.log(`  TAMPERED: repayment amount ${f.amountPgusd} -> ${tamperToPgusd} PGUSD inside txBytes`);
  }
  return {
    chainKey: f.chainKey,
    blockHeight: f.blockHeight,
    encodedTransaction: txBytes,
    merkleRoot: f.merkleProof.root,
    siblings: f.merkleProof.siblings,
    lowerEndpointDigest: f.continuityProof.lowerEndpointDigest,
    continuityRoots: f.continuityProof.roots,
  };
}

async function sendExpectingMaybeRevert(label: string, fn: () => Promise<any>, callForReason: () => Promise<any>): Promise<void> {
  try {
    await callForReason(); // staticcall preflight: surfaces the revert reason early
  } catch (e: any) {
    console.log(`  preflight revert reason: ${e.shortMessage || e.message}`);
  }
  const tx = await fn();
  let rcpt: any;
  try {
    rcpt = await tx.wait();
  } catch (e: any) {
    // ethers v6 wait() THROWS on status-0 receipts; the reverted receipt is the evidence
    if (e && e.receipt) {
      rcpt = e.receipt;
    } else {
      throw e;
    }
  }
  console.log(`  ${label} tx: ${rcpt.hash} status=${rcpt.status} ${rcpt.status === 0 ? '(REVERTED ON-CHAIN: demo evidence)' : ''}`);
  if (rcpt.status === 0) {
    process.exitCode = 2; // signal expected-revert to the caller without hiding the hash
  }
}

async function main(): Promise<void> {
  const [cmd, ...args] = process.argv.slice(2);
  const provider = new ethers.JsonRpcProvider(must('CREDITCOIN_RPC_URL'));
  const agent = new ethers.Wallet(must('CREDITCOIN_WALLET_PRIVATE_KEY'), provider);
  const gate = new ethers.Contract(GATE_ADDRESS, GATE_ABI, agent);
  const registry = new ethers.Contract(REGISTRY_ADDRESS, REGISTRY_ABI, agent);

  if (cmd === 'commit-policy') {
    const [file, maxLoanPgusd, minRepayments] = args;
    const text = fs.readFileSync(path.join(__dirname, '..', file), 'utf8').replace(/\n+$/, '');
    const policyTextHash = ethers.keccak256(ethers.toUtf8Bytes(text));
    const policy = {
      maxLoanAmount: ethers.parseEther(maxLoanPgusd),
      minCompletedRepayments: BigInt(minRepayments),
      requiredSourceChainId: 11155111n,
      requiredSourceChainKey: 1n,
      requiredSourceToken: PGUSD,
      vaultAddress: VAULT,
      policyTextHash,
    };
    console.log(`committing policy from ${file}: cap=${maxLoanPgusd} PGUSD min=${minRepayments} hash=${policyTextHash}`);
    const tx = await registry.commitPolicy(policy);
    const rcpt = await tx.wait();
    const iface = new ethers.Interface(REGISTRY_ABI);
    for (const log of rcpt.logs) {
      try {
        const parsed = iface.parseLog(log);
        if (parsed && parsed.name === 'PolicyCommitted') {
          console.log(`  PolicyCommitted policyId=${parsed.args.policyId} tx=${rcpt.hash}`);
        }
      } catch { /* not ours */ }
    }
  } else if (cmd === 'prove') {
    const policyId = BigInt(args[0]);
    let tamperIdx = -1;
    let tamperAmt: string | undefined;
    const ti = args.indexOf('--tamper');
    if (ti >= 0) { tamperIdx = Number(args[ti + 1]); tamperAmt = args[ti + 2]; }

    const fixtures = JSON.parse(fs.readFileSync(FIXTURE_PATH, 'utf8'));
    for (let i = 0; i < fixtures.length; i++) {
      const tamper = i === tamperIdx ? tamperAmt : undefined;
      const tuple = fixtureToTuple(fixtures[i], tamper);
      console.log(`submitRepaymentProof policy=${policyId} fixture=${i} (${fixtures[i].amountPgusd} PGUSD @ height ${fixtures[i].blockHeight})`);
      await sendExpectingMaybeRevert(
        'submitRepaymentProof',
        () => gate.submitRepaymentProof(policyId, BORROWER, tuple, { gasLimit: GAS_LIMIT }),
        () => gate.submitRepaymentProof.staticCall(policyId, BORROWER, tuple),
      );
      if (tamper) break; // stop after the tampered one; it must not succeed
    }
    const count = await gate.provenRepaymentCount(policyId, BORROWER);
    console.log(`  proven repayments on record for policy ${policyId}: ${count}`);
  } else if (cmd === 'request') {
    const policyId = BigInt(args[0]);
    const claimedAmount = ethers.parseEther(args[1]);
    const rationale = args.slice(2).join(' ') || 'agent decision';
    const decision = { approved: true, claimedAmount, rationale };
    console.log(`requestCredit policy=${policyId} claim=${args[1]} PGUSD rationale="${rationale}"`);
    const iface = new ethers.Interface(GATE_ABI);
    let rcpt: any;
    try {
      await gate.requestCredit.staticCall(policyId, BORROWER, decision);
    } catch (e: any) {
      console.log(`  preflight revert reason: ${e.shortMessage || e.message}`);
    }
    const tx = await gate.requestCredit(policyId, BORROWER, decision, { gasLimit: GAS_LIMIT });
    try {
      rcpt = await tx.wait();
    } catch (e: any) {
      if (e && e.receipt) { rcpt = e.receipt; } else { throw e; }
    }
    console.log(`  requestCredit tx: ${rcpt.hash} status=${rcpt.status} ${rcpt.status === 0 ? '(REVERTED ON-CHAIN: demo evidence)' : ''}`);
    for (const log of rcpt.logs) {
      try {
        const parsed = iface.parseLog(log);
        if (parsed && parsed.name === 'CreditReleased') {
          console.log(`  CreditReleased released=${ethers.formatEther(parsed.args.releasedAmount)} claimed=${ethers.formatEther(parsed.args.claimedAmount)} proofsUsed=${parsed.args.proofsUsed} rationaleHash=${parsed.args.rationaleHash}`);
        }
      } catch { /* not a gate log */ }
    }
    const credit = new ethers.Contract(CREDIT_TOKEN_ADDRESS, ERC20_ABI, provider);
    console.log(`  borrower PGC balance: ${ethers.formatEther(await credit.balanceOf(BORROWER))}`);
    if (rcpt.status === 0) process.exitCode = 2;
  } else {
    throw new Error(`unknown command: ${cmd}`);
  }
}

main().catch((err) => {
  console.error('\nFAILED:', err.shortMessage || err.message || err);
  process.exit(1);
});
