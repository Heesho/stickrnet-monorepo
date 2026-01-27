// SPDX-License-Identifier: MIT
pragma solidity 0.8.19;

/**
 * @title IContent
 * @author heesho
 * @notice Interface for the Content NFT contract.
 */
interface IContent {
    function create(address to, string memory tokenUri) external returns (uint256 tokenId);
    function collect(
        address to,
        uint256 tokenId,
        uint256 epochId,
        uint256 deadline,
        uint256 maxPrice
    ) external returns (uint256 price);
    function claim(address account) external;
    function setUri(string memory _uri) external;
    function setTreasury(address _treasury) external;
    function setTeam(address _team) external;
    function setIsModerated(bool _isModerated) external;
    function setModerators(address[] calldata accounts, bool _accountToIsModerator) external;
    function approveContents(uint256[] calldata tokenIds) external;
    function addReward(address rewardToken) external;
    function transferOwnership(address newOwner) external;

    function rewarder() external view returns (address);
    function unit() external view returns (address);
    function quote() external view returns (address);
    function core() external view returns (address);
    function treasury() external view returns (address);
    function team() external view returns (address);
    function minInitPrice() external view returns (uint256);
    function uri() external view returns (string memory);
    function isModerated() external view returns (bool);
    function nextTokenId() external view returns (uint256);
    function idToStake(uint256 tokenId) external view returns (uint256);
    function idToCreator(uint256 tokenId) external view returns (address);
    function idToApproved(uint256 tokenId) external view returns (bool);
    function idToEpochId(uint256 tokenId) external view returns (uint256);
    function idToInitPrice(uint256 tokenId) external view returns (uint256);
    function idToStartTime(uint256 tokenId) external view returns (uint256);
    function getPrice(uint256 tokenId) external view returns (uint256);
    function ownerOf(uint256 tokenId) external view returns (address);
    function tokenURI(uint256 tokenId) external view returns (string memory);
    function totalSupply() external view returns (uint256);
    function balanceOf(address owner) external view returns (uint256);
    function accountToIsModerator(address account) external view returns (bool);
    function accountToClaimable(address account) external view returns (uint256);
    function owner() external view returns (address);
}
