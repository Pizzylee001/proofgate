/**
 * ProofGate web — server-side chain helpers. SERVER ONLY.
 * All signing uses DEMO_WALLET_PRIVATE_KEY (fresh testnet-only key).
 * The browser never sees a private key or the LLM key.
 */
import { ethers } from 'ethers';
import proofs from './proofs.json';

export const ADDRESSES = {
  registry: '0x4E4Ce51642053DD43eEa17840878e6cC8463aD6C',
  gate: '0xb9B4ec47C1DEE16254f35c2699384542082AE731',
  creditToken: '0x62aBdb6fCB4Fee617542Fc1c42a0bD3E96d073fD',
  pgusd: '0x736AA38bc60384DB13b03b2D6aa1D810230C9Dd0',
  vault: '0xd1F1FA3CbA5B6532a01C842c43D26FCE54E81A38',
  borrower: '0x7Fe2d9F882544d2EE23fc0A4719B4DB95Db5d27B',
} as const;

export const EXPLORER = 'https://creditcoin-testnet.blockscout.com';
export const explorerTx = (hash: string) => `${EXPLORER}/tx/${hash}`;
export const explorerAddress = (addr: string) => `${EXPLORER}/address/${addr}`;

export const REGISTRY_ABI = [
  'function commitPolicy((uint256 maxLoanAmount, uint256 minCompletedRepayments, uint64 requiredSourceChainId, uint64 requiredSourceChainKey, address requiredSourceToken, address vaultAddress, bytes32 policyTextHash) policy) returns (uint256)',
  'function getPolicy(uint256 policyId) view returns ((uint256 maxLoanAmount, uint256 minCompletedRepayments, uint64 requiredSourceChainId, uint64 requiredSourceChainKey, address requiredSourceToken, address vaultAddress, bytes32 policyTextHash))',
  'function policyCount() view returns (uint256)',
  'event PolicyCommitted(uint256 indexed policyId, address indexed lender, (uint256 maxLoanAmount, uint256 minCompletedRepayments, uint64 requiredSourceChainId, uint64 requiredSourceChainKey, address requiredSourceToken, address vaultAddress, bytes32 policyTextHash) policy, bytes32 policyTextHash)',
];

export const GATE_ABI = [
  'function submitRepaymentProof(uint256 policyId, address borrower, (uint64 chainKey, uint64 blockHeight, bytes encodedTransaction, bytes32 merkleRoot, (bytes32 hash, bool isLeft)[] siblings, bytes32 lowerEndpointDigest, bytes32[] continuityRoots) proof)',
  'function requestCredit(uint256 policyId, address borrower, (bool approved, uint256 claimedAmount, string rationale) decision)',
  'function provenRepaymentCount(uint256 policyId, address borrower) view returns (uint256)',
  'event CreditReleased(uint256 indexed policyId, address indexed borrower, uint256 releasedAmount, uint256 claimedAmount, bytes32 rationaleHash, uint256 proofsUsed)',
];

export const ERC20_ABI = ['function balanceOf(address account) view returns (uint256)'];

const GAS_LIMIT = 3_000_000n; // explicit: expected reverts must land on-chain as evidence

function must(name: string): string {
  const v = process.env[name];
  if (!v) throw new Error(`missing env var ${name}`);
  return v;
}

export function provider(): ethers.JsonRpcProvider {
  return new ethers.JsonRpcProvider(must('CREDITCOIN_RPC_URL'));
}

export function demoSigner(): ethers.Wallet {
  return new ethers.Wallet(must('DEMO_WALLET_PRIVATE_KEY'), provider());
}

export interface FixtureProof {
  txHash: string;
  amountPgusd: string;
  chainKey: number;
  blockHeight: number;
  txIndex: number;
  txBytes: string;
  merkleProof: { root: string; siblings: Array<{ hash: string; isLeft: boolean }> };
  continuityProof: { lowerEndpointDigest: string; roots: string[] };
}

