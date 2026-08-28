/**
 * ProofGate — agent/compile_policy.ts
 *
 * The AI-track headline flow: a lender speaks English; the agent compiles it
 * into the machine-readable Policy struct and commits it on-chain BEFORE any
 * borrower applies.
 *
 * Usage:
 *   node agent/compile_policy.ts "Lend up to 75 PGUSD to anyone with 3+ repayments to my vault"
 *   node agent/compile_policy.ts --file policies/draft.md
 *
 * Flow: LLM compiles -> validate -> write policies/<nextId>.md (English +
 * compiled JSON + rationale) -> keccak the English text -> commitPolicy
 * on-chain. Prints everything it does.
 */
const fs = require('node:fs');
const path = require('node:path');
const { ethers } = require('ethers');
const { compilePolicy } = require('./llm.ts');

const REGISTRY_ADDRESS = '0x4E4Ce51642053DD43eEa17840878e6cC8463aD6C';
const PGUSD = '0x736AA38bc60384DB13b03b2D6aa1D810230C9Dd0';
const VAULT = '0xd1F1FA3CbA5B6532a01C842c43D26FCE54E81A38';

const REGISTRY_ABI = [
  'function commitPolicy((uint256 maxLoanAmount, uint256 minCompletedRepayments, uint64 requiredSourceChainId, uint64 requiredSourceChainKey, address requiredSourceToken, address vaultAddress, bytes32 policyTextHash) policy) returns (uint256)',
  'function policyCount() view returns (uint256)',
  'event PolicyCommitted(uint256 indexed policyId, address indexed lender, (uint256 maxLoanAmount, uint256 minCompletedRepayments, uint64 requiredSourceChainId, uint64 requiredSourceChainKey, address requiredSourceToken, address vaultAddress, bytes32 policyTextHash) policy, bytes32 policyTextHash)',
];

function must(name: string): string {
  const v = process.env[name];
  if (!v) throw new Error(`missing env var ${name}`);
  return v;
}

async function main(): Promise<void> {
  const args = process.argv.slice(2);
  let english: string;
  if (args[0] === '--file') {
    english = fs.readFileSync(args[1], 'utf8').trim();
  } else {
    english = args.join(' ').trim();
  }
  if (!english) throw new Error('usage: compile_policy.ts "<english policy>" | --file <path>');

  console.log('=== ProofGate policy compiler ===');
  console.log(`English input:\n  "${english}"\n`);

  // 1. LLM compiles English -> Policy JSON (validated in llm.ts)
  console.log('compiling with LLM...');
  const compiled = await compilePolicy(english, { sourceToken: PGUSD, vaultAddress: VAULT });
  console.log('compiled policy JSON:');
  console.log(JSON.stringify(compiled, null, 2));

  // 2. Write the policy file: English original + compiled JSON + rationale
  const provider = new ethers.JsonRpcProvider(must('CREDITCOIN_RPC_URL'));
  const registry = new ethers.Contract(REGISTRY_ADDRESS, REGISTRY_ABI, provider);
  const nextId = Number(await registry.policyCount()) + 1;
  const filePath = path.join(__dirname, '..', 'policies', `${nextId}.md`);
  const fileBody =
    `# ProofGate Policy #${nextId} — AI-compiled\n\n` +
    `## English original (lender's words)\n\n${english}\n\n` +
    `## Compiled policy (LLM, temperature 0, validated)\n\n` +
    '```json\n' + JSON.stringify(compiled, null, 2) + '\n```\n\n' +
    `## Compiler rationale\n\n${compiled.rationale}\n`;
  fs.writeFileSync(filePath, fileBody);
  console.log(`\nwrote ${filePath}`);

  // 3. keccak the ENGLISH text (not the file) — the hash binds the contract
  //    to the lender's words.
  const policyTextHash = ethers.keccak256(ethers.toUtf8Bytes(english));
  console.log(`policyTextHash (keccak256 of English text): ${policyTextHash}`);

  // 4. Commit on-chain. The agent pays gas like any caller — no privilege.
  const agent = new ethers.Wallet(must('CREDITCOIN_WALLET_PRIVATE_KEY'), provider);
  const registryW = new ethers.Contract(REGISTRY_ADDRESS, REGISTRY_ABI, agent);
  const policy = {
    maxLoanAmount: ethers.parseEther(compiled.maxLoanAmount),
    minCompletedRepayments: BigInt(compiled.minCompletedRepayments),
    requiredSourceChainId: BigInt(compiled.requiredSourceChainId),
    requiredSourceChainKey: BigInt(compiled.requiredSourceChainKey),
    requiredSourceToken: compiled.requiredSourceToken,
    vaultAddress: compiled.vaultAddress,
    policyTextHash,
  };
  const tx = await registryW.commitPolicy(policy);
  const rcpt = await tx.wait();
  const iface = new ethers.Interface(REGISTRY_ABI);
  for (const log of rcpt.logs) {
    try {
      const parsed = iface.parseLog(log);
      if (parsed && parsed.name === 'PolicyCommitted') {
        console.log(`\nPolicyCommitted policyId=${parsed.args.policyId}`);
        console.log(`tx: ${rcpt.hash}`);
      }
    } catch { /* not ours */ }
  }
  console.log('\nDone. The policy is immutable on-chain; any borrower applying under it is bound by it.');
}

main().catch((err) => {
  console.error('\nFAILED:', err.shortMessage || err.message || err);
  process.exit(1);
});
