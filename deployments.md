# ProofGate — CC3 Testnet Deployments

Network: Creditcoin CC3 Testnet
RPC: https://rpc.cc3-testnet.creditcoin.network
Deployer (agent wallet): 0x65be7B4E45E3E7fd415865540407fb021937f5A3

## Current (v2 — split proof/decision flow, 2026-08-28 Day 3)

| Contract | Address | Tx hash |
|---|---|---|
| PolicyRegistry (unchanged) | `0x4E4Ce51642053DD43eEa17840878e6cC8463aD6C` | `0xb10ec07ec3b39e4f03e5b7c5cd59e5cdb9c361e347aa57ab9bab9acc369311d5` |
| CreditToken (PGC) | `0x62aBdb6fCB4Fee617542Fc1c42a0bD3E96d073fD` | `0xcf6a73baa0f50355bb73746ef4e9cd19451319d3f587cb8a8241e6f3684e03aa` |
| ProofGate | `0xb9B4ec47C1DEE16254f35c2699384542082AE731` | `0x39ac8f5b45dd3b151509cabb5b91a015698588caa47098ce937fc20f74a7fb7c` |

- `CreditToken.setGate(ProofGate)` — tx `0xcf15d1dadcf31806c2e96a7f16df2068df05297cfc351c3917aa60e351bee296`.
- ProofGate verifier = Native Query Verifier precompile `0x0000000000000000000000000000000000000FD2` (Attestcoin Protocol).

## Superseded (v1 — single-tx design, 2026-08-28 Day 2)

| Contract | Address |
|---|---|
| EvmV1Decoder (own instance; library inlines into ProofGate) | `0xe885348A01991C457D8a71Cb7eEbfcEA76161609` |
| CreditToken v1 | `0xEee18Aa3ef4151D8eA2aBF38998346Ec89B5a034` |
| ProofGate v1 | `0xd500E7E2Cffa2C3Cc1308874bB0a8D9A571Cdf45` |

## Sepolia (source chain)

| Item | Value |
|---|---|
| PGUSD test token | `0x736AA38bc60384DB13b03b2D6aa1D810230C9Dd0` (deploy tx `0xae5bcac55f3d0e4713cc74f13e2fba0d210a2536437052c1ac2d8fb95dc7e3e5`) |
| Vault (repayment recipient EOA) | `0xd1F1FA3CbA5B6532a01C842c43D26FCE54E81A38` |
| Repayment 1: 20 PGUSD (block 11584692) | `0xfb8fb000d2df1355eca8c35621ad583d0eb01472f59d2eedd84de84e9c388a3d` |
| Repayment 2: 15 PGUSD (block 11584695) | `0x86ad4225977a8fe47f1fffc28e9c6768d3499e35712b535f22e1be636181f6b7` |
| Repayment 3: 15 PGUSD (block 11584698) | `0x5764115ac983d87a48a7eb6463a0acc9ce449f6861ed8cdd6b64b3044700af4d` |

All three: Transfer(borrower `0x7Fe2...5d27B` -> vault `0xd1F1...81A38`) on PGUSD
`0x736AA38bc60384DB13b03b2D6aa1D810230C9Dd0`. Total proven: 50 PGUSD.

## Policy commitments

- **Policy #1** — "Proof-of-Repayment Microcredit" (`policies/1.md`), commit tx
  `0x363c7f2da7667632b8f820c903e6780ad899b764e3a3ef30cf7958ed79787b47`.
  Fields: maxLoanAmount=50 PGUSD, minCompletedRepayments=3, sourceChainId=11155111,
  sourceChainKey=1, requiredSourceToken=PGUSD, vault=`0xd1F1...81A38`,
  policyTextHash=`0x5aa7c042a59bee6a2fb1b2aa28e10de343d0e2b19fd1ab67e8b73e65777da667`.
  Lender: `0x65be7B4E45E3E7fd415865540407fb021937f5A3` (funded tutorial key doubles
  as lender; the demo-critical split is agent 0x65be != borrower 0x7Fe2).

## Day 3 — live end-to-end run (Scene 1 on testnet)

- submitRepaymentProof x3 (each verified by the real precompile 0x...0FD2):
  - `0xd0e48c0ab414178c3ca47a2ec3d2a75efa672d8d3f0836f2f5eda2e96adf83e9` (20 PGUSD, height 11584692)
  - `0x2e8fbd3eaa267f4f57db52b4c84891877247a03c301ca29f494d9a086883da7e` (15 PGUSD, height 11584695)
  - `0x708b7cfc2dd2a967069ce6b52f46643bab17cbe367075ea8be9e0e86abe3ac81` (15 PGUSD, height 11584698)
- requestCredit (agent 0x65be != borrower 0x7Fe2):
  `0x0fe91edf0f72a41bb24fb2aa4eb427d3377f6258fa104639f078a1eefe7b33e1`
  -> CreditReleased(policyId=1, borrower=0x7Fe2..., released=50 PGC, claimed=50,
     rationaleHash=0x6e837a380d8f03a0ccedea70894432ea38ef3221e679fbaa5dda9a21db1b0ffe,
     proofsUsed=3)
- Borrower PGC balance after release: 50.0 (verified via cast).
- Full proof payloads saved in test/fixtures/proofs.json.

## Day 4 — adversarial scenes live on testnet

### Scene 2 — Fabrication (REVERTED, as designed)
- Tampered fixture #1 (repayment amount 20 -> 21 PGUSD inside txBytes) and
  submitted under policyId 1.
- REVERTED on-chain: `0x1701337e3cab0861e8bd85b57dfb4a0e39d020c0d784d279ffa0adcccde60838`
  (status 0). Revert reason from the precompile itself: "Merkle proof validation failed".
  No proof, no credit.

## `.env` additions (never commit `.env`)

```
PROOFGATE_VAULT_ADDRESS=0xd1F1FA3CbA5B6532a01C842c43D26FCE54E81A38
PGUSD_TOKEN_ADDRESS=0x736AA38bc60384DB13b03b2D6aa1D810230C9Dd0
POLICY_REGISTRY_ADDRESS=0x4E4Ce51642053DD43eEa17840878e6cC8463aD6C
CREDIT_TOKEN_ADDRESS=0x62aBdb6fCB4Fee617542Fc1c42a0bD3E96d073fD
PROOFGATE_ADDRESS=0xb9B4ec47C1DEE16254f35c2699384542082AE731
EVM_V1_DECODER_ADDRESS=0xe885348A01991C457D8a71Cb7eEbfcEA76161609
```
