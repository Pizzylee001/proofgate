// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import {INativeQueryVerifier} from "./INativeQueryVerifier.sol";

/// @notice The gate: credit release requires verified Attestcoin proofs AND policy compliance.
interface IProofGate {
    /// @notice A cross-chain transaction proof, mirroring the precompile shapes.
    struct Proof {
        uint64 chainKey;
        uint64 blockHeight;
        bytes encodedTransaction;
        bytes32 merkleRoot;
        INativeQueryVerifier.MerkleProofEntry[] siblings;
        bytes32 lowerEndpointDigest;
        bytes32[] continuityRoots;
    }

    /// @notice The AI agent's decision, submitted after proofs are on record.
    struct AgentDecision {
        bool approved;       // the LLM's verdict
        uint256 claimedAmount; // what the LLM says is justified
        string rationale;    // the LLM's reasoning text
    }

    /// @notice A repayment whose proof verified and matched a policy.
    struct ProvenRepayment {
        uint256 amount;   // decoded from the proven receipt's Transfer event
        bytes32 queryId;  // replay-guard id of the proof that established it
    }

    event RepaymentProven(
        uint256 indexed policyId,
        address indexed borrower,
        uint256 amount,
        bytes32 queryId
    );

    event CreditReleased(
        uint256 indexed policyId,
        address indexed borrower,
        uint256 releasedAmount, // decoded, proven
        uint256 claimedAmount,  // what the AI said
        bytes32 rationaleHash,  // keccak256(rationale) — the decision receipt
        uint256 proofsUsed
    );

    /// @notice Submits ONE repayment proof for a borrower under a policy.
    /// @dev Verifies the proof with the Attestcoin precompile, replay-guards it
    ///      per policy, decodes the repayment, enforces token/vault/chain/payer,
    ///      and records it. Reverts on any failure.
    function submitRepaymentProof(uint256 policyId, address borrower, Proof calldata proof) external;

    /// @notice Requests a credit release for `borrower` under `policyId`.
    /// @dev Requires enough previously proven repayments, an approved decision
    ///      within the policy cap, and releases the DECODED, proven total capped
    ///      at policy.maxLoanAmount — never the agent's claimed amount.
    ///      Proven repayments are CONSUMED by a release.
    function requestCredit(uint256 policyId, address borrower, AgentDecision calldata agentDecision) external;

    /// @notice Returns how many repayments are proven for (policyId, borrower).
    function provenRepaymentCount(uint256 policyId, address borrower) external view returns (uint256);

    /// @notice Returns one recorded proven repayment.
    function provenRepayment(uint256 policyId, address borrower, uint256 index)
        external
        view
        returns (uint256 amount, bytes32 queryId);

    /// @notice Returns the credit token released by the gate.
    function creditToken() external view returns (address);

    /// @notice Returns the policy registry the gate reads from.
    function policyRegistry() external view returns (address);
}
