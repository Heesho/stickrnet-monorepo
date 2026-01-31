// SPDX-License-Identifier: MIT
pragma solidity 0.8.19;

/**
 * @title ICore
 * @author heesho
 * @notice Interface for the Core launchpad contract.
 */
interface ICore {
    struct LaunchParams {
        address launcher;
        string tokenName;
        string tokenSymbol;
        string uri;
        uint256 quoteAmount;
        uint256 unitAmount;
        uint256 initialUps;
        uint256 tailUps;
        uint256 halvingPeriod;
        uint256 contentMinInitPrice;
        bool contentIsModerated;
        uint256 auctionInitPrice;
        uint256 auctionEpochPeriod;
        uint256 auctionPriceMultiplier;
        uint256 auctionMinInitPrice;
    }

    function launch(LaunchParams calldata params)
        external
        returns (
            address unit,
            address content,
            address minter,
            address rewarder,
            address auction,
            address lpToken
        );
    function protocolFeeAddress() external view returns (address);
    function quote() external view returns (address);
    function uniswapV2Factory() external view returns (address);
    function uniswapV2Router() external view returns (address);
    function minQuoteForLaunch() external view returns (uint256);
    function isDeployedContent(address content) external view returns (bool);
    function contentToIndex(address content) external view returns (uint256);
    function contentToLauncher(address content) external view returns (address);
    function contentToUnit(address content) external view returns (address);
    function contentToAuction(address content) external view returns (address);
    function contentToMinter(address content) external view returns (address);
    function contentToRewarder(address content) external view returns (address);
    function contentToLP(address content) external view returns (address);
    function deployedContentsLength() external view returns (uint256);
    function deployedContents(uint256 index) external view returns (address);
}
