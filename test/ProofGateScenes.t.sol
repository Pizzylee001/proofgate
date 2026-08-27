// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import {Test} from "forge-std/Test.sol";
import {INativeQueryVerifier} from "../src/interfaces/INativeQueryVerifier.sol";
import {IPolicyRegistry} from "../src/interfaces/IPolicyRegistry.sol";
import {IProofGate} from "../src/interfaces/IProofGate.sol";

/// @title ProofGate demo scenes, written as tests BEFORE the implementation.
/// @notice Adversarial scenes first, honest scene last. All tests are expected
///         to FAIL until PolicyRegistry + ProofGate are implemented (Day 2).
/// @dev Proof data is placeholder until real fixtures from the Attestcoin
///      Protocol are saved to test/fixtures/*.json (Day 3).
contract ProofGateScenesTest is Test {
    IProofGate internal gate;
    IPolicyRegistry internal registry;

    address internal lender = makeAddr("lender");
    address internal strictLender = makeAddr("strictLender");
    address internal borrower = makeAddr("borrower");
    address internal vault = makeAddr("vault");
    address internal sourceToken = makeAddr("sourceToken");

    uint64 internal constant SEPOLIA_CHAIN_ID = 11155111;
    uint64 internal constant SEPOLIA_CHAIN_KEY = 1;
    uint256 internal constant REPAYMENT_AMOUNT = 50 ether;

    function setUp() public {
        // TODO(Day 2): deploy PolicyRegistry, credit token and ProofGate, then wire.
        revert("ProofGate system not implemented yet");
    }

    // ---------------------------------------------------------------------
    // Scene 2 — Fabrication: a garbage/fabricated proof must never release credit.
    // ---------------------------------------------------------------------
    function test_Scene2_FabricatedProof_Reverts() public {
        IProofGate.Proof[] memory proofs = new IProofGate.Proof[](1);
        proofs[0] = _fakeProof(1000, REPAYMENT_AMOUNT);

        vm.expectRevert();
        gate.requestCredit(
            1,
            borrower,
            proofs,
            IProofGate.AgentDecision({approved: true, claimedAmount: REPAYMENT_AMOUNT, rationale: "trust me"})
        );
    }

    // ---------------------------------------------------------------------
    // Scene 3 — Inflation: a real 50-unit repayment is proven, the agent claims
    // 500; the contract releases the decoded 50, never the claimed amount.
    // ---------------------------------------------------------------------
    function test_Scene3_InflatedClaim_ReleasesDecodedAmountOnly() public {
        uint256 policyId = _commitPolicy(lender, 1000 ether, 1);
        uint256 expectedReleased = REPAYMENT_AMOUNT; // decoded, proven — not the claim
        uint256 claimed = 500 ether;

        IProofGate.Proof[] memory proofs = new IProofGate.Proof[](1);
        proofs[0] = _fakeProof(1000, REPAYMENT_AMOUNT);

        vm.expectEmit(true, true, true, true, address(gate));
        emit IProofGate.CreditReleased(
            policyId, borrower, expectedReleased, claimed, keccak256(bytes("inflated rationale")), 1
        );
        gate.requestCredit(
            policyId,
            borrower,
            proofs,
            IProofGate.AgentDecision({approved: true, claimedAmount: claimed, rationale: "inflated rationale"})
        );
    }

    // ---------------------------------------------------------------------
    // Scene 4a — Policy violation: same proven history under two policies.
    // Strict policy reverts, lenient succeeds, then an approval beyond the
    // lender's own committed cap reverts.
    // ---------------------------------------------------------------------
    function test_Scene4a_PolicyViolation_StrictReverts_LenientSucceeds_BeyondCapReverts() public {
        // History: 3 proven repayments of REPAYMENT_AMOUNT each.
        IProofGate.Proof[] memory proofs = new IProofGate.Proof[](3);
        for (uint256 i = 0; i < 3; i++) {
            proofs[i] = _fakeProof(uint64(1000 + i), REPAYMENT_AMOUNT);
        }

        // Strict lender demands 5 proven repayments; history has 3.
        uint256 strictPolicyId = _commitPolicy(strictLender, 1000 ether, 5);
        vm.prank(borrower);
        vm.expectRevert();
        gate.requestCredit(
            strictPolicyId,
            borrower,
            proofs,
            IProofGate.AgentDecision({approved: true, claimedAmount: 3 * REPAYMENT_AMOUNT, rationale: "strict try"})
        );

        // Lenient lender demands 3; the same history satisfies it.
        uint256 lenientPolicyId = _commitPolicy(lender, 1000 ether, 3);
        vm.expectEmit(true, true, true, true, address(gate));
        emit IProofGate.CreditReleased(
            lenientPolicyId,
            borrower,
            3 * REPAYMENT_AMOUNT,
            3 * REPAYMENT_AMOUNT,
            keccak256(bytes("lenient ok")),
            3
        );
        gate.requestCredit(
            lenientPolicyId,
            borrower,
            proofs,
            IProofGate.AgentDecision({approved: true, claimedAmount: 3 * REPAYMENT_AMOUNT, rationale: "lenient ok"})
        );

        // The agent then approves beyond its own committed cap.
        uint256 cappedPolicyId = _commitPolicy(lender, 2 * REPAYMENT_AMOUNT, 3);
        vm.expectRevert();
        gate.requestCredit(
            cappedPolicyId,
            borrower,
            proofs,
            IProofGate.AgentDecision({approved: true, claimedAmount: 3 * REPAYMENT_AMOUNT, rationale: "beyond cap"})
        );
    }

    // ---------------------------------------------------------------------
    // Scene 1 — Honest: 3 real repayments proven, policy satisfied
    // (minCompletedRepayments = 3), credit released for the decoded total.
    // Multi-proof aggregation is the DEFAULT path.
    // ---------------------------------------------------------------------
    function test_Scene1_HonestThreeRepayments_ReleasesDecodedTotal() public {
        uint256 policyId = _commitPolicy(lender, 1000 ether, 3);
        uint256 expectedReleased = 3 * REPAYMENT_AMOUNT;

        IProofGate.Proof[] memory proofs = new IProofGate.Proof[](3);
        for (uint256 i = 0; i < 3; i++) {
            proofs[i] = _fakeProof(uint64(1000 + i), REPAYMENT_AMOUNT);
        }

        vm.expectEmit(true, true, true, true, address(gate));
        emit IProofGate.CreditReleased(
            policyId, borrower, expectedReleased, expectedReleased, keccak256(bytes("honest rationale")), 3
        );
        gate.requestCredit(
            policyId,
            borrower,
            proofs,
            IProofGate.AgentDecision({approved: true, claimedAmount: expectedReleased, rationale: "honest rationale"})
        );

        // The credit token actually moved.
        assertEq(_creditTokenBalance(borrower), expectedReleased);
    }

    // ---------------------------------------------------------------------
    // Helpers
    // ---------------------------------------------------------------------

    /// @dev Placeholder proof; replaced by Attestcoin Protocol fixtures in Day 3.
    function _fakeProof(uint64 blockHeight, uint256 amount) internal pure returns (IProofGate.Proof memory) {
        INativeQueryVerifier.MerkleProofEntry[] memory siblings =
            new INativeQueryVerifier.MerkleProofEntry[](1);
        siblings[0] = INativeQueryVerifier.MerkleProofEntry({hash: bytes32(uint256(amount)), isLeft: true});
        bytes32[] memory continuityRoots = new bytes32[](1);
        continuityRoots[0] = bytes32(uint256(blockHeight));
        return IProofGate.Proof({
            chainKey: SEPOLIA_CHAIN_KEY,
            blockHeight: blockHeight,
            encodedTransaction: abi.encode(amount),
            merkleRoot: bytes32(uint256(blockHeight)),
            siblings: siblings,
            lowerEndpointDigest: bytes32(uint256(blockHeight)),
            continuityRoots: continuityRoots
        });
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
                requiredSourceChainKey: SEPOLIA_CHAIN_KEY,
                requiredSourceToken: sourceToken,
                vaultAddress: vault,
                policyTextHash: keccak256("placeholder policy text")
            })
        );
    }

    function _creditTokenBalance(address account) internal view returns (uint256) {
        (bool ok, bytes memory data) = gate.creditToken().staticcall(abi.encodeWithSignature("balanceOf(address)", account));
        require(ok, "balanceOf failed");
        return abi.decode(data, (uint256));
    }
}
