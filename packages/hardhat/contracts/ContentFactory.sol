// SPDX-License-Identifier: MIT
pragma solidity 0.8.19;

import {Content} from "./Content.sol";

/**
 * @title ContentFactory
 * @author heesho
 * @notice Factory contract for deploying new Content NFT collections.
 * @dev Called by Core during the launch process to create new Content contracts.
 */
contract ContentFactory {
    /**
     * @notice Deploy a new Content NFT collection.
     * @param _name Token name
     * @param _symbol Token symbol
     * @param _uri Metadata URI
     * @param _unit Unit token address
     * @param _quote Quote token (WETH) address
     * @param _treasury Treasury (Auction) address
     * @param _team Team address for fee collection
     * @param _core Core contract address
     * @param _rewarderFactory RewarderFactory address
     * @param _minInitPrice Minimum starting auction price
     * @param _isModerated Whether content requires moderator approval
     * @return Address of the newly deployed Content contract
     */
    function deploy(
        string memory _name,
        string memory _symbol,
        string memory _uri,
        address _unit,
        address _quote,
        address _treasury,
        address _team,
        address _core,
        address _rewarderFactory,
        uint256 _minInitPrice,
        bool _isModerated
    ) external returns (address) {
        Content content = new Content(
            _name,
            _symbol,
            _uri,
            _unit,
            _quote,
            _treasury,
            _team,
            _core,
            _rewarderFactory,
            _minInitPrice,
            _isModerated
        );
        content.transferOwnership(msg.sender);
        return address(content);
    }
}
