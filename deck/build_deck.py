#!/usr/bin/env python3
"""ProofGate deck -> PDF. Pure stdlib (no deps): the network was down on build
day, so this writes a valid PDF directly (standard-14 Helvetica, no font
embedding). deck/slides.md remains the canonical source; this mirrors it."""

PAGE_W, PAGE_H = 960, 540  # 16:9 landscape, points
MARGIN = 56

SLIDES = [
    ("ProofGate", [
        ("h1", "AI-compiled lending policies, enforced by Attestcoin proofs."),
        ("p", ""),
        ("p", "A lender writes rules in plain English. An AI compiles them into a policy"),
        ("p", "committed on-chain BEFORE anyone applies. Credit moves only when the policy"),
        ("p", "allows it AND the Attestcoin Protocol has cryptographically proven the"),
        ("p", "repayment history."),
        ("p", ""),
        ("h2", "The AI interprets the policy. The contract enforces it."),
        ("p", ""),
        ("p", "BUIDL CTC 2026 Fall - AI track"),
    ]),
    ("The problem: AI agents with money can't be trusted", [
        ("b", "LLMs can FABRICATE repayment histories, INFLATE amounts, and 'reinterpret'"),
        ("b", "rules into what the lender never agreed to."),
        ("p", ""),
        ("b", "Contracts can't judge free-text rules - that judgment is the one job only"),
        ("b", "the AI can do. So keep the AI, but bind it:"),
        ("b", "  1. to its OWN COMMITTED POLICY (immutable, on-chain, pre-application),"),
        ("b", "  2. to CRYPTOGRAPHICALLY PROVEN cross-chain facts (Attestcoin Protocol)."),
        ("p", ""),
        ("h2", "Every release pays the decoded, proven total - never the AI's claim."),
    ]),
    ("Architecture", [
        ("b", "PolicyRegistry - English policy -> LLM-compiled struct + policyTextHash,"),
        ("b", "  committed immutable. Versioning = new policyId."),
        ("b", "ProofGate - submitRepaymentProof (verify via precompile -> replay guard ->"),
        ("b", "  decode Transfer from the proven receipt -> policy checks), then"),
        ("b", "  requestCredit (count >= min, claim <= cap, mint min(decoded, cap))."),
        ("b", "TypeScript agent - llm.ts (provider-agnostic) -> compile_policy.ts ->"),
        ("b", "  decide.ts. Ordinary key, ZERO privileged roles."),
        ("p", ""),
        ("b", "Contracts frozen at v1.0-contracts-frozen; 4/4 Foundry scenes run offline"),
        ("b", "on REAL Attestcoin proof fixtures."),
    ]),
    ("Five scenes, all live on CC3 testnet", [
        ("b", "1  Honest (3x proven repayments)  -> 50 PGC released     0x0fe91edf..7b33e1"),
        ("b", "2  Fabrication (tampered byte)  -> PRECOMPILE REJECTED  0x1701337e..e60838"),
        ("b", "3  Inflation (claimed 500, proven 50) -> released 50     0x8c609657..90f3fb"),
        ("b", "4a Strict policy (needs 5, has 3) -> REVERTED            0xc89c97c2..81612"),
        ("b", "4b Agent beyond own cap (600 > 500) -> REVERTED          0xd2b53bf5..ede21"),
        ("b", "5  Live AI: English -> policy -> decision -> 50 PGC      0x4769f3a7..e7b6ff"),
        ("p", ""),
        ("b", "Full audit trail: deployments.md - every hash a real testnet transaction."),
    ]),
    ("Decision receipts: the AI vs the proof, forever", [
        ("b", "event CreditReleased("),
        ("b", "  uint256 indexed policyId, address indexed borrower,"),
        ("b", "  uint256 releasedAmount,  // decoded from proofs - what moved"),
        ("b", "  uint256 claimedAmount,   // what the AI said"),
        ("b", "  bytes32 rationaleHash,   // keccak256 of the LLM's own reasoning"),
        ("b", "  uint256 proofsUsed);"),
        ("p", ""),
        ("b", "Scene 3 on-chain: released=50, claimed=500 - the inflation attempt is"),
        ("b", "permanently recorded next to the truth. Any auditor can hash the"),
        ("b", "rationale and compare it against the proven facts."),
    ]),
    ("Attestcoin Protocol depth + resilience", [
        ("b", "22 verifyAndEmit calls across 7 committed policies (21 verified,"),
        ("b", "1 rejected - the fabrication scene). Full EVM receipts; event logs"),
        ("b", "decoded on-chain via the official EvmV1Decoder."),
        ("b", "Synchronous in-tx verification; merkle + continuity proofs from the"),
        ("b", "Proof Builder; per-policy replay guards; multi-proof aggregation by default."),
        ("p", ""),
        ("b", "Resilience, proven live: an RPC ETIMEDOUT hit mid-demo. The agent is"),
        ("b", "resumable - it submits only proofs not yet on record (the replay guard"),
        ("b", "makes the boundary exact) - and finished the scene without manual repair."),
    ]),
    ("What's next", [
        ("b", "Mainnet policy templates + multi-source-chain histories (chainKey routing"),
        ("b", "  is already per-policy)."),
        ("b", "Richer compiled policies (rate limits, cooldowns) behind the same"),
        ("b", "  commit-then-enforce pattern."),
        ("b", "Attested decision receipts: sign rationale + evidence bundle, anchor the"),
        ("b", "  signature next to rationaleHash."),
        ("b", "Agent reputation: CreditReleased claimed-vs-released is a public,"),
        ("b", "  machine-readable honesty score for AI underwriters."),
        ("p", ""),
        ("h2", "ProofGate: natural-language policy in, cryptographic proof out."),
        ("p", "github.com/Pizzylee001/proofgate"),
    ]),
]

