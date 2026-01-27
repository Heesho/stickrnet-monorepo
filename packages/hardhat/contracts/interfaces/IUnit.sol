// SPDX-License-Identifier: MIT
pragma solidity 0.8.19;

/**
 * @title IUnit
 * @author heesho
 * @notice Interface for the Unit token contract.
 */
interface IUnit {
    function mint(address to, uint256 amount) external;
    function setMinter(address _minter) external;
    function minter() external view returns (address);
}
