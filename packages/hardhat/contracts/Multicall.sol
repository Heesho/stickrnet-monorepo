// SPDX-License-Identifier: MIT
pragma solidity 0.8.19;

import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import {IContent} from "./interfaces/IContent.sol";
import {IMinter} from "./interfaces/IMinter.sol";
import {IRewarder} from "./interfaces/IRewarder.sol";
import {IAuction} from "./interfaces/IAuction.sol";
import {ICore} from "./interfaces/ICore.sol";
import {IUnit} from "./interfaces/IUnit.sol";

/**
 * @title Multicall
 * @author heesho
 * @notice Helper contract for batched operations and aggregated view functions.
 * @dev Provides convenience functions for content collection and comprehensive state queries.
 */
contract Multicall {
    using SafeERC20 for IERC20;

    error Multicall__ZeroAddress();
    error Multicall__InvalidContent();

    /*----------  IMMUTABLES  -------------------------------------------*/

    address public immutable core;
    address public immutable quote;

    /*----------  STRUCTS  ----------------------------------------------*/

    /**
     * @notice Aggregated state for a Unit ecosystem.
     */
    struct UnitState {
        uint256 index;
        address unit;
        address quote;
        address launcher;
        address minter;
        address rewarder;
        address auction;
        address lp;
        string uri;
        bool isModerated;
        uint256 totalSupply;
        uint256 marketCapInQuote;
        uint256 liquidityInQuote;
        uint256 priceInQuote;
        uint256 contentRewardForDuration;
        uint256 accountQuoteBalance;
        uint256 accountUnitBalance;
        uint256 accountContentOwned;
        uint256 accountContentStaked;
        uint256 accountUnitEarned;
        uint256 accountClaimable;
        bool accountIsModerator;
    }

    /**
     * @notice State for a single content token.
     */
    struct ContentState {
        uint256 tokenId;
        uint256 epochId;
        uint256 startTime;
        uint256 initPrice;
        uint256 stake;
        uint256 price;
        uint256 rewardForDuration;
        address creator;
        address owner;
        string uri;
        bool isApproved;
    }

    /**
     * @notice Aggregated state for an Auction contract.
     */
    struct AuctionState {
        uint256 epochId;
        uint256 initPrice;
        uint256 startTime;
        address paymentToken;
        uint256 price;
        uint256 paymentTokenPrice;
        uint256 quoteAccumulated;
        uint256 accountQuoteBalance;
        uint256 accountPaymentTokenBalance;
    }

    /*----------  CONSTRUCTOR  ------------------------------------------*/

    /**
     * @notice Deploy the Multicall helper contract.
     * @param _core Core contract address
     * @param _quote Quote token address (e.g. USDC)
     */
    constructor(address _core, address _quote) {
        if (_core == address(0) || _quote == address(0)) revert Multicall__ZeroAddress();
        core = _core;
        quote = _quote;
    }

    /*----------  EXTERNAL FUNCTIONS  -----------------------------------*/

    /**
     * @notice Collect content using quote token (e.g. USDC).
     * @dev Transfers quote from caller, approves content, and calls collect(). Refunds excess.
     *      Automatically claims for the previous owner (same UX as direct transfer).
     * @param content Content contract address
     * @param tokenId Token ID to collect
     * @param epochId Expected epoch ID
     * @param deadline Transaction deadline
     * @param maxPrice Maximum price willing to pay
     */
    function collect(
        address content,
        uint256 tokenId,
        uint256 epochId,
        uint256 deadline,
        uint256 maxPrice
    ) external {
        if (!ICore(core).isDeployedContent(content)) revert Multicall__InvalidContent();

        // Get previous owner before collect
        address prevOwner = IContent(content).ownerOf(tokenId);

        IERC20(quote).safeTransferFrom(msg.sender, address(this), maxPrice);
        IERC20(quote).safeApprove(content, 0);
        IERC20(quote).safeApprove(content, maxPrice);
        IContent(content).collect(msg.sender, tokenId, epochId, deadline, maxPrice);

        // Claim for previous owner (try/catch in case they're blacklisted)
        try IContent(content).claim(prevOwner) {} catch {}

        // Claim for creator (try/catch in case they're blacklisted)
        address creator = IContent(content).idToCreator(tokenId);
        try IContent(content).claim(creator) {} catch {}

        // Refund unused quote
        uint256 quoteBalance = IERC20(quote).balanceOf(address(this));
        if (quoteBalance > 0) {
            IERC20(quote).safeTransfer(msg.sender, quoteBalance);
        }
    }

    /**
     * @notice Buy from an auction using LP tokens.
     * @dev Transfers LP tokens from caller, approves auction, and executes buy.
     * @param content Content contract address (used to look up auction)
     * @param epochId Expected epoch ID
     * @param deadline Transaction deadline
     * @param maxPaymentTokenAmount Maximum LP tokens willing to pay
     */
    function buy(address content, uint256 epochId, uint256 deadline, uint256 maxPaymentTokenAmount) external {
        address auction = ICore(core).contentToAuction(content);
        address paymentToken = IAuction(auction).paymentToken();
        uint256 price = IAuction(auction).getPrice();
        address[] memory assets = new address[](1);
        assets[0] = quote;

        IERC20(paymentToken).safeTransferFrom(msg.sender, address(this), price);
        IERC20(paymentToken).safeApprove(auction, 0);
        IERC20(paymentToken).safeApprove(auction, price);
        IAuction(auction).buy(assets, msg.sender, epochId, deadline, maxPaymentTokenAmount);
    }

    /**
     * @notice Launch a new Stickr Channel via Core.
     * @dev Transfers quote from caller, approves Core, and calls launch with caller as launcher.
     * @param params Launch parameters (launcher field is overwritten with msg.sender)
     */
    function launch(ICore.LaunchParams calldata params)
        external
        returns (
            address unit,
            address content,
            address minter,
            address rewarder,
            address auction,
            address lpToken
        )
    {
        // Transfer quote from user
        IERC20(quote).safeTransferFrom(msg.sender, address(this), params.quoteAmount);
        IERC20(quote).safeApprove(core, 0);
        IERC20(quote).safeApprove(core, params.quoteAmount);

        // Build params with msg.sender as launcher
        ICore.LaunchParams memory launchParams = ICore.LaunchParams({
            launcher: msg.sender,
            tokenName: params.tokenName,
            tokenSymbol: params.tokenSymbol,
            uri: params.uri,
            quoteAmount: params.quoteAmount,
            unitAmount: params.unitAmount,
            initialUps: params.initialUps,
            tailUps: params.tailUps,
            halvingPeriod: params.halvingPeriod,
            contentMinInitPrice: params.contentMinInitPrice,
            contentIsModerated: params.contentIsModerated,
            auctionInitPrice: params.auctionInitPrice,
            auctionEpochPeriod: params.auctionEpochPeriod,
            auctionPriceMultiplier: params.auctionPriceMultiplier,
            auctionMinInitPrice: params.auctionMinInitPrice
        });

        return ICore(core).launch(launchParams);
    }

    /**
     * @notice Update the minter period (trigger weekly emission).
     * @param content Content contract address
     */
    function updateMinterPeriod(address content) external {
        address minter = IUnit(IContent(content).unit()).minter();
        IMinter(minter).updatePeriod();
    }

    /**
     * @notice Claim all rewards (Unit from rewarder + fees from content).
     * @param content Content contract address
     */
    function claimRewards(address content) external {
        address rewarder = IContent(content).rewarder();
        IRewarder(rewarder).getReward(msg.sender);
        try IContent(content).claim(msg.sender) {} catch {}
    }

    /*----------  VIEW FUNCTIONS  ---------------------------------------*/

    /**
     * @notice Get aggregated state for a Unit ecosystem.
     * @param content Content contract address
     * @param account User address (or address(0) to skip balance queries)
     * @return state Aggregated unit state
     */
    function getUnitState(address content, address account) external view returns (UnitState memory state) {
        // Core registry data
        state.index = ICore(core).contentToIndex(content);
        state.unit = IContent(content).unit();
        state.quote = IContent(content).quote();
        state.launcher = IContent(content).owner();
        state.minter = IUnit(state.unit).minter();
        state.rewarder = IContent(content).rewarder();
        state.auction = ICore(core).contentToAuction(content);
        state.lp = ICore(core).contentToLP(content);

        // Content state
        state.uri = IContent(content).uri();
        state.isModerated = IContent(content).isModerated();
        state.totalSupply = IContent(content).totalSupply();

        // Calculate Unit price, market cap, and liquidity in quote from LP reserves
        if (state.lp != address(0)) {
            uint256 quoteInLP = IERC20(quote).balanceOf(state.lp);
            uint256 unitInLP = IERC20(state.unit).balanceOf(state.lp);
            state.priceInQuote = unitInLP == 0 ? 0 : quoteInLP * 1e18 / unitInLP;
            state.liquidityInQuote = quoteInLP * 2;

            // Market cap = total unit supply * unit price in quote
            uint256 unitTotalSupply = IERC20(state.unit).totalSupply();
            state.marketCapInQuote = unitTotalSupply * state.priceInQuote / 1e18;
        }

        // Content reward for duration (weekly Unit emissions to content stakers)
        state.contentRewardForDuration = IRewarder(state.rewarder).getRewardForDuration(state.unit);

        // User balances and earnings
        if (account != address(0)) {
            state.accountQuoteBalance = IERC20(state.quote).balanceOf(account);
            state.accountUnitBalance = IERC20(state.unit).balanceOf(account);
            state.accountContentOwned = IContent(content).balanceOf(account);
            state.accountContentStaked = IRewarder(state.rewarder).accountToBalance(account);
            state.accountUnitEarned = IRewarder(state.rewarder).earned(account, state.unit);
            state.accountClaimable = IContent(content).accountToClaimable(account);
            state.accountIsModerator =
                IContent(content).owner() == account || IContent(content).accountToIsModerator(account);
        }

        return state;
    }

    /**
     * @notice Get state for a specific content token.
     * @param content Content contract address
     * @param tokenId Token ID
     * @return state Content token state
     */
    function getContentState(address content, uint256 tokenId) external view returns (ContentState memory state) {
        address rewarder = IContent(content).rewarder();
        address unitToken = IContent(content).unit();

        state.tokenId = tokenId;
        state.epochId = IContent(content).idToEpochId(tokenId);
        state.startTime = IContent(content).idToStartTime(tokenId);
        state.initPrice = IContent(content).idToInitPrice(tokenId);
        state.stake = IContent(content).idToStake(tokenId);
        state.price = IContent(content).getPrice(tokenId);
        state.creator = IContent(content).idToCreator(tokenId);
        state.owner = IContent(content).ownerOf(tokenId);
        state.uri = IContent(content).tokenURI(tokenId);
        state.isApproved = IContent(content).idToApproved(tokenId);

        // Calculate this content's share of weekly rewards
        uint256 totalStaked = IRewarder(rewarder).totalSupply();
        uint256 totalRewardForDuration = IRewarder(rewarder).getRewardForDuration(unitToken);
        state.rewardForDuration = totalStaked == 0 ? 0 : totalRewardForDuration * state.stake / totalStaked;

        return state;
    }

    /**
     * @notice Get aggregated state for an Auction contract.
     * @param content Content contract address
     * @param account User address (or address(0) to skip balance queries)
     * @return state Auction state
     */
    function getAuctionState(address content, address account) external view returns (AuctionState memory state) {
        address auction = ICore(core).contentToAuction(content);

        state.epochId = IAuction(auction).epochId();
        state.initPrice = IAuction(auction).initPrice();
        state.startTime = IAuction(auction).startTime();
        state.paymentToken = IAuction(auction).paymentToken();
        state.price = IAuction(auction).getPrice();

        // LP price in quote = (quote in LP * 2) / LP total supply
        uint256 lpTotalSupply = IERC20(state.paymentToken).totalSupply();
        state.paymentTokenPrice =
            lpTotalSupply == 0 ? 0 : IERC20(quote).balanceOf(state.paymentToken) * 2e18 / lpTotalSupply;

        state.quoteAccumulated = IERC20(quote).balanceOf(auction);
        state.accountQuoteBalance = account == address(0) ? 0 : IERC20(quote).balanceOf(account);
        state.accountPaymentTokenBalance = account == address(0) ? 0 : IERC20(state.paymentToken).balanceOf(account);

        return state;
    }
}
