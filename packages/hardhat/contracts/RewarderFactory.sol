// SPDX-License-Identifier: MIT
pragma solidity 0.8.19;

import {Rewarder} from "./Rewarder.sol";

/**
 * @title RewarderFactory
 * @author heesho
 * @notice Factory contract for deploying new Rewarder instances.
 * @dev Called by ContentFactory during the content creation process.
 */
contract RewarderFactory {
    /**
     * @notice Deploy a new Rewarder contract.
     * @param _content Content contract address that will control the Rewarder
     * @return Address of the newly deployed Rewarder
     */
    function deploy(address _content) external returns (address) {
        return address(new Rewarder(_content));
    }
}
