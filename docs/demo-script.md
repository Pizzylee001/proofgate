# ProofGate — Demo Video Script (3–5 min)

Recording checklist: terminal in `~/proofgate` with `source .env` done; block
explorer open on CC3 testnet; `forge test` and `yarn demo` both known-good.
Speak the narration verbatim-ish; keep pace brisk.

---

## Shot 1 — Problem (0:00–0:20)

**Screen:** title slide or README top section.

**Narration:**
> "AI agents are starting to control money — and they can hallucinate.
> An agent can invent a repayment history, inflate an amount, or bend a
> lender's rules. ProofGate binds the agent to two things it cannot fake:
> its own committed policy, and cryptographically proven cross-chain facts.
> The AI interprets the policy. The contract enforces it."

## Shot 2 — Architecture (0:20–0:50)

**Screen:** README architecture diagram (scroll slowly) or deck slide 3.

**Narration:**
> "Three parts. PolicyRegistry: the lender's English rules, compiled by the
> LLM, committed on-chain before anyone applies — immutable from then on.
> ProofGate: the gate. Every repayment is verified synchronously by the
> Attestcoin Protocol's Native Query Verifier precompile, replay-guarded,
> and the Transfer event is decoded straight out of the proven receipt.
> And the agent: ordinary key, no privileged role. When it asks for credit,
> the contract pays out the decoded, proven total — never the claimed amount."

## Shot 3 — `yarn demo` (0:50–2:50)

**Screen:** terminal. Run `yarn demo`. Let banners breathe; don't scroll past
tx hashes — pause half a second on each.

**Narration, timed to banners:**
> (Scene 1) "Scene one: three real repayments on Sepolia — twenty, fifteen,
> fifteen — each one proven by the Attestcoin precompile. Fifty credit released.
> Every one of these hashes is a real testnet transaction."
>
> (Scene 2) "Scene two: we tamper one byte of the proof. Watch — the
> *precompile itself* rejects it: 'Merkle proof validation failed'.
> No proof, no credit."
>
> (Scene 3) "Scene three: the agent claims five hundred against a proven
> fifty. The event log says it all: claimed five hundred, released fifty."
>
> (Scene 4) "Scene four: same proven history, a stricter policy demanding five
> repayments — reverted. Then the agent asks beyond its own lender's cap —
> reverted. The AI cannot outbid a committed policy."
>
> (Scene 5) "Scene five, live: the lender speaks plain English. The LLM
> compiles it — seventy-five cap, three repayments minimum — commits it
> on-chain, reads the proven history, decides, and executes. A brand-new
> policy, created by the AI, enforced by the contract, in about a minute."

## Shot 4 — The money shot (2:50–3:20)

**Screen:** CC3 testnet explorer, tx
`0x1701337e3cab0861e8bd85b57dfb4a0e39d020c0d784d279ffa0adcccde60838`
(status: Fail — "Merkle proof validation failed").

**Narration:**
> "This is the whole thesis in one transaction. The Attestcoin precompile —
> not our code — looked at a fabricated proof and said no, on-chain, forever.
> And here" — switch to scene 3's tx `0x8c609657…90f3fb`, open the logs —
> "claimed five hundred, released fifty. The AI's own words, hashed and
> stored next to what the proofs actually supported."

## Shot 5 — Close (3:20–3:50)

**Screen:** README decision-receipts section or final slide.

**Narration:**
> "Every decision carries a rationale hash — the AI's reasoning, committed.
> ProofGate: natural-language policy in, cryptographic proof out.
> Contracts frozen and tagged, fixtures checked in, full audit trail in the
> repo. Thank you."

---

### Backup (if testnet is unhealthy on recording day)
Scene 5 can be replaced by a re-run of `forge test` (fixture-backed, offline)
plus the already-recorded scene-5 tx hashes in `deployments.md`. Never demo
without scene 2 or 3.
