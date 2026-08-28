/**
 * ProofGate — Day 3 end-to-end: real Attestcoin proofs for the three Sepolia
 * repayments, submitted to ProofGate on Creditcoin CC3 testnet.
 *
 * Flow per repayment tx:
 *   1. locate the tx on Sepolia (block height)
 *   2. wait until that height is attested on Creditcoin (chainKey 1)
 *   3. generate the proof via the Proof Builder service (@gluwa/usc-sdk)
 *   4. IMMEDIATELY append the full proof payload to test/fixtures/proofs.json
 *   5. submitRepaymentProof(policyId, borrower, proof) on ProofGate
 * Then requestCredit with the agent decision — signed by the AGENT key,
 * which is NOT the borrower. Distinct identities are the demo.
 *
 * Usage:  node scripts/prove_and_submit.ts
 * Env:    CREDITCOIN_RPC_URL, SOURCE_CHAIN_RPC_URL, SOURCE_CHAIN_KEY,
 *         PROOF_BUILDER_URL, CREDITCOIN_WALLET_PRIVATE_KEY
 */
const fs = require('node:fs');
const path = require('node:path');
const { chainInfo, proofProvider } = require('@gluwa/usc-sdk');
const { ethers } = require('ethers');

// ---------- configuration ----------
function must(name: string): string {
  const v = process.env[name];
  if (!v) throw new Error(`missing env var ${name}`);
  return v;
}

const CREDITCOIN_RPC_URL = must('CREDITCOIN_RPC_URL');
const SOURCE_CHAIN_RPC_URL = must('SOURCE_CHAIN_RPC_URL');
const SOURCE_CHAIN_KEY = Number(must('SOURCE_CHAIN_KEY')); // Sepolia chainKey = 1 (NOT the chain id)
const PROOF_BUILDER_URL = must('PROOF_BUILDER_URL');
const AGENT_KEY = must('CREDITCOIN_WALLET_PRIVATE_KEY');

const POLICY_ID = 1n;
const BORROWER = '0x7Fe2d9F882544d2EE23fc0A4719B4DB95Db5d27B';
const GATE_ADDRESS = '0xb9B4ec47C1DEE16254f35c2699384542082AE731';
const CREDIT_TOKEN_ADDRESS = '0x62aBdb6fCB4Fee617542Fc1c42a0bD3E96d073fD';

const REPAYMENTS = [
  { hash: '0xfb8fb000d2df1355eca8c35621ad583d0eb01472f59d2eedd84de84e9c388a3d', amountPgusd: '20' },
  { hash: '0x86ad4225977a8fe47f1fffc28e9c6768d3499e35712b535f22e1be636181f6b7', amountPgusd: '15' },
  { hash: '0x5764115ac983d87a48a7eb6463a0acc9ce449f6861ed8cdd6b64b3044700af4d', amountPgusd: '15' },
];

const AGENT_RATIONALE =
  '3 proven PGUSD repayments to the committed vault satisfy the committed policy';

const FIXTURE_PATH = path.join(__dirname, '..', 'test', 'fixtures', 'proofs.json');

// Attestation lags Sepolia head by tens of blocks: poll every 15s, give up
// (loudly) after 10 minutes rather than hang forever.
const POLL_INTERVAL_MS = 15_000;
const WAIT_TIMEOUT_MS = 10 * 60_000;

const GATE_ABI = [
  'function submitRepaymentProof(uint256 policyId, address borrower, (uint64 chainKey, uint64 blockHeight, bytes encodedTransaction, bytes32 merkleRoot, (bytes32 hash, bool isLeft)[] siblings, bytes32 lowerEndpointDigest, bytes32[] continuityRoots) proof)',
  'function requestCredit(uint256 policyId, address borrower, (bool approved, uint256 claimedAmount, string rationale) decision)',
  'function provenRepaymentCount(uint256 policyId, address borrower) view returns (uint256)',
  'event CreditReleased(uint256 indexed policyId, address indexed borrower, uint256 releasedAmount, uint256 claimedAmount, bytes32 rationaleHash, uint256 proofsUsed)',
];
const ERC20_ABI = ['function balanceOf(address account) view returns (uint256)'];

// ---------- fixture persistence ----------
function appendFixture(entry: any): void {
  fs.mkdirSync(path.dirname(FIXTURE_PATH), { recursive: true });
  let all: any[] = [];
  if (fs.existsSync(FIXTURE_PATH)) {
    all = JSON.parse(fs.readFileSync(FIXTURE_PATH, 'utf8'));
  }
  all.push(entry);
  fs.writeFileSync(FIXTURE_PATH, JSON.stringify(all, null, 2) + '\n');
  console.log(`  fixture saved (${all.length} total) -> ${FIXTURE_PATH}`);
}

