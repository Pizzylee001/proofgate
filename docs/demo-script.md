# ProofGate — Demo Video Script (3–4 min, dashboard edition)

Setup before recording:
- `cd web && set -a && source ../.env && set +a && npm run dev`, browser at
  localhost:3000, window sized so the whole story column reads well.
- Blockscout (creditcoin-testnet.blockscout.com) open in a second tab.
- Demo wallet funded (tCTC). Speak the narration close to verbatim.

---

## Shot 1 — Cold open on the dashboard hero (0:00–0:20)

**Screen:** dashboard top — logo, "The AI interprets the policy. The contract enforces it."

**Narration:**
> "AI agents are starting to control money — and they can hallucinate.
> ProofGate binds an underwriting AI to two things it cannot fake: its own
> committed policy, and cryptographically proven cross-chain facts.
> This is the Protocol Room. Everything you're about to see is live on
> Creditcoin testnet."

## Shot 2 — Section ① The Policy (0:20–0:55)

**Screen:** section ①. Click **Compile with AI**; the green card appears.
Then click **Commit policy on-chain**; policyId + tx link appear.

**Narration:**
> "A lender types rules in plain English: up to seventy-five PGUSD, three
> completed repayments, to my vault, on Sepolia. The AI compiles it into the
> machine-readable policy — every phrase mapped, nothing invented.
> One click commits it on-chain. From this moment it's immutable — and it was
> committed before any borrower applied."

*(Optional: click the tx link, show PolicyCommitted on Blockscout.)*

## Shot 3 — Section ② The Proven History (0:55–1:20)

**Screen:** scroll to section ②; let the three green rows sit on screen.

**Narration:**
> "This borrower's history isn't claimed — it's proven. Three Sepolia
> repayments — twenty, fifteen, fifteen PGUSD — each verified by the
> Attestcoin Protocol's Native Query Verifier precompile, synchronously,
> inside the transaction. Green on this page means proven. Nothing else
> gets to be green."

## Shot 4 — Section ③ The Decision (1:20–2:10)

**Screen:** section ③. Click **Ask the agent**. Let the stepper walk:
proving → thinking → executing → the Receipt Card fades in.

**Narration:**
> "Now the agent goes to work — and you can watch it. Proving: the three
> Attestcoin proofs are submitted and verified on-chain. Thinking: the LLM
> weighs the proven facts against the committed policy. Executing: the
> decision hits the contract. And here's the receipt: released fifty —
> the decoded, proven total — claimed fifty. And this hash is the AI's own
> reasoning, committed on-chain. Any auditor can recompute it. The AI's
> words versus the proofs — forever."

## Shot 5 — Section ④ Try to Cheat — the money shot (2:10–3:00)

**Screen:** section ④. Click **Fabricate a repayment**. The red alarm panel
lands. Then click the tx link → Blockscout shows the FAILED tx. Back to the
dashboard, click **Inflate the claim**. Second red panel.

**Narration:**
> "Now try to cheat. We rewrite one byte of a proven transaction — twenty
> becomes twenty-one — and submit it. The Attestcoin precompile itself says
> no: 'Merkle proof validation failed.' That revert is mined, forever —
> here it is on the explorer. Now the subtler attack: a real repayment, but
> the agent claims five hundred against a fifty cap. The contract:
> 'Agent claim exceeds policy cap.' The AI interprets. The contract
> enforces. And the failures are as public as the successes."

## Shot 6 — Close (3:00–3:20)

**Screen:** scroll slowly back to top; end on the logo.

**Narration:**
> "Seven committed policies, twenty-two precompile verifications, every
> scene replayable offline from checked-in fixtures. ProofGate:
> natural-language policy in, cryptographic proof out. Links in the
> description."

---

### Backup (if testnet or LLM endpoint is unhealthy on recording day)
Sections ②–④ can be supported by the already-mined txs in `deployments.md`
(every banner hash) plus `forge test` offline against the real fixtures.
Never demo without at least one red panel or the scene-3 release-vs-claim
receipt — the adversarial story is the entry.
