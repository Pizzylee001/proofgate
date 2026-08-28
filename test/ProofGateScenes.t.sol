// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import {Test} from "forge-std/Test.sol";
import {Vm} from "forge-std/Vm.sol";
import {INativeQueryVerifier} from "../src/interfaces/INativeQueryVerifier.sol";
import {IPolicyRegistry} from "../src/interfaces/IPolicyRegistry.sol";
import {IProofGate} from "../src/interfaces/IProofGate.sol";
import {PolicyRegistry} from "../src/PolicyRegistry.sol";
import {CreditToken} from "../src/CreditToken.sol";
import {ProofGate} from "../src/ProofGate.sol";
import {MockNativeQueryVerifier} from "../src/MockNativeQueryVerifier.sol";
import {EvmV1Decoder} from "@gluwa/usc-contracts/common/EvmV1Decoder.sol";

/// @title ProofGate demo scenes — adversarial first, honest last.
/// @dev Uses MockNativeQueryVerifier (the real Attestcoin precompile at
///      0x0000000000000000000000000000000000000FD2 does not exist on local
///      test chains) plus synthetic EvmV1Decoder-compatible tx payloads.
///      Real Attestcoin fixtures in test/fixtures/*.json replace the
///      synthetic payloads without touching the assertions.
contract ProofGateScenesTest is Test {
    ProofGate internal gate;
    PolicyRegistry internal registry;
    CreditToken internal creditToken;
    MockNativeQueryVerifier internal mockVerifier;

    address internal lender = makeAddr("lender");
    address internal strictLender = makeAddr("strictLender");
    address internal borrower = makeAddr("borrower");
    address internal vault = makeAddr("vault");
    address internal sourceToken = makeAddr("sourceToken");

    uint64 internal constant SEPOLIA_CHAIN_ID = 11155111;
    uint64 internal constant SEPOLIA_CHAIN_KEY = 1;
    uint256 internal constant REPAYMENT_AMOUNT = 50 ether;

    bytes32 internal constant CREDIT_RELEASED_SIG =
        keccak256("CreditReleased(uint256,address,uint256,uint256,bytes32,uint256)");

    function setUp() public {
        registry = new PolicyRegistry();
        creditToken = new CreditToken();
        mockVerifier = new MockNativeQueryVerifier();
        gate = new ProofGate(address(registry), address(creditToken), address(mockVerifier));
        creditToken.setGate(address(gate));
    }

    // ---------------------------------------------------------------------
    // Scene 2 — Fabrication: the verifier rejects the proof, no credit moves.
    // ---------------------------------------------------------------------
    function test_Scene2_FabricatedProof_Reverts() public {
        uint256 policyId = _commitPolicy(lender, 1000 ether, 1);

        // The Attestcoin precompile (here: the mock) refuses the fabricated proof.
        mockVerifier.setVerificationResult(false);

        vm.expectRevert(bytes("Proof verification failed"));
        gate.submitRepaymentProof(policyId, borrower, _proof(1000, REPAYMENT_AMOUNT));

        assertEq(gate.provenRepaymentCount(policyId, borrower), 0);
        assertEq(creditToken.balanceOf(borrower), 0);
    }

    // ---------------------------------------------------------------------
    // Scene 3 — Inflation: a real 50-unit repayment is proven, the agent claims
    // 500; the contract releases the decoded 50, never the claimed amount.
    // ---------------------------------------------------------------------
    function test_Scene3_InflatedClaim_ReleasesDecodedAmountOnly() public {
        uint256 policyId = _commitPolicy(lender, 1000 ether, 1);
        uint256 claimed = 500 ether;

        gate.submitRepaymentProof(policyId, borrower, _proof(1000, REPAYMENT_AMOUNT));
        assertEq(gate.provenRepaymentCount(policyId, borrower), 1);

        vm.recordLogs();
        gate.requestCredit(
            policyId,
            borrower,
            IProofGate.AgentDecision({approved: true, claimedAmount: claimed, rationale: "inflated rationale"})
        );

        (uint256 released, uint256 claimedOut,, uint256 proofsUsed) = _lastCreditReleased();
        assertEq(released, REPAYMENT_AMOUNT, "release must be the decoded amount");
        assertEq(claimedOut, claimed, "claim is recorded for the audit trail");
        assertEq(proofsUsed, 1);
        assertEq(creditToken.balanceOf(borrower), REPAYMENT_AMOUNT);
        assertEq(gate.provenRepaymentCount(policyId, borrower), 0, "proofs must be consumed");
    }

    // ---------------------------------------------------------------------
    // Scene 4a — Policy violation: same proven history under two policies.
    // Strict reverts, lenient succeeds, then approval beyond the lender's own
    // committed cap reverts.
    // ---------------------------------------------------------------------
    function test_Scene4a_PolicyViolation_StrictReverts_LenientSucceeds_BeyondCapReverts() public {
        // Strict lender demands 5 proven repayments; history will have 3.
        uint256 strictPolicyId = _commitPolicy(strictLender, 1000 ether, 5);
        for (uint256 i = 0; i < 3; i++) {
            gate.submitRepaymentProof(strictPolicyId, borrower, _proof(uint64(1000 + i), REPAYMENT_AMOUNT));
        }
        vm.expectRevert(bytes("Not enough proven repayments"));
        gate.requestCredit(
            strictPolicyId,
            borrower,
            IProofGate.AgentDecision({approved: true, claimedAmount: 3 * REPAYMENT_AMOUNT, rationale: "strict try"})
        );

        // Lenient lender demands 3; the same proven history satisfies it
        // (replay guard is per policy, so re-submitting here is legitimate).
        uint256 lenientPolicyId = _commitPolicy(lender, 1000 ether, 3);
        for (uint256 i = 0; i < 3; i++) {
            gate.submitRepaymentProof(lenientPolicyId, borrower, _proof(uint64(1000 + i), REPAYMENT_AMOUNT));
        }
        vm.recordLogs();
        gate.requestCredit(
            lenientPolicyId,
            borrower,
            IProofGate.AgentDecision({approved: true, claimedAmount: 3 * REPAYMENT_AMOUNT, rationale: "lenient ok"})
        );
        (uint256 released,,, uint256 proofsUsed) = _lastCreditReleased();
        assertEq(released, 3 * REPAYMENT_AMOUNT);
        assertEq(proofsUsed, 3);

        // The agent then approves beyond its own committed cap (100 < claim 150).
        uint256 cappedPolicyId = _commitPolicy(lender, 2 * REPAYMENT_AMOUNT, 3);
        for (uint256 i = 0; i < 3; i++) {
            gate.submitRepaymentProof(cappedPolicyId, borrower, _proof(uint64(1000 + i), REPAYMENT_AMOUNT));
        }
        vm.expectRevert(bytes("Agent claim exceeds policy cap"));
        gate.requestCredit(
            cappedPolicyId,
            borrower,
            IProofGate.AgentDecision({approved: true, claimedAmount: 3 * REPAYMENT_AMOUNT, rationale: "beyond cap"})
        );
    }

    // ---------------------------------------------------------------------
    // Scene 1 — Honest: 3 proven repayments, minCompletedRepayments = 3,
    // credit released for the decoded total. Multi-proof aggregation is the
    // DEFAULT path.
    // ---------------------------------------------------------------------
    function test_Scene1_HonestThreeRepayments_ReleasesDecodedTotal() public {
        uint256 policyId = _commitPolicy(lender, 1000 ether, 3);
        uint256 expectedReleased = 3 * REPAYMENT_AMOUNT;

        for (uint256 i = 0; i < 3; i++) {
            gate.submitRepaymentProof(policyId, borrower, _proof(uint64(1000 + i), REPAYMENT_AMOUNT));
        }
        assertEq(gate.provenRepaymentCount(policyId, borrower), 3);

        vm.recordLogs();
        gate.requestCredit(
            policyId,
            borrower,
            IProofGate.AgentDecision({approved: true, claimedAmount: expectedReleased, rationale: "honest rationale"})
        );

        (uint256 released, uint256 claimedOut, bytes32 rationaleHash, uint256 proofsUsed) = _lastCreditReleased();
        assertEq(released, expectedReleased);
        assertEq(claimedOut, expectedReleased);
        assertEq(rationaleHash, keccak256(bytes("honest rationale")), "decision receipt mismatch");
        assertEq(proofsUsed, 3);
        assertEq(creditToken.balanceOf(borrower), expectedReleased, "credit token did not move");
        assertEq(gate.provenRepaymentCount(policyId, borrower), 0, "proofs must be consumed");

        // And the same history cannot mint twice.
        vm.expectRevert(bytes("Not enough proven repayments"));
        gate.requestCredit(
            policyId,
            borrower,
            IProofGate.AgentDecision({approved: true, claimedAmount: expectedReleased, rationale: "double dip"})
        );
    }

    // ---------------------------------------------------------------------
    // Helpers
    // ---------------------------------------------------------------------

    /// @dev A proof carrying a synthetic but well-formed EVM type-0 transaction:
    ///      abi.encode(uint8 txType, bytes[] chunks), receipt in the last chunk,
    ///      one Transfer(payer -> vault, amount) log on the source token.
    function _proof(uint64 blockHeight, uint256 amount) internal view returns (IProofGate.Proof memory) {
        INativeQueryVerifier.MerkleProofEntry[] memory siblings =
            new INativeQueryVerifier.MerkleProofEntry[](1);
        siblings[0] = INativeQueryVerifier.MerkleProofEntry({hash: bytes32(amount), isLeft: true});
        bytes32[] memory continuityRoots = new bytes32[](1);
        continuityRoots[0] = bytes32(uint256(blockHeight));
        return IProofGate.Proof({
            chainKey: SEPOLIA_CHAIN_KEY,
            blockHeight: blockHeight,
            encodedTransaction: _transferTx(sourceToken, borrower, vault, amount),
            merkleRoot: bytes32(uint256(blockHeight)),
            siblings: siblings,
            lowerEndpointDigest: bytes32(uint256(blockHeight)),
            continuityRoots: continuityRoots
        });
    }

    /// @dev Builds a synthetic EvmV1Decoder-decodable payload whose receipt holds
    ///      exactly one ERC-20 Transfer log (status = 1).
    function _transferTx(address token, address payer, address to, uint256 amount)
        internal
        pure
        returns (bytes memory)
    {
        bytes32[] memory topics = new bytes32[](3);
        topics[0] = keccak256("Transfer(address,address,uint256)");
        topics[1] = bytes32(uint256(uint160(payer)));
        topics[2] = bytes32(uint256(uint160(to)));

        EvmV1Decoder.LogEntryTuple[] memory logs = new EvmV1Decoder.LogEntryTuple[](1);
        logs[0] = EvmV1Decoder.LogEntryTuple({address_: token, topics: topics, data: abi.encode(amount)});

        bytes[] memory chunks = new bytes[](3);
        // chunk[0]: common tx fields (nonce, gasLimit, from, toIsNull, to, value, data)
        chunks[0] = abi.encode(uint64(0), uint64(50000), payer, false, token, uint256(0), bytes(""));
        // chunk[1]: type-0 specific (gasPrice, v, r, s)
        chunks[1] = abi.encode(uint128(1 gwei), uint256(27), bytes32(uint256(1)), bytes32(uint256(2)));
        // chunk[2]: receipt (status, gasUsed, logs, logsBloom)
        chunks[2] = abi.encode(uint8(1), uint64(45000), logs, bytes(""));

        return abi.encode(uint8(0), chunks);
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