export function getFixtures(): FixtureProof[] {
  return proofs as unknown as FixtureProof[];
}

/** Map a saved Attestcoin proof payload to the on-chain Proof tuple. */
export function fixtureToTuple(f: FixtureProof) {
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

/** Rewrite the repayment amount inside txBytes — the precompile must then reject it. */
export function tamperedTuple(f: FixtureProof, newAmountPgusd: string) {
  const oldAmt = ethers.toBeHex(ethers.parseEther(f.amountPgusd), 32).slice(2);
  const newAmt = ethers.toBeHex(ethers.parseEther(newAmountPgusd), 32).slice(2);
  if (!f.txBytes.includes(oldAmt)) throw new Error('amount pattern not found in txBytes');
  return { ...fixtureToTuple(f), encodedTransaction: f.txBytes.replace(oldAmt, newAmt) };
}

/** Send a tx that is EXPECTED to revert; return hash + status either way. */
export async function sendEvenIfReverting(
  send: (overrides: { gasLimit: bigint }) => Promise<ethers.TransactionResponse>,
  staticCall: () => Promise<unknown>,
): Promise<{ txHash: string; status: number; revertReason: string | null }> {
  let revertReason: string | null = null;
  try {
    await staticCall();
  } catch (e) {
    revertReason = (e as { shortMessage?: string; message?: string }).shortMessage
      ?? (e as Error).message;
  }
  const tx = await send({ gasLimit: GAS_LIMIT });
  let receipt;
  try {
    receipt = await tx.wait();
  } catch (e) {
    const err = e as { receipt?: ethers.TransactionReceipt };
    if (err.receipt) receipt = err.receipt;
    else throw e;
  }
  return { txHash: receipt!.hash, status: receipt!.status ?? 0, revertReason };
}

/** Ensure all fixture proofs are on record under policyId (resumable). */
export async function ensureProofsSubmitted(policyId: bigint): Promise<string[]> {
  const gate = new ethers.Contract(ADDRESSES.gate, GATE_ABI, demoSigner());
  const onRecord = Number(await gate.provenRepaymentCount(policyId, ADDRESSES.borrower));
  const fixtures = getFixtures();
  const txHashes: string[] = [];
  for (let i = onRecord; i < fixtures.length; i++) {
    const tx = await gate.submitRepaymentProof(policyId, ADDRESSES.borrower, fixtureToTuple(fixtures[i]));
    const rcpt = await tx.wait();
    txHashes.push(rcpt!.hash);
  }
  return txHashes;
}

/** Parse the CreditReleased log out of a receipt. */
export function parseCreditReleased(receipt: ethers.TransactionReceipt) {
  const iface = new ethers.Interface(GATE_ABI);
  for (const log of receipt.logs) {
    try {
      const parsed = iface.parseLog({ topics: [...log.topics], data: log.data });
      if (parsed && parsed.name === 'CreditReleased') {
        return {
          policyId: parsed.args.policyId.toString(),
          borrower: parsed.args.borrower as string,
          releasedAmount: ethers.formatEther(parsed.args.releasedAmount),
          claimedAmount: ethers.formatEther(parsed.args.claimedAmount),
          rationaleHash: parsed.args.rationaleHash as string,
          proofsUsed: Number(parsed.args.proofsUsed),
        };
      }
    } catch { /* not a gate log */ }
  }
  return null;
}

/** Parse the PolicyCommitted log out of a receipt. */
export function parsePolicyCommitted(receipt: ethers.TransactionReceipt) {
  const iface = new ethers.Interface(REGISTRY_ABI);
  for (const log of receipt.logs) {
    try {
      const parsed = iface.parseLog({ topics: [...log.topics], data: log.data });
      if (parsed && parsed.name === 'PolicyCommitted') {
        return { policyId: parsed.args.policyId.toString(), lender: parsed.args.lender as string };
      }
    } catch { /* not ours */ }
  }
  return null;
}
