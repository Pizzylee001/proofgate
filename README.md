# ProofGate

**A lender writes lending rules in plain English. An AI agent compiles them into a
machine-readable policy committed on-chain BEFORE any borrower applies. After that,
credit moves only when (a) the committed policy allows it and (b) the Attestcoin
Protocol has cryptographically proven the repayment history actually happened on the
source chain. The AI interprets the policy; the contract enforces it.**


---

## The problem

AI agents are starting to control money, and they can't be trusted with it. An LLM
can hallucinate a repayment history, inflate an amount, or "interpret" a lender's
rules into something the lender never agreed to. The obvious fix, "put the rules
in the contract", fails, because judging whether free-text rules cover a real
situation is exactly the thing contracts can't do.

ProofGate binds the agent to two things it cannot fake:

1. **Its own committed policy**, compiled from the lender's English, frozen
   on-chain before any application, immutable forever after.
2. **Cryptographically proven cross-chain facts**: repayment history verified by
   the Attestcoin Protocol's Native Query Verifier precompile, not claimed by the AI.

The AI keeps the one job only it can do: interpreting natural-language policy and
reasoning over proven facts. Everything economic is enforced by code.

## Architecture

```
 Lender (English)                Borrower (Sepolia)              Creditcoin CC3 testnet
      │                                │                                    │
      ▼                                ▼                                    ▼
┌───────────────┐   compiles    ┌──────────────┐   3× Transfer proofs   ┌────────────────┐
│  LLM (agent/) │ ───────────▶  │ PolicyRegistry│ ─────────────────────▶ │  committed     │
│  compilePolicy│               │  (on-chain)   │                        │  Policy #N     │
└───────────────┘               └──────────────┘                        └───────┬────────┘
      │                                                                          │ read
      ▼                                                                          ▼
┌───────────────┐   proven facts (Attestcoin-verified)                ┌────────────────┐
│  LLM decide() │ ──────────────────────────────────────────────────▶ │   ProofGate    │
│  + rationale  │                                                     │                │
└───────────────┘                                                     │ 1. verifyAndEmit│──▶ precompile 0x…0FD2
                                                                      │ 2. replay guard │
                                                                      │ 3. decode logs  │──▶ EvmV1Decoder
                                                                      │ 4. policy check │
                                                                      │ 5. mint min(    │──▶ CreditToken (PGC)
                                                                      │  decoded, cap)  │
                                                                      └────────────────┘
```

Three parts:

- **`src/PolicyRegistry.sol`**: lenders commit structured policies + the keccak256
  hash of the English original (`policies/<id>.md`). Immutable; versioning = new id.
- **`src/ProofGate.sol`**: the gate. `submitRepaymentProof` verifies one Attestcoin
  proof, replay-guards it per policy, decodes the ERC-20 `Transfer` out of the proven
  receipt, and enforces token/vault/chain/payer against the policy. `requestCredit`
  requires enough proven repayments, an approved agent decision within the cap, and
  releases **the decoded, proven total, never the agent's claimed amount.**
- **`agent/` (TypeScript)**: `llm.ts` (provider-agnostic, env-configured),
  `compile_policy.ts` (English → validated Policy JSON → on-chain commit),
  `decide.ts` (committed policy + proven facts → LLM decision → executed on-chain).
  The agent signs with an ordinary key and has **no privileged role**.

## Attestcoin Protocol Integration

ProofGate's entire security model rests on the Attestcoin Protocol (formerly USC;
SDK package `@gluwa/usc-sdk`):

- **Native Query Verifier precompile** at `0x0000000000000000000000000000000000000FD2`.
  `verifyAndEmit` is called **synchronously inside every proof-submission
  transaction**. If the precompile says no, the tx reverts and no state changes.
- **Proof payload** = ABI-encoded `(uint8 txType, bytes[] chunks)`; the transaction
  **receipt (including event logs) lives in the last chunk**. ProofGate decodes it
  with the official `EvmV1Decoder` library (`@gluwa/usc-contracts`), filters
  `Transfer(address,address,uint256)` logs, and extracts payer, token, amount, and
  recipient directly from the proven bytes.
- **Merkle + continuity proofs** are produced by the Proof Builder API
  (`https://proof-gen-api.cc3-testnet.creditcoin.network/`) after the source-chain
  block (Ethereum Sepolia, chainKey `1`) is attested.
- **Replay protection**: `queryId = keccak256(chainKey, blockHeight, txIndex)` with
  `txIndex = calculateTxIndex(merkleProof)`, tracked **per policy**, so two lenders
  can independently consume the same proven repayment; nobody can spend one twice.
- **Depth in practice**: **22 `verifyAndEmit` calls across 7 committed policies** on
  CC3 testnet (21 verified, 1 rejected; the rejection is demo Scene 2), each proof
  carrying a full receipt with event logs decoded on-chain. Multi-proof aggregation
  (3 repayments per application) is the default path, not the edge case.

