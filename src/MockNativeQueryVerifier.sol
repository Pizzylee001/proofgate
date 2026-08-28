// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import {INativeQueryVerifier} from "./interfaces/INativeQueryVerifier.sol";

/// @title MockNativeQueryVerifier (TEST ONLY)
/// @notice Stand-in for the Attestcoin Protocol Native Query Verifier precompile
///         (0x0000000000000000000000000000000000000FD2), which does not exist on
///         local test chains. Deployments on Creditcoin use the REAL precompile.
/// @dev Default behaviour mirrors the precompile's success path and stores the
///      last submitted payload so tests can assert exactly what was passed.
///      `setVerificationResult(false)` simulates a proof the precompile would
///      reject (fabrication scene).
contract MockNativeQueryVerifier is INativeQueryVerifier {
    bool private _shouldVerify = true;

    // Last submitted payload, for test assertions.
    uint64 public lastChainKey;
    uint64 public lastHeight;
    bytes public lastEncodedTransaction;
    bytes32 public lastMerkleRoot;
    bytes32 public lastLowerEndpointDigest;
    uint256 public lastSiblingCount;
    uint256 public lastContinuityRootCount;
    uint256 public verifyCallCount;

    function setVerificationResult(bool ok) external {
        _shouldVerify = ok;
    }

    function verifyAndEmit(
        uint64 chainKey,
        uint64 height,
        bytes calldata encodedTransaction,
        MerkleProof calldata merkleProof,
        ContinuityProof calldata continuityProof
    ) external returns (bool) {
        lastChainKey = chainKey;
        lastHeight = height;
        lastEncodedTransaction = encodedTransaction;
        lastMerkleRoot = merkleProof.root;
        lastSiblingCount = merkleProof.siblings.length;
        lastLowerEndpointDigest = continuityProof.lowerEndpointDigest;
        lastContinuityRootCount = continuityProof.roots.length;
        verifyCallCount += 1;
        return _shouldVerify;
    }

    /// @dev Mirrors the precompile signature; returns a deterministic index
    ///      derived from the proof so tests can control queryId uniqueness
    ///      by varying the number of siblings.
    function calculateTxIndex(MerkleProof calldata merkleProof) external pure returns (uint64) {
        return uint64(merkleProof.siblings.length);
    }
}
