# DoraHacks submission: pre-filled fields (copy-paste on submission day)

Hackathon: BUIDL CTC 2026 Fall (deadline Sept 13, 2026 23:59 ET; winners Sept 20)

---

**Project name**
ProofGate

**Sector / track**
AI

**One-liner**
AI-compiled lending policies, enforced on-chain against Attestcoin Protocol
cross-chain proofs. The AI interprets the policy, the contract enforces it.

**Description (~150 words)**
ProofGate lets a lender write lending rules in plain English. An AI agent
compiles them into a machine-readable policy committed on Creditcoin BEFORE
any borrower applies, immutable from that moment. When a borrower applies,
the agent evaluates only what the Attestcoin Protocol has cryptographically
proven actually happened on the source chain (Ethereum Sepolia): repayment
transactions verified synchronously by the Native Query Verifier precompile,
with ERC-20 Transfer events decoded directly from the proven receipts. The
contract releases the decoded, proven total, never the agent's claimed
amount, and every release carries a rationaleHash: the AI's own reasoning,
committed on-chain as a permanent decision receipt. Adversarial scenes are
first-class citizens: fabricated proofs are rejected by the precompile itself,
inflated claims release only the proven amount, and policy violations revert.
Live on CC3 testnet with 7 committed policies and 22 precompile verifications.

**Attestcoin Protocol integration summary (~200 words)**
ProofGate integrates the Attestcoin Protocol (formerly USC) as its sole source
of cross-chain truth. For each claimed repayment, the agent waits for the
source block (Sepolia, chainKey 1) to be attested, obtains a merkle +
continuity proof from the Proof Builder API, and submits it to ProofGate,
which calls the Native Query Verifier precompile at
0x0000000000000000000000000000000000000FD2 synchronously inside the
transaction; verification failure reverts everything. The proof payload's
final chunk contains the full EVM receipt; ProofGate uses the official
EvmV1Decoder library (@gluwa/usc-contracts) to decode receipt logs and extract
payer, token, amount, and recipient from the ERC-20 Transfer event, then
enforces them against the lender's committed policy (token, vault, chainKey,
borrower). Replay protection uses keccak256(chainKey, blockHeight, txIndex)
with txIndex from calculateTxIndex, tracked per policy so multiple lenders can
independently consume the same history. Depth: 22 verifyAndEmit calls across
7 committed policies, multi-proof aggregation (3 repayments) as the default
path, and all payloads preserved as replayable fixtures.

**GitHub URL**
https://github.com/Pizzylee001/proofgate

**Deck PDF URL**
https://github.com/Pizzylee001/proofgate/blob/main/deck/proofgate-deck.pdf

**Demo video URL**
<FILL AFTER UPLOAD; keep YouTube unlisted until after submission>

**Testnet deployment addresses (Creditcoin CC3 testnet)**
- PolicyRegistry: 0x4E4Ce51642053DD43eEa17840878e6cC8463aD6C
- ProofGate: 0xb9B4ec47C1DEE16254f35c2699384542082AE731
- CreditToken (PGC): 0x62aBdb6fCB4Fee617542Fc1c42a0bD3E96d073fD
- EvmV1Decoder (own instance): 0xe885348A01991C457D8a71Cb7eEbfcEA76161609
- Source chain (Sepolia): PGUSD 0x736AA38bc60384DB13b03b2D6aa1D810230C9Dd0,
  vault 0xd1F1FA3CbA5B6532a01C842c43D26FCE54E81A38

**Originality**
All code written during the hackathon window; git history from the first
commit (.gitignore before any code) shows the progression: interface stubs →
failing scene tests → implementation → mocked greens → real Attestcoin proofs
→ live adversarial scenes → LLM agent. Contracts frozen at tag
v1.0-contracts-frozen. English policy originals committed in policies/ before
their on-chain commitments.
