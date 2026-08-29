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

### Scene 3 — Inflation (SUCCEEDED, released decoded 50 not claimed 500)
- Policy #2 "Generous" (`policies/2.md`, cap 500 / min 3): commit tx
  `0x281a60b201e2ea683bd66b95b42809c5b56c9bf32cf2480041deb484823be0cb`
  (policyId=2, policyTextHash `0x76fa3bb2d5dfe73cdea013b2552bc63901eb2263d4d268c98a5c8ce0a92d7bb1`).
- Same three fixture proofs resubmitted under policyId 2 (per-policy replay guard
  makes this legitimate): `0x3e8a1af0...`, `0xfd6d899b...`, `0xeb8f7045...`.
- requestCredit claimedAmount=500 -> tx `0x8c6096578855da22b762f26ec9da49aa08b169f794ea259894f2aed57d90f3fb` (status 1)
  CreditReleased: released=50, claimed=500, proofsUsed=3,
  rationaleHash=0xd8141708e0e060322de334ec954d8a0ea5ed4153318784d9d784d560d0245c33.
- Borrower PGC balance: 50 -> 100.

### Scene 4a — Policy violation: strict diverges (REVERTED, as designed)
- Policy #3 "Conservative" (`policies/3.md`, cap 500 / min 5): commit tx
  `0x449dca9c3c31cef178d08f778a09299298f9970ae45cc8fa26305d0d7a5168c0`
  (policyId=3, policyTextHash `0x17c71a4e446f051cc1a20d8849c19ef2b53ec08aa242560690790659af9e74f6`).
- Same three proofs accepted under policyId 3 (`0x0d3d9dda...`, `0x4f7c92da...`,
  `0xb1435cd1...`) — proofs verify fine; the POLICY is what differs.
- requestCredit REVERTED on-chain:
  `0xc89c97c2f8e138fce22604392bff00f1ec501b681239cf83cd7354cfd8e81612` (status 0),
  reason "Not enough proven repayments". Same history released 50 under Policy #2.

### Scene 4b — Agent beyond its own committed cap (REVERTED, as designed)
- Policy #4 "Generous (second pool)" (`policies/4.md`, cap 500 / min 3): commit tx
  `0xe0f85477566a971fbf6fa3a79b7e129c89bf58bf15fbeedf85c6a4eae367b2fd`
  (policyId=4, policyTextHash `0xddaeda4f27962e33a24e678e26de77007f0600a3f57c710bac8144b4acc1a03b`).
- Three proofs accepted under policyId 4 (`0x96548193...`, `0xd0d8f4f1...`,
  `0x8f61af66...`).
- requestCredit with claimedAmount=600 REVERTED on-chain:
  `0xd2b53bf5a44030e567b4df780767470a8db6e0d8c5050847d3be81ce0e8ede21` (status 0),
  reason "Agent claim exceeds policy cap". The agent cannot outbid its lender's
  committed policy.

### Scene 2 — Fabrication (REVERTED, as designed)
- Tampered fixture #1 (repayment amount 20 -> 21 PGUSD inside txBytes) and
  submitted under policyId 1.
- REVERTED on-chain: `0x1701337e3cab0861e8bd85b57dfb4a0e39d020c0d784d279ffa0adcccde60838`
  (status 0). Revert reason from the precompile itself: "Merkle proof validation failed".
  No proof, no credit.

## Day 6 — Scene 5: live AI-compiled policy + AI decision

- Policy #5 — LLM-compiled from English ("Lend up to 75 PGUSD to anyone with
  3 or more completed repayments to my vault on Ethereum Sepolia, paid in PGUSD."):
  commit tx `0x2afe0ed1f7aeeaa430cac3d9e728a45b74821efae3689d08571f7b8ca7c35b47`
  (policyId=5, cap 75 / min 3, policyTextHash `0x89229857638d6b7083868ac1871fff396e51c1e13189502ce18924e7bd14c389`).
  English + compiled JSON + compiler rationale in `policies/5.md`.
- Proven history submitted under policyId 5: `0x3bec27e1...`, `0xf177c706...`,
  `0xf6b1f5dc...` (all status 1, verified by the precompile).
