// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

/// @title ProofGateTestToken (PGUSD)
/// @notice Test ERC-20 on the SOURCE chain (Sepolia). Borrowers repay in PGUSD;
///         the policy pins this contract as requiredSourceToken so fake tokens
///         cannot satisfy it. Public mint: this is a testnet faucet token only.
contract ProofGateTestToken {
    string public constant name = "ProofGate USD (test)";
    string public constant symbol = "PGUSD";
    uint8 public constant decimals = 18;

    uint256 public totalSupply;
    mapping(address account => uint256) public balanceOf;
    mapping(address owner => mapping(address spender => uint256)) public allowance;

    event Transfer(address indexed from, address indexed to, uint256 value);
    event Approval(address indexed owner, address indexed spender, uint256 value);

    /// @notice Open mint — testnet fixture token, no value.
    function mint(address to, uint256 amount) external {
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
