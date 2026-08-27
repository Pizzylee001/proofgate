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

    /// @notice The AI agent's decision, submitted alongside the proofs.
    struct AgentDecision {
        bool approved;       // the LLM's verdict
        uint256 claimedAmount; // what the LLM says is justified
        string rationale;    // the LLM's reasoning text
    }

    event CreditReleased(
        uint256 indexed policyId,
        address indexed borrower,
        uint256 releasedAmount, // decoded, proven
        uint256 claimedAmount,  // what the AI said
        bytes32 rationaleHash,  // keccak256(rationale) — the decision receipt
        uint256 proofsUsed
    );

    /// @notice Requests a credit release for `borrower` under `policyId`.
    /// @dev Reverts unless every proof verifies, the decoded repayments satisfy the
    ///      policy, and the agent decision is approved within the policy cap.
    ///      Releases the DECODED total of proven repayments, capped at
    ///      policy.maxLoanAmount — never the agent's claimed amount.
    function requestCredit(
        uint256 policyId,
        address borrower,
        Proof[] calldata proofs,
        AgentDecision calldata agentDecision
    ) external;

    /// @notice Returns the credit token released by the gate.
    function creditToken() external view returns (address);

    /// @notice Returns the policy registry the gate reads from.
    function policyRegistry() external view returns (address);
}
