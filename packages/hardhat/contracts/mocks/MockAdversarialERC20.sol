// SPDX-License-Identifier: MIT
pragma solidity 0.8.19;

import {ERC20} from "@openzeppelin/contracts/token/ERC20/ERC20.sol";

contract MockFalseReturnERC20 is ERC20 {
    constructor() ERC20("False Return Token", "FALSE") {}

    function mint(address to, uint256 amount) external {
        _mint(to, amount);
    }

    function transfer(address, uint256) public pure override returns (bool) {
        return false;
    }

    function transferFrom(address, address, uint256) public pure override returns (bool) {
        return false;
    }
}

contract MockRevertingERC20 is ERC20 {
    error MockRevertingERC20__TransferBlocked();

    constructor() ERC20("Reverting Token", "REVERT") {}

    function mint(address to, uint256 amount) external {
        _mint(to, amount);
    }

    function transfer(address, uint256) public pure override returns (bool) {
        revert MockRevertingERC20__TransferBlocked();
    }

    function transferFrom(address, address, uint256) public pure override returns (bool) {
        revert MockRevertingERC20__TransferBlocked();
    }
}

contract MockBlacklistERC20 is ERC20 {
    error MockBlacklistERC20__Blacklisted();

    mapping(address => bool) public blacklisted;

    constructor() ERC20("Blacklist USDC", "bUSDC") {}

    function decimals() public pure override returns (uint8) {
        return 6;
    }

    function mint(address to, uint256 amount) external {
        _mint(to, amount);
    }

    function setBlacklisted(address account, bool blocked) external {
        blacklisted[account] = blocked;
    }

    function _beforeTokenTransfer(address from, address to, uint256 amount) internal override {
        if (blacklisted[from] || blacklisted[to]) revert MockBlacklistERC20__Blacklisted();
        super._beforeTokenTransfer(from, to, amount);
    }
}

contract MockRebasingERC20 is ERC20 {
    constructor() ERC20("Rebasing Token", "REBASE") {}

    function mint(address to, uint256 amount) external {
        _mint(to, amount);
    }

    /// @dev Test-only negative rebase against one holder. Production does not support rebasing assets.
    function rebaseDown(address account, uint256 amount) external {
        _burn(account, amount);
    }
}
