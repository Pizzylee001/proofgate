// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

/// @notice Native Query Verifier precompile on Creditcoin CC3 testnet.
/// @dev Verifies Attestcoin Protocol cross-chain transaction proofs synchronously.
interface INativeQueryVerifier {
    struct MerkleProofEntry {
        bytes32 hash;
        bool isLeft;
    }

    struct MerkleProof {
        bytes32 root;
        MerkleProofEntry[] siblings;
    }

    struct ContinuityProof {
        bytes32 lowerEndpointDigest;
        bytes32[] roots;
    }

    /// @notice Verifies a cross-chain query proof and emits an event on success.
    /// @return true if the proof is valid for (chainKey, height, encodedTransaction).
    function verifyAndEmit(
        uint64 chainKey,
        uint64 height,
        bytes calldata encodedTransaction,
        MerkleProof calldata merkleProof,
        ContinuityProof calldata continuityProof
    ) external returns (bool);

    /// @notice Computes the transaction index implied by a merkle proof.
    function calculateTxIndex(MerkleProof calldata merkleProof) external view returns (uint64);
}
