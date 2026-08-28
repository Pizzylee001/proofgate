// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import {IPolicyRegistry} from "./interfaces/IPolicyRegistry.sol";

/// @title PolicyRegistry
/// @notice Lender credit policies compiled from plain English by the ProofGate
///         AI agent, committed on-chain BEFORE any borrower applies.
/// @dev Policies are immutable once committed. Versioning = commit a new policy.
///      The AI interprets policy; the contract enforces what it committed.
contract PolicyRegistry is IPolicyRegistry {
    uint256 public policyCount;

    mapping(uint256 policyId => Policy policy) private _policies;
    mapping(uint256 policyId => address lender) private _lenders;

    /// @inheritdoc IPolicyRegistry
    function commitPolicy(Policy calldata policy) external returns (uint256 policyId) {
        require(policy.maxLoanAmount > 0, "Policy must cap loans above zero");
        require(policy.requiredSourceToken != address(0), "Policy must name a repayment token");
        require(policy.vaultAddress != address(0), "Policy must name a repayment vault");

        policyId = ++policyCount;
        _policies[policyId] = policy;
        _lenders[policyId] = msg.sender;

        emit PolicyCommitted(policyId, msg.sender, policy, policy.policyTextHash);
    }

    /// @inheritdoc IPolicyRegistry
    function getPolicy(uint256 policyId) external view returns (Policy memory policy) {
        require(policyId > 0 && policyId <= policyCount, "Unknown policyId");
        return _policies[policyId];
    }

    /// @inheritdoc IPolicyRegistry
    function lenderOf(uint256 policyId) external view returns (address) {
        require(policyId > 0 && policyId <= policyCount, "Unknown policyId");
        return _lenders[policyId];
    }
}