- LLM decision: approved 50 PGUSD (sum of proven repayments, within the 75 cap).
- requestCredit tx `0x4769f3a734df10aaaf842fb55c3ac6817441bb924cb1479935be72f725e7b6ff`
  -> CreditReleased released=50, claimed=50, proofsUsed=3,
  rationaleHash=`0x3ea3fbdef481d4e561d784388b2399cd95e68b02b5a5d0986e69adc70bc7f063`
  (keccak of the LLM's own rationale — the decision receipt).
- Borrower PGC balance: 100 -> 150.

## Day 6 — Scene 5 encore (policy #6, inside `yarn demo` run)

- Policy #6 — same LLM-compiled English text, committed inside the demo run:
  tx `0x5dfd1b2d65fe231dff0204b9060fff484b2a36e869abc1235d3e066e9eb476f3`.
- Proof submissions under policyId 6: `0x5fea3bd4...`, `0xf289d744...` and a third
  that landed despite an RPC receipt timeout (`read ETIMEDOUT` — transient; the
  decide script is resumable: it submits only proofs not yet on record).
- LLM decision (approved 50/75 cap) -> requestCredit tx
  `0xd1a27c4491628920fed39faa814b01b0e16eb90c3ded7c9e523a678179727834` (status 1),
  rationaleHash `0x19a09a95259cdac9819dd6a05aa7b7021c3ff34d0dbc5d167c31f778a667b9e9`.
- Borrower PGC balance: 150 -> 200.

## Day 6 — Full `yarn demo` verification run (policy #7)

- Scenes 1-4 narrated with the real testnet tx hashes above; scene 5 live:
  policy #7 LLM-compiled and committed, 3 proofs verified on-chain
  (`0xa7c01a83...`, `0x0a3d01a8...`, `0x269f321a...`), LLM approved 50,
  requestCredit tx `0xc71d5711db0c977f6759802a3b93a410487143f79b8e060f3f52d2a725b03388`
  (status 1), rationaleHash `0xadd445eccd461a035f8daa50a5265b3f9c10fc0f25419d245f484b2059156c10`.
- Borrower PGC balance: 200 -> 250. Total runtime ~113s.

## Day 8 — Live demo dashboard (web/), all routes verified on-chain

Demo wallet (dashboard's only key, fresh/testnet-only): `0xd6a91ab4D247743687D95C96900B63aD9394c26f`

- `/api/commit`: policy #8 committed BY THE DEMO WALLET (lender = 0xd6a9...):
  tx `0x6d7a5d50a0102afc9a972300fbbed7051195547306650c60f9af833f371dca2b`
- `/api/decide` (SSE: proving -> thinking -> executing): 3 proofs under policy #8
  (`0x3ee90033...`, `0x7dd85edb...`, `0xc0baf352...`), then requestCredit
  `0x246108db61f3d35eab57eeb33a8d21c469858c5293d6bd18e69833fbb1674a10`
  -> released 50 PGC, balance 250 -> 300.
- `/api/cheat` fabricate: tampered proof REVERTED by the precompile —
  tx `0xb176eb5bbd08c523dcd323b024f80bba83759fedf65c584e7e33d1cd041c049f` (status 0,
  "Merkle proof validation failed").
- `/api/cheat` inflate: fresh cap-50 policy #9 committed, real 20 PGUSD proof
  verified (`0xcf086bfc...`), claim 500 REVERTED —
  tx `0x793f8dec089dbb31cde440368394034fdb3da64552043a44aab703050b7890d0` (status 0,
  "Agent claim exceeds policy cap").

## `.env` additions (never commit `.env`)

```
PROOFGATE_VAULT_ADDRESS=0xd1F1FA3CbA5B6532a01C842c43D26FCE54E81A38
PGUSD_TOKEN_ADDRESS=0x736AA38bc60384DB13b03b2D6aa1D810230C9Dd0
POLICY_REGISTRY_ADDRESS=0x4E4Ce51642053DD43eEa17840878e6cC8463aD6C
CREDIT_TOKEN_ADDRESS=0x62aBdb6fCB4Fee617542Fc1c42a0bD3E96d073fD
PROOFGATE_ADDRESS=0xb9B4ec47C1DEE16254f35c2699384542082AE731
EVM_V1_DECODER_ADDRESS=0xe885348A01991C457D8a71Cb7eEbfcEA76161609
```
