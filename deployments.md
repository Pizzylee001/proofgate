# ProofGate — CC3 Testnet Deployments

Network: Creditcoin CC3 Testnet
RPC: https://rpc.cc3-testnet.creditcoin.network
Deployed: 2026-08-28 (Day 2)
Deployer: 0x65be7B4E45E3E7fd415865540407fb021937f5A3

| Contract | Address | Tx hash |
|---|---|---|
| EvmV1Decoder (official @gluwa/usc-contracts lib, own instance) | `0xe885348A01991C457D8a71Cb7eEbfcEA76161609` | `0x9f9566bd06432c5ddfd850364e33adb1f6e7924ec22ac1788820688886e0aae7` |
| PolicyRegistry | `0x4E4Ce51642053DD43eEa17840878e6cC8463aD6C` | `0xb10ec07ec3b39e4f03e5b7c5cd59e5cdb9c361e347aa57ab9bab9acc369311d5` |
| CreditToken (PGC) | `0xEee18Aa3ef4151D8eA2aBF38998346Ec89B5a034` | `0x419f89bc5001fbfc16d26b364edd5737cb95d0652a7d11387f3195e1335b1246` |
| ProofGate | `0xd500E7E2Cffa2C3Cc1308874bB0a8D9A571Cdf45` | `0x7cdce6a9235ae8e036cfa7bc695b7f0bc9ea32158b0f83a484cf60547e17f720` |

Wiring:
- `CreditToken.setGate(ProofGate)` — tx `0x97145a9fd7e2417703b72e0e6a75a478e453c43ca4151030927910d4486875f4`, block 5388060, verified via `gate()` read.
- ProofGate verifier = Native Query Verifier precompile `0x0000000000000000000000000000000000000FD2` (Attestcoin Protocol).
- EvmV1Decoder's functions are all `internal`, so the library is inlined into
  ProofGate's bytecode; the standalone deployment above is our recorded own
  instance for provenance and potential future linking.

## Add these to `.env` (do NOT commit .env)

```
PROOFGATE_VAULT_ADDRESS=        # TBD Day 3: Sepolia repayment vault address
POLICY_REGISTRY_ADDRESS=0x4E4Ce51642053DD43eEa17840878e6cC8463aD6C
CREDIT_TOKEN_ADDRESS=0xEee18Aa3ef4151D8eA2aBF38998346Ec89B5a034
PROOFGATE_ADDRESS=0xd500E7E2Cffa2C3Cc1308874bB0a8D9A571Cdf45
EVM_V1_DECODER_ADDRESS=0xe885348A01991C457D8a71Cb7eEbfcEA76161609
```
