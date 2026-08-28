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
| PGUSD test token | TBD (step 2) |
| Vault (repayment recipient EOA) | TBD (step 2) |
| Repayment txs | TBD (step 4) |

## Policy commitments

TBD (step 3)

## `.env` additions (never commit `.env`)

```
PROOFGATE_VAULT_ADDRESS=        # TBD step 2
PGUSD_TOKEN_ADDRESS=            # TBD step 2
POLICY_REGISTRY_ADDRESS=0x4E4Ce51642053DD43eEa17840878e6cC8463aD6C
CREDIT_TOKEN_ADDRESS=0x62aBdb6fCB4Fee617542Fc1c42a0bD3E96d073fD
PROOFGATE_ADDRESS=0xb9B4ec47C1DEE16254f35c2699384542082AE731
EVM_V1_DECODER_ADDRESS=0xe885348A01991C457D8a71Cb7eEbfcEA76161609
```
