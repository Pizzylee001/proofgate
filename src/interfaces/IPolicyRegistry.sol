// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

/// @notice Registry of lender credit policies, committed on-chain before any borrower applies.
interface IPolicyRegistry {
    /// @notice Structured policy compiled from the lender's English rules by the AI agent.
    struct Policy {
        uint256 maxLoanAmount;          // hard cap per credit release
        uint256 minCompletedRepayments; // count of PROVEN repayments required
        uint64 requiredSourceChainId;   // Sepolia = 11155111
        uint64 requiredSourceChainKey;  // Sepolia chainKey on CC3 testnet = 1
        address requiredSourceToken;    // ERC-20 the repayment must be paid in
        address vaultAddress;           // repayment recipient on the source chain
        bytes32 policyTextHash;         // keccak256 of the English original
    }

    event PolicyCommitted(uint256 indexed policyId, address indexed lender, Policy policy, bytes32 policyTextHash);

    /// @notice Commits a policy. Immutable once committed; versioning = new policyId.
    /// @return policyId The id of the newly committed policy.
    function commitPolicy(Policy calldata policy) external returns (uint256 policyId);

    /// @notice Returns the committed policy for a policyId.
    function getPolicy(uint256 policyId) external view returns (Policy memory);

    /// @notice Returns the lender that committed a policy.
    function lenderOf(uint256 policyId) external view returns (address);

    /// @notice Returns the number of committed policies.
    function policyCount() external view returns (uint256);
}