// ---------- main ----------
async function main(): Promise<void> {
  const ctcProvider = new ethers.JsonRpcProvider(CREDITCOIN_RPC_URL);
  const sepoliaProvider = new ethers.JsonRpcProvider(SOURCE_CHAIN_RPC_URL);
  const agent = new ethers.Wallet(AGENT_KEY, ctcProvider);

  console.log(`agent:    ${agent.address}`);
  console.log(`borrower: ${BORROWER}`);
  console.log(`gate:     ${GATE_ADDRESS}`);
  console.log(`policy:   #${POLICY_ID}\n`);

  const chainInfoProvider = new chainInfo.PrecompileChainInfoProvider(ctcProvider);
  const proofBuilder = new proofProvider.service.ProofBuilder(SOURCE_CHAIN_KEY, PROOF_BUILDER_URL);
  const gate = new ethers.Contract(GATE_ADDRESS, GATE_ABI, agent);

  for (const [i, r] of REPAYMENTS.entries()) {
    console.log(`--- repayment ${i + 1}/3: ${r.hash} (${r.amountPgusd} PGUSD)`);

    // 1. locate the tx on Sepolia
    const receipt = await sepoliaProvider.getTransactionReceipt(r.hash);
    if (!receipt || receipt.status !== 1) throw new Error(`repayment tx not found or failed: ${r.hash}`);
    const height = receipt.blockNumber;
    console.log(`  Sepolia block height: ${height}`);

    // 2. wait for the block to be attested on Creditcoin
    process.stdout.write(`  waiting for attestation of height ${height} (chainKey ${SOURCE_CHAIN_KEY})...`);
    await chainInfoProvider.waitUntilHeightAttested(
      SOURCE_CHAIN_KEY, height, POLL_INTERVAL_MS, WAIT_TIMEOUT_MS,
    );
    console.log(' attested.');

    // 3. generate the proof via the Proof Builder service
    const proofResult = await proofBuilder.getProof(r.hash);
    if (!proofResult.success || !proofResult.data) {
      throw new Error(`proof generation failed for ${r.hash}: ${proofResult.error}`);
    }
    const p = proofResult.data;

    // 4. save the full proof payload IMMEDIATELY (fixtures survive attester stalls)
    appendFixture({
      txHash: r.hash,
      amountPgusd: r.amountPgusd,
      chainKey: p.chainKey,
      blockHeight: p.headerNumber,
      txIndex: p.txIndex,
      txBytes: p.txBytes,
      merkleProof: {
        root: p.merkleProof.root,
        siblings: p.merkleProof.siblings.map((s: any) => ({ hash: s.hash, isLeft: s.isLeft })),
      },
      continuityProof: {
        lowerEndpointDigest: p.continuityProof.lowerEndpointDigest,
        roots: p.continuityProof.roots,
      },
      generatedAt: p.generatedAt,
    });

    // 5. submit the proof to ProofGate
    const proofTuple = {
      chainKey: p.chainKey,
      blockHeight: p.headerNumber,
      encodedTransaction: p.txBytes,
      merkleRoot: p.merkleProof.root,
      siblings: p.merkleProof.siblings.map((s: any) => ({ hash: s.hash, isLeft: s.isLeft })),
      lowerEndpointDigest: p.continuityProof.lowerEndpointDigest,
      continuityRoots: p.continuityProof.roots,
    };
    const tx = await gate.submitRepaymentProof(POLICY_ID, BORROWER, proofTuple);
    const rcpt = await tx.wait();
    console.log(`  submitRepaymentProof tx: ${rcpt.hash} (status ${rcpt.status})`);
    const count = await gate.provenRepaymentCount(POLICY_ID, BORROWER);
    console.log(`  proven repayments on record: ${count}`);
  }

  // Decision: the agent claims exactly what the proven history supports.
  const claimedAmount = ethers.parseEther('50');
  console.log(`\n--- requestCredit: claimed ${ethers.formatEther(claimedAmount)} PGUSD`);
  const decision = { approved: true, claimedAmount, rationale: AGENT_RATIONALE };
  const tx = await gate.requestCredit(POLICY_ID, BORROWER, decision);
  const rcpt = await tx.wait();
  console.log(`requestCredit tx: ${rcpt.hash} (status ${rcpt.status})`);

  // Parse the decision receipt from the logs
  const iface = new ethers.Interface(GATE_ABI);
  for (const log of rcpt.logs) {
    try {
      const parsed = iface.parseLog(log);
      if (parsed && parsed.name === 'CreditReleased') {
        console.log('\nCreditReleased:');
        console.log(`  policyId:       ${parsed.args.policyId}`);
        console.log(`  borrower:       ${parsed.args.borrower}`);
        console.log(`  releasedAmount: ${ethers.formatEther(parsed.args.releasedAmount)} PGC`);
        console.log(`  claimedAmount:  ${ethers.formatEther(parsed.args.claimedAmount)} PGC`);
        console.log(`  rationaleHash:  ${parsed.args.rationaleHash}`);
        console.log(`  proofsUsed:     ${parsed.args.proofsUsed}`);
      }
    } catch { /* not a gate log */ }
  }

  const credit = new ethers.Contract(CREDIT_TOKEN_ADDRESS, ERC20_ABI, ctcProvider);
  const bal = await credit.balanceOf(BORROWER);
  console.log(`\nborrower PGC balance on Creditcoin: ${ethers.formatEther(bal)}`);
}

main().catch((err) => {
  console.error('\nFAILED:', err.message || err);
  process.exit(1);
});
