// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import {INativeQueryVerifier} from "./interfaces/INativeQueryVerifier.sol";
import {IPolicyRegistry} from "./interfaces/IPolicyRegistry.sol";
import {IProofGate} from "./interfaces/IProofGate.sol";
import {CreditToken} from "./CreditToken.sol";
import {EvmV1Decoder} from "@gluwa/usc-contracts/common/EvmV1Decoder.sol";

/// @title ProofGate
/// @notice The gate between an AI agent's lending decision and on-chain credit.
/// @dev A release requires BOTH: (a) Attestcoin Protocol proofs that the claimed
///      repayments actually happened on the source chain, verified synchronously
///      by the Native Query Verifier precompile, and (b) compliance with the
///      lender's policy committed to PolicyRegistry BEFORE the borrower applied.
///      The AI interprets the policy; this contract enforces it. The agent has
///      no privileged role — anyone may submit, and the released amount is the
///      decoded, proven total, never the agent's claimed amount.
contract ProofGate is IProofGate {
    /// @dev keccak256("Transfer(address,address,uint256)") — verified with cast and ethers.
    ///      (An earlier draft carried the common misquote ending ...c68c70b9.)
    bytes32 public constant TRANSFER_EVENT_SIGNATURE =
        0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef;

    IPolicyRegistry internal immutable _policyRegistry;
    CreditToken internal immutable _creditToken;
    INativeQueryVerifier internal immutable _verifier;

    /// @dev Replay guard, per policy: two lenders may independently consume the
    ///      same proven repayment event.
    mapping(uint256 policyId => mapping(bytes32 queryId => bool used)) public processedQueries;

    constructor(address policyRegistry_, address creditToken_, address verifier_) {
        require(policyRegistry_ != address(0), "Registry cannot be zero");
        require(creditToken_ != address(0), "Credit token cannot be zero");
        require(verifier_ != address(0), "Verifier cannot be zero");
        _policyRegistry = IPolicyRegistry(policyRegistry_);
        _creditToken = CreditToken(creditToken_);
        _verifier = INativeQueryVerifier(verifier_);
    }

    /// @inheritdoc IProofGate
    function policyRegistry() external view returns (address) {
        return address(_policyRegistry);
    }

    /// @inheritdoc IProofGate
    function creditToken() external view returns (address) {
        return address(_creditToken);
    }

    /// @inheritdoc IProofGate
    function requestCredit(
        uint256 policyId,
        address borrower,
        Proof[] calldata proofs,
        AgentDecision calldata agentDecision
    ) external {
        // 1. Load the committed policy (registry reverts on unknown policyId).
        IPolicyRegistry.Policy memory policy = _policyRegistry.getPolicy(policyId);

        uint256 decodedTotal;
        uint256 proofCount = proofs.length;

        for (uint256 i; i < proofCount; ++i) {
            decodedTotal += _processProof(policy, policyId, borrower, proofs[i]);
        }

        // 6. Enough proven history?
        require(proofCount >= policy.minCompletedRepayments, "Not enough proven repayments");

        // 7. The agent's decision must be positive and within its own policy cap.
        require(agentDecision.approved, "Agent declined the application");
        require(agentDecision.claimedAmount <= policy.maxLoanAmount, "Agent claim exceeds policy cap");

        // 8. Release the DECODED, proven total, capped by policy — never the claim.
        uint256 releasedAmount = decodedTotal > policy.maxLoanAmount ? policy.maxLoanAmount : decodedTotal;
        _creditToken.mint(borrower, releasedAmount);

        // 9. Decision receipt: the audit trail of the AI vs the proof.
        emit CreditReleased(
            policyId,
            borrower,
            releasedAmount,
            agentDecision.claimedAmount,
            keccak256(abi.encodePacked(agentDecision.rationale)),
            proofCount
        );
    }

    /// @notice Steps 2–5 for a single proof: verify, replay-guard, decode, enforce.
    /// @dev Factored out of requestCredit to stay under the stack depth limit.
    /// @return amount The decoded, proven repayment amount for this proof.
    function _processProof(
        IPolicyRegistry.Policy memory policy,
        uint256 policyId,
        address borrower,
        Proof calldata p
    ) internal returns (uint256 amount) {
        // 2. Verify the proof against the Attestcoin Protocol precompile.
        INativeQueryVerifier.MerkleProof memory merkleProof =
            INativeQueryVerifier.MerkleProof({root: p.merkleRoot, siblings: p.siblings});
        INativeQueryVerifier.ContinuityProof memory continuityProof =
            INativeQueryVerifier.ContinuityProof({lowerEndpointDigest: p.lowerEndpointDigest, roots: p.continuityRoots});

        bool verified = _verifier.verifyAndEmit(
            p.chainKey, p.blockHeight, p.encodedTransaction, merkleProof, continuityProof
        );
        require(verified, "Proof verification failed");

        // 3. Replay guard, per (policyId, queryId).
        uint64 txIndex = _verifier.calculateTxIndex(merkleProof);
        bytes32 queryId = keccak256(abi.encodePacked(p.chainKey, p.blockHeight, txIndex));
        require(!processedQueries[policyId][queryId], "Replay: query already used for this policy");
        processedQueries[policyId][queryId] = true;

        // 4. Decode the proven repayment from the receipt's Transfer event.
        address payer;
        address token;
        address to;
        (payer, token, amount, to) = _decodeRepayment(p.encodedTransaction);

        // 5. The proven repayment must match the policy and the applicant.
        require(token == policy.requiredSourceToken, "Wrong repayment token");
        require(to == policy.vaultAddress, "Repayment not to policy vault");
        require(p.chainKey == policy.requiredSourceChainKey, "Wrong source chain");
        require(payer == borrower, "Repayment not from borrower");
    }

    /// @notice Decodes the repayment out of a proven transaction's receipt.
    /// @dev Isolated on purpose: this is the one place proof bytes become
    ///      economic facts (who paid, which token, how much, to whom).
    function _decodeRepayment(bytes memory encodedTransaction)
        internal
        pure
        returns (address payer, address token, uint256 amount, address to)
    {
        EvmV1Decoder.ReceiptFields memory receipt = EvmV1Decoder.decodeReceiptFields(encodedTransaction);
        require(receipt.receiptStatus == 1, "Repayment transaction failed on source chain");

        EvmV1Decoder.LogEntry[] memory transfers =
            EvmV1Decoder.getLogsByEventSignature(receipt, TRANSFER_EVENT_SIGNATURE);
        require(transfers.length > 0, "No Transfer event in receipt");

        EvmV1Decoder.LogEntry memory log = transfers[0];
        require(log.topics.length >= 3, "Malformed Transfer event");
        payer = address(uint160(uint256(log.topics[1])));
        to = address(uint160(uint256(log.topics[2])));
        amount = abi.decode(log.data, (uint256));
        token = log.address_;
    }
}
