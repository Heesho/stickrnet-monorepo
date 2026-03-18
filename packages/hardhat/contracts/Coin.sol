// SPDX-License-Identifier: MIT
pragma solidity 0.8.19;

import {ERC20} from "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import {ERC20Permit} from "@openzeppelin/contracts/token/ERC20/extensions/ERC20Permit.sol";
import {ERC20Votes} from "@openzeppelin/contracts/token/ERC20/extensions/ERC20Votes.sol";

/**
 * @title Coin
 * @author heesho
 * @notice ERC20 token with permit and voting capabilities, minted by a Minter contract.
 * @dev Only the minter address can mint new tokens. Includes governance voting functionality.
 *      The minter address can be transferred once by calling setMinter(). Once transferred to a
 *      Minter contract (which has no setMinter function), the minter address becomes effectively immutable.
 */
contract Coin is ERC20, ERC20Permit, ERC20Votes {
    address public minter;

    error Coin__NotMinter();
    error Coin__InvalidMinter();

    event Coin__Minted(address account, uint256 amount);
    event Coin__Burned(address account, uint256 amount);
    event Coin__MinterSet(address indexed minter);

    /**
     * @notice Deploy a new Coin token.
     * @dev The deployer (msg.sender) becomes the initial minter.
     * @param _name Token name
     * @param _symbol Token symbol
     */
    constructor(string memory _name, string memory _symbol) ERC20(_name, _symbol) ERC20Permit(_name) {
        minter = msg.sender;
    }

    /**
     * @notice Transfer minting rights to a new minter address.
     * @dev Only callable by the current minter. Once set to a Minter contract (which has no
     *      setMinter function), this becomes permanently locked.
     * @param _minter New minter address
     */
    function setMinter(address _minter) external {
        if (msg.sender != minter) revert Coin__NotMinter();
        if (_minter == address(0)) revert Coin__InvalidMinter();
        minter = _minter;
        emit Coin__MinterSet(_minter);
    }

    /**
     * @notice Mint new tokens to an account.
     * @dev Only callable by the minter address.
     * @param account Recipient address
     * @param amount Amount to mint
     */
    function mint(address account, uint256 amount) external {
        if (msg.sender != minter) revert Coin__NotMinter();
        _mint(account, amount);
        emit Coin__Minted(account, amount);
    }

    /**
     * @notice Burn tokens from the caller's balance.
     * @param amount Amount to burn
     */
    function burn(uint256 amount) external {
        _burn(msg.sender, amount);
        emit Coin__Burned(msg.sender, amount);
    }

    // Required overrides for ERC20Votes compatibility
    function _afterTokenTransfer(address from, address to, uint256 amount) internal override(ERC20, ERC20Votes) {
        super._afterTokenTransfer(from, to, amount);
    }

    function _mint(address to, uint256 amount) internal override(ERC20, ERC20Votes) {
        super._mint(to, amount);
    }

    function _burn(address account, uint256 amount) internal override(ERC20, ERC20Votes) {
        super._burn(account, amount);
    }
}
