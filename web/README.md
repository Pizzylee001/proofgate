# ProofGate: The Protocol Room (web dashboard)

One-page live demo: compile a lending policy from English with an LLM, commit it
on-chain, watch Attestcoin-verified repayment history drive an AI decision, then
try to cheat and watch the protocol catch it, all txs real on CC3 testnet.

## Run locally

```bash
# from the REPO ROOT: the routes need the repo's .env (see .env.example)
cd web
set -a && source ../.env && set +a   # or export the vars yourself
npm install
npm run dev
# http://localhost:3000
```

## Deploy to Vercel (user steps)

1. Push this repo to GitHub (already done).
2. vercel.com → sign in with GitHub → **Add New → Project** → import `proofgate`.
3. **Root Directory: `web`** (edit before deploying; important!).
4. Add the environment variables from `.env.example`
   (LLM_BASE_URL, LLM_API_KEY, LLM_MODEL, CREDITCOIN_RPC_URL, DEMO_WALLET_PRIVATE_KEY).
5. Deploy. No build settings needed beyond the defaults; the framework preset
   is Next.js and the build command is auto-detected.

Notes:
- Contract addresses and the Attestcoin proof fixtures are bundled
  (`lib/chain.ts`, `lib/proofs.json`), no extra config.
- The demo wallet needs a small tCTC balance from the CC3 testnet faucet,
  or commit/decide/cheat routes will fail with insufficient funds.
- Every tx hash on the page links to the CC3 testnet explorer
  (creditcoin-testnet.blockscout.com).
