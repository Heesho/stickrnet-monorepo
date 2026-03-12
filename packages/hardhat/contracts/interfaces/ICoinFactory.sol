// SPDX-License-Identifier: MIT
pragma solidity 0.8.19;

/**
 * @title ICoinFactory
 * @author heesho
 * @notice Interface for the CoinFactory contract.
 */
interface ICoinFactory {
    function deploy(string calldata _tokenName, string calldata _tokenSymbol) external returns (address);
}