SIZES = {"title": 30, "h1": 18, "h2": 15, "p": 12, "b": 12}
LEADING = {"title": 40, "h1": 26, "h2": 22, "p": 17, "b": 17}

def esc(t: str) -> str:
    return t.replace("\\", r"\\").replace("(", r"\(").replace(")", r"\)")

def content_stream(title: str, lines) -> bytes:
    parts = []
    y = PAGE_H - MARGIN
    parts.append(f"BT /F2 {SIZES['title']} Tf {MARGIN} {y - SIZES['title']} Td ({esc(title)}) Tj ET")
    y -= LEADING["title"] + 14
    for kind, text in lines:
        size = SIZES[kind]
        font = "/F2" if kind in ("h1", "h2") else "/F1"
        y -= LEADING[kind]
        if text:
            parts.append(f"BT {font} {size} Tf {MARGIN} {y} Td ({esc(text)}) Tj ET")
    return "\n".join(parts).encode("latin-1", "replace")

def build(path: str) -> None:
    objects = []  # list of bytes, index+1 = object number
    n_pages = len(SLIDES)
    # obj 1: catalog, obj 2: pages, obj 3: font F1, obj 4: font F2
    page_obj_start = 5
    content_obj_start = page_obj_start + n_pages
    kids = " ".join(f"{page_obj_start + i} 0 R" for i in range(n_pages))
    objects.append(b"<< /Type /Catalog /Pages 2 0 R >>")
    objects.append(f"<< /Type /Pages /Kids [{kids}] /Count {n_pages} >>".encode())
    objects.append(b"<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>")
    objects.append(b"<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold >>")
    for i, (title, lines) in enumerate(SLIDES):
        contents = content_stream(title, lines)
        content_num = content_obj_start + i
        page = (f"<< /Type /Page /Parent 2 0 R /MediaBox [0 0 {PAGE_W} {PAGE_H}] "
                f"/Resources << /Font << /F1 3 0 R /F2 4 0 R >> >> "
                f"/Contents {content_num} 0 R >>").encode()
        objects.append(page)
    for i, (title, lines) in enumerate(SLIDES):
        stream = content_stream(title, lines)
        objects.append(b"<< /Length " + str(len(stream)).encode() + b" >>\nstream\n" + stream + b"\nendstream")

    out = bytearray(b"%PDF-1.4\n%\xe2\xe3\xcf\xd3\n")
    offsets = [0]
    for num, body in enumerate(objects, start=1):
        offsets.append(len(out))
        out += f"{num} 0 obj\n".encode() + body + b"\nendobj\n"
    xref_pos = len(out)
    out += f"xref\n0 {len(objects) + 1}\n".encode()
    out += b"0000000000 65535 f \n"
    for off in offsets[1:]:
        out += f"{off:010d} 00000 n \n".encode()
    out += (f"trailer\n<< /Size {len(objects) + 1} /Root 1 0 R >>\n"
            f"startxref\n{xref_pos}\n%%EOF\n").encode()
    open(path, "wb").write(bytes(out))
    print(f"wrote {path} ({len(out)} bytes, {n_pages} pages)")

if __name__ == "__main__":
    build("deck/proofgate-deck.pdf")
