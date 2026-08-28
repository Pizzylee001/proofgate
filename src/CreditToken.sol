// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

/// @title CreditToken
/// @notice Minimal hand-written ERC-20 representing credit released by ProofGate.
/// @dev Minting is restricted to the gate itself: the only way new credit can
///      exist is a requestCredit call that passed Attestcoin proof verification
///      and policy enforcement. Written by hand (no external dependency).
contract CreditToken {
    string public constant name = "ProofGate Credit";
    string public constant symbol = "PGC";
    uint8 public constant decimals = 18;

    uint256 public totalSupply;
    mapping(address account => uint256) public balanceOf;
    mapping(address owner => mapping(address spender => uint256)) public allowance;

    /// @notice The only address allowed to mint: the ProofGate contract.
    address public gate;

    event Transfer(address indexed from, address indexed to, uint256 value);
    event Approval(address indexed owner, address indexed spender, uint256 value);
    event GateSet(address indexed gate);

    modifier onlyGate() {
        require(msg.sender == gate, "Only ProofGate may mint");
        _;
    }

    /// @notice Sets the gate once, at deployment wiring time.
    function setGate(address gate_) external {
        require(gate == address(0), "Gate already set");
        require(gate_ != address(0), "Gate cannot be zero");
        gate = gate_;
        emit GateSet(gate_);
    }

    /// @notice Mints newly released credit. Callable only by the gate.
    function mint(address to, uint256 amount) external onlyGate {
        require(to != address(0), "Mint to zero address");
        totalSupply += amount;
        balanceOf[to] += amount;
        emit Transfer(address(0), to, amount);
    }

    function transfer(address to, uint256 amount) external returns (bool) {
        _transfer(msg.sender, to, amount);
        return true;
    }

    function approve(address spender, uint256 amount) external returns (bool) {
        allowance[msg.sender][spender] = amount;
        emit Approval(msg.sender, spender, amount);
        return true;
    }

    function transferFrom(address from, address to, uint256 amount) external returns (bool) {
        uint256 allowed = allowance[from][msg.sender];
        if (allowed != type(uint256).max) {
            require(allowed >= amount, "Allowance exceeded");
            allowance[from][msg.sender] = allowed - amount;
        }
        _transfer(from, to, amount);
        return true;
    }

    function _transfer(address from, address to, uint256 amount) internal {
        require(to != address(0), "Transfer to zero address");
        uint256 balance = balanceOf[from];
        require(balance >= amount, "Insufficient balance");
        unchecked {
            balanceOf[from] = balance - amount;
            balanceOf[to] += amount;
        }
        emit Transfer(from, to, amount);
    }
}