## The five scenes (all live on CC3 testnet)

| # | Scene | Outcome | Evidence (tx hash) |
|---|-------|---------|--------------------|
| 1 | Honest borrower: 3 proven repayments (20+15+15 PGUSD), policy satisfied | **50 PGC released** | `0x0fe91edf0f72a41bb24fb2aa4eb427d3377f6258fa104639f078a1eefe7b33e1` |
| 2 | Fabrication: one byte of `txBytes` tampered (20→21 PGUSD) | **Reverted by the precompile itself**: "Merkle proof validation failed" | `0x1701337e3cab0861e8bd85b57dfb4a0e39d020c0d784d279ffa0adcccde60838` (status 0) |
| 3 | Inflation: agent claims 500 PGUSD against 50 proven | **Released 50, not 500**; `CreditReleased` records both | `0x8c6096578855da22b762f26ec9da49aa08b169f794ea259894f2aed57d90f3fb` |
| 4a | Policy violation: same history, strict policy (needs 5 repayments) | **Reverted**: "Not enough proven repayments" | `0xc89c97c2f8e138fce22604392bff00f1ec501b681239cf83cd7354cfd8e81612` (status 0) |
| 4b | Agent exceeds its lender's own committed cap (claims 600, cap 500) | **Reverted**: "Agent claim exceeds policy cap" | `0xd2b53bf5a44030e567b4df780767470a8db6e0d8c5050847d3be81ce0e8ede21` (status 0) |
| 5 | Live AI: lender speaks English → LLM compiles policy #5 → LLM decides → release | **50 PGC released**, rationale hashed on-chain | policy: `0x2afe0ed1f7aeeaa430cac3d9e728a45b74821efae3689d08571f7b8ca7c35b47`, release: `0x4769f3a734df10aaaf842fb55c3ac6817441bb924cb1479935be72f725e7b6ff` |

Every hash above is a real CC3 testnet transaction; full audit trail in
[`deployments.md`](deployments.md).

## Decision receipts

Every release emits:

```solidity
event CreditReleased(
    uint256 indexed policyId, address indexed borrower,
    uint256 releasedAmount,   // decoded from proofs - what actually moved
    uint256 claimedAmount,    // what the AI said
    bytes32 rationaleHash,    // keccak256 of the LLM's own reasoning
    uint256 proofsUsed
);
```

`rationaleHash` is the permanent, on-chain receipt of the AI's reasoning. Anyone
can take the rationale text, hash it, and check the AI's words against what the
proofs supported. **The AI vs the proof, auditable forever.**

## How to run

```bash
# offline: the four scenes against REAL Attestcoin proof fixtures
# (test/fixtures/proofs.json: chain-verified payloads from the live run)
forge test

# live: narrated scenes 1-4 (real tx evidence) + scene 5 fully live
# (LLM compiles a fresh policy, decides, and executes on-chain)
source .env   # needs CREDITCOIN_*, SOURCE_CHAIN_*, PROOF_BUILDER_URL, LLM_*
yarn demo     # or: npm run demo
```

## Deployments (Creditcoin CC3 testnet)

| Contract | Address |
|---|---|
| PolicyRegistry | `0x4E4Ce51642053DD43eEa17840878e6cC8463aD6C` |
| CreditToken (PGC) | `0x62aBdb6fCB4Fee617542Fc1c42a0bD3E96d073fD` |
| ProofGate | `0xb9B4ec47C1DEE16254f35c2699384542082AE731` |
| EvmV1Decoder (own instance; inlines into ProofGate) | `0xe885348A01991C457D8a71Cb7eEbfcEA76161609` |

Source chain (Sepolia): PGUSD `0x736AA38bc60384DB13b03b2D6aa1D810230C9Dd0`,
vault `0xd1F1FA3CbA5B6532a01C842c43D26FCE54E81A38`,
borrower `0x7Fe2d9F882544d2EE23fc0A4719B4DB95Db5d27B` (≠ agent `0x65be…f5A3`).

## Repo layout

```
src/        PolicyRegistry, ProofGate, CreditToken, PGUSD test token, interfaces
            (+ MockNativeQueryVerifier, local tests only; the precompile doesn't
             exist on local chains. Contracts frozen at tag v1.0-contracts-frozen.)
agent/      llm.ts, compile_policy.ts, decide.ts: the AI
scripts/    prove_and_submit.ts, scene.ts, demo.ts
policies/   English originals, one per policyId, hash-committed on-chain
test/       four scene tests + fixtures/proofs.json (real Attestcoin payloads)
docs/       demo video script, submission fields
deck/       slide deck (Marp → PDF)
```

## Disclaimer

Testnet-only demo code. PGUSD and PGC are valueless test tokens. Not audited;
not for production use.
