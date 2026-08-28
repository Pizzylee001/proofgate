// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import {Test} from "forge-std/Test.sol";
import {Vm} from "forge-std/Vm.sol";
import {stdJson} from "forge-std/StdJson.sol";
import {INativeQueryVerifier} from "../src/interfaces/INativeQueryVerifier.sol";
import {IPolicyRegistry} from "../src/interfaces/IPolicyRegistry.sol";
import {IProofGate} from "../src/interfaces/IProofGate.sol";
import {PolicyRegistry} from "../src/PolicyRegistry.sol";
import {CreditToken} from "../src/CreditToken.sol";
import {ProofGate} from "../src/ProofGate.sol";
import {MockNativeQueryVerifier} from "../src/MockNativeQueryVerifier.sol";

/// @title ProofGate demo scenes — adversarial first, honest last.
/// @dev Payloads are REAL Attestcoin Protocol proofs (test/fixtures/proofs.json),
///      generated on CC3 testnet from three actual Sepolia repayment txs
///      (20 + 15 + 15 PGUSD, borrower -> vault) and accepted by the real
///      precompile on 2026-08-28. The mock verifier stands in only because the
///      precompile does not exist on local test chains.
contract ProofGateScenesTest is Test {
    using stdJson for string;

    ProofGate internal gate;
    PolicyRegistry internal registry;
    CreditToken internal creditToken;
    MockNativeQueryVerifier internal mockVerifier;

    address internal lender = makeAddr("lender");
    address internal strictLender = makeAddr("strictLender");

    // Real demo identities — the fixture payloads decode to exactly these.
    address internal constant BORROWER = 0x7Fe2d9F882544d2EE23fc0A4719B4DB95Db5d27B;
    address internal constant VAULT = 0xd1F1FA3CbA5B6532a01C842c43D26FCE54E81A38;
    address internal constant PGUSD = 0x736AA38bc60384DB13b03b2D6aa1D810230C9Dd0;

    uint64 internal constant SEPOLIA_CHAIN_ID = 11155111;
    uint256 internal constant FIXTURE_COUNT = 3;

    bytes32 internal constant CREDIT_RELEASED_SIG =
        keccak256("CreditReleased(uint256,address,uint256,uint256,bytes32,uint256)");

    string internal fixturesJson;

    function setUp() public {
        registry = new PolicyRegistry();
        creditToken = new CreditToken();
        mockVerifier = new MockNativeQueryVerifier();
        gate = new ProofGate(address(registry), address(creditToken), address(mockVerifier));
        creditToken.setGate(address(gate));
        fixturesJson = vm.readFile("test/fixtures/proofs.json");
    }

    // ---------------------------------------------------------------------
    // Scene 2 — Fabrication: the verifier rejects the proof, no credit moves.
    // ---------------------------------------------------------------------
    function test_Scene2_FabricatedProof_Reverts() public {
        uint256 policyId = _commitPolicy(lender, 1000 ether, 1);

        // The Attestcoin precompile (here: the mock) refuses the fabricated proof.
        mockVerifier.setVerificationResult(false);

        vm.expectRevert(bytes("Proof verification failed"));
        gate.submitRepaymentProof(policyId, BORROWER, _fixtureProof(0));

        assertEq(gate.provenRepaymentCount(policyId, BORROWER), 0);
        assertEq(creditToken.balanceOf(BORROWER), 0);
    }

    // ---------------------------------------------------------------------
    // Scene 3 — Inflation: a real 20-unit repayment is proven, the agent claims
    // 500 (within a generous cap); the contract releases the decoded 20.
    // ---------------------------------------------------------------------
    function test_Scene3_InflatedClaim_ReleasesDecodedAmountOnly() public {
        uint256 policyId = _commitPolicy(lender, 1000 ether, 1);
        uint256 proven = _fixtureAmount(0); // 20 PGUSD, decoded from real bytes
        uint256 claimed = 500 ether;

        gate.submitRepaymentProof(policyId, BORROWER, _fixtureProof(0));
        assertEq(gate.provenRepaymentCount(policyId, BORROWER), 1);

        vm.recordLogs();
        gate.requestCredit(
            policyId,
            BORROWER,
            IProofGate.AgentDecision({approved: true, claimedAmount: claimed, rationale: "inflated rationale"})
        );

        (uint256 released, uint256 claimedOut,, uint256 proofsUsed) = _lastCreditReleased();
        assertEq(released, proven, "release must be the decoded amount");
        assertEq(claimedOut, claimed, "claim is recorded for the audit trail");
        assertEq(proofsUsed, 1);
        assertEq(creditToken.balanceOf(BORROWER), proven);
        assertEq(gate.provenRepaymentCount(policyId, BORROWER), 0, "proofs must be consumed");
    }

    // ---------------------------------------------------------------------
    // Scene 4a — Policy violation: same proven history under two policies.
    // Strict reverts, lenient succeeds, then approval beyond the lender's own
    // committed cap reverts.
    // ---------------------------------------------------------------------
    function test_Scene4a_PolicyViolation_StrictReverts_LenientSucceeds_BeyondCapReverts() public {
        uint256 provenTotal = _fixtureAmount(0) + _fixtureAmount(1) + _fixtureAmount(2); // 50 PGUSD

        // Strict lender demands 5 proven repayments; history has 3.
        uint256 strictPolicyId = _commitPolicy(strictLender, 1000 ether, 5);
        _submitAllFixtures(strictPolicyId);
        vm.expectRevert(bytes("Not enough proven repayments"));
        gate.requestCredit(
            strictPolicyId,
            BORROWER,
            IProofGate.AgentDecision({approved: true, claimedAmount: provenTotal, rationale: "strict try"})
        );

        // Lenient lender demands 3; the same proven history satisfies it
        // (replay guard is per policy, so re-submitting here is legitimate).
        uint256 lenientPolicyId = _commitPolicy(lender, 1000 ether, 3);
        _submitAllFixtures(lenientPolicyId);
        vm.recordLogs();
        gate.requestCredit(
            lenientPolicyId,
            BORROWER,
            IProofGate.AgentDecision({approved: true, claimedAmount: provenTotal, rationale: "lenient ok"})
        );
        (uint256 released,,, uint256 proofsUsed) = _lastCreditReleased();
        assertEq(released, provenTotal);
        assertEq(proofsUsed, 3);

        // The agent then approves beyond its own committed cap (40 < claim 50).
        uint256 cappedPolicyId = _commitPolicy(lender, 40 ether, 3);
        _submitAllFixtures(cappedPolicyId);
        vm.expectRevert(bytes("Agent claim exceeds policy cap"));
        gate.requestCredit(
            cappedPolicyId,
            BORROWER,
            IProofGate.AgentDecision({approved: true, claimedAmount: provenTotal, rationale: "beyond cap"})
        );
    }

    // ---------------------------------------------------------------------
    // Scene 1 — Honest: 3 real repayments proven, minCompletedRepayments = 3,
    // credit released for the decoded total (50 PGUSD). Multi-proof
    // aggregation is the DEFAULT path.
    // ---------------------------------------------------------------------
    function test_Scene1_HonestThreeRepayments_ReleasesDecodedTotal() public {
        uint256 policyId = _commitPolicy(lender, 1000 ether, 3);
        uint256 expectedReleased = _fixtureAmount(0) + _fixtureAmount(1) + _fixtureAmount(2);

        _submitAllFixtures(policyId);
        assertEq(gate.provenRepaymentCount(policyId, BORROWER), 3);

        vm.recordLogs();
        gate.requestCredit(
            policyId,
            BORROWER,
            IProofGate.AgentDecision({approved: true, claimedAmount: expectedReleased, rationale: "honest rationale"})
        );

        (uint256 released, uint256 claimedOut, bytes32 rationaleHash, uint256 proofsUsed) = _lastCreditReleased();
        assertEq(released, expectedReleased);
        assertEq(claimedOut, expectedReleased);
        assertEq(rationaleHash, keccak256(bytes("honest rationale")), "decision receipt mismatch");
        assertEq(proofsUsed, 3);
        assertEq(creditToken.balanceOf(BORROWER), expectedReleased, "credit token did not move");
        assertEq(gate.provenRepaymentCount(policyId, BORROWER), 0, "proofs must be consumed");

        // And the same history cannot mint twice.
        vm.expectRevert(bytes("Not enough proven repayments"));
        gate.requestCredit(
            policyId,
            BORROWER,
            IProofGate.AgentDecision({approved: true, claimedAmount: expectedReleased, rationale: "double dip"})
        );
    }

    // ---------------------------------------------------------------------
    // Fixture loading
    // ---------------------------------------------------------------------

    /// @dev Loads one REAL Attestcoin proof payload from test/fixtures/proofs.json.
    function _fixtureProof(uint256 idx) internal view returns (IProofGate.Proof memory) {
        string memory base = string.concat("$[", vm.toString(idx), "]");
        return IProofGate.Proof({
            chainKey: uint64(fixturesJson.readUint(string.concat(base, ".chainKey"))),
            blockHeight: uint64(fixturesJson.readUint(string.concat(base, ".blockHeight"))),
            encodedTransaction: fixturesJson.readBytes(string.concat(base, ".txBytes")),
            merkleRoot: fixturesJson.readBytes32(string.concat(base, ".merkleProof.root")),
            siblings: abi.decode(
                vm.parseJson(fixturesJson, string.concat(base, ".merkleProof.siblings")),
                (INativeQueryVerifier.MerkleProofEntry[])
            ),
            lowerEndpointDigest: fixturesJson.readBytes32(
                string.concat(base, ".continuityProof.lowerEndpointDigest")
            ),
            continuityRoots: abi.decode(
                vm.parseJson(fixturesJson, string.concat(base, ".continuityProof.roots")),
                (bytes32[])
            )
        });
    }

    /// @dev The repayment amount recorded alongside each fixture (whole PGUSD).
    function _fixtureAmount(uint256 idx) internal view returns (uint256) {
        string memory whole =
            fixturesJson.readString(string.concat("$[", vm.toString(idx), "].amountPgusd"));
        return vm.parseUint(whole) * 1 ether;
    }

    function _submitAllFixtures(uint256 policyId) internal {
        for (uint256 i = 0; i < FIXTURE_COUNT; i++) {
            gate.submitRepaymentProof(policyId, BORROWER, _fixtureProof(i));
        }
    }

    function _commitPolicy(address policyLender, uint256 maxLoan, uint256 minRepayments)
        internal
        returns (uint256 policyId)
    {
        vm.prank(policyLender);
        policyId = registry.commitPolicy(
            IPolicyRegistry.Policy({
                maxLoanAmount: maxLoan,
                minCompletedRepayments: minRepayments,
                requiredSourceChainId: SEPOLIA_CHAIN_ID,
                requiredSourceChainKey: 1,
                requiredSourceToken: PGUSD,
                vaultAddress: VAULT,
                policyTextHash: keccak256("placeholder policy text")
            })
        );
    }

    /// @dev Scans recorded logs for CreditReleased and decodes the data payload.
    ///      (CreditToken's Transfer event fires first, so naive expectEmit on the
    ///      gate event would assert against the wrong log.)
    function _lastCreditReleased()
        internal
        view
        returns (uint256 released, uint256 claimed, bytes32 rationaleHash, uint256 proofsUsed)
    {
        Vm.Log[] memory logs = vm.getRecordedLogs();
        for (uint256 i = logs.length; i > 0; --i) {
            if (logs[i - 1].topics[0] == CREDIT_RELEASED_SIG) {
                return abi.decode(logs[i - 1].data, (uint256, uint256, bytes32, uint256));
            }
        }
        revert("CreditReleased not emitted");
    }
}
