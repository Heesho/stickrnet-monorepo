// SPDX-License-Identifier: MIT
pragma solidity 0.8.19;

import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";
import {ReentrancyGuard} from "@openzeppelin/contracts/security/ReentrancyGuard.sol";
import {IContent} from "./interfaces/IContent.sol";
import {IMinter} from "./interfaces/IMinter.sol";
import {IUnit} from "./interfaces/IUnit.sol";
import {IUnitFactory} from "./interfaces/IUnitFactory.sol";
import {IContentFactory} from "./interfaces/IContentFactory.sol";
import {IMinterFactory} from "./interfaces/IMinterFactory.sol";
import {IAuctionFactory} from "./interfaces/IAuctionFactory.sol";
import {IUniswapV2Factory, IUniswapV2Router} from "./interfaces/IUniswapV2.sol";

/**
 * @title Core
 * @author heesho
 * @notice The main launchpad contract for deploying new Stickr Channel instances.
 *         Users provide quote tokens (e.g. USDC) to launch a new content platform. The Core contract:
 *         1. Deploys a new Unit token via UnitFactory
 *         2. Mints initial Unit tokens for liquidity
 *         3. Creates a Unit/quote liquidity pool on Uniswap V2
 *         4. Burns the initial LP tokens
 *         5. Deploys an Auction contract to collect and auction treasury fees
 *         6. Deploys a Content NFT collection via ContentFactory (creates Rewarder)
 *         7. Deploys a Minter contract via MinterFactory
 *         8. Transfers Unit minting rights to the Minter (permanently locked)
 *         9. Transfers ownership of Content and Minter to the launcher
 * @dev Fee-on-transfer and rebase tokens are NOT supported. The quote token must be a
 *      standard ERC20 token without transfer fees or rebasing mechanics.
 */
contract Core is Ownable, ReentrancyGuard {
    using SafeERC20 for IERC20;

    /*----------  CONSTANTS  --------------------------------------------*/

    address public constant DEAD_ADDRESS = 0x000000000000000000000000000000000000dEaD;
    uint256 public constant LP_DEADLINE_BUFFER = 20 minutes;

    /*----------  IMMUTABLES  -------------------------------------------*/

    address public immutable quote; // quote token for content collections (e.g. USDC)
    address public immutable uniswapV2Factory; // Uniswap V2 factory
    address public immutable uniswapV2Router; // Uniswap V2 router
    address public immutable unitFactory; // factory for deploying Unit tokens
    address public immutable contentFactory; // factory for deploying Content NFTs
    address public immutable minterFactory; // factory for deploying Minters
    address public immutable auctionFactory; // factory for deploying Auctions
    address public immutable rewarderFactory; // factory for deploying Rewarders

    /*----------  STATE  ------------------------------------------------*/

    address public protocolFeeAddress; // receives protocol fees from content collections
    uint256 public minQuoteForLaunch; // minimum quote required to launch

    address[] public contents; // array of all deployed content contracts
    mapping(address => bool) public isDeployedContent; // content => is valid
    mapping(address => uint256) public contentToIndex; // content => index in contents
    mapping(address => address) public contentToAuction; // content => Auction contract
    mapping(address => address) public contentToLP; // content => LP token

    /*----------  STRUCTS  ----------------------------------------------*/

    /**
     * @notice Parameters for launching a new Stickr Channel.
     */
    struct LaunchParams {
        address launcher; // address to receive ownership
        string tokenName; // Unit token name
        string tokenSymbol; // Unit token symbol
        string uri; // metadata URI for the content
        uint256 quoteAmount; // quote to provide for LP
        uint256 unitAmount; // Unit tokens minted for initial LP
        uint256 initialUps; // starting units per second
        uint256 tailUps; // minimum units per second
        uint256 halvingPeriod; // time between halvings
        uint256 contentMinInitPrice; // content minimum starting price
        bool contentIsModerated; // whether content requires approval
        uint256 auctionInitPrice; // auction starting price
        uint256 auctionEpochPeriod; // auction epoch duration
        uint256 auctionPriceMultiplier; // auction price multiplier
        uint256 auctionMinInitPrice; // auction minimum starting price
    }

    /*----------  ERRORS  -----------------------------------------------*/

    error Core__InsufficientQuote();
    error Core__InvalidLauncher();
    error Core__EmptyTokenName();
    error Core__EmptyTokenSymbol();
    error Core__InvalidUnitAmount();
    error Core__ZeroAddress();

    /*----------  EVENTS  -----------------------------------------------*/

    event Core__Launched(
        address indexed launcher,
        address indexed content,
        address indexed unit,
        address minter,
        address rewarder,
        address auction,
        address lpToken,
        string tokenName,
        string tokenSymbol,
        string uri,
        uint256 quoteAmount,
        uint256 unitAmount,
        uint256 initialUps,
        uint256 tailUps,
        uint256 halvingPeriod,
        uint256 contentMinInitPrice,
        bool contentIsModerated,
        uint256 auctionInitPrice,
        uint256 auctionEpochPeriod,
        uint256 auctionPriceMultiplier,
        uint256 auctionMinInitPrice
    );
    event Core__ProtocolFeeAddressSet(address protocolFeeAddress);
    event Core__MinQuoteForLaunchSet(uint256 minQuoteForLaunch);

    /*----------  CONSTRUCTOR  ------------------------------------------*/

    /**
     * @notice Deploy the Core launchpad contract.
     * @param _quote Quote token address (e.g. USDC)
     * @param _uniswapV2Factory Uniswap V2 factory address
     * @param _uniswapV2Router Uniswap V2 router address
     * @param _unitFactory UnitFactory contract address
     * @param _contentFactory ContentFactory contract address
     * @param _minterFactory MinterFactory contract address
     * @param _auctionFactory AuctionFactory contract address
     * @param _rewarderFactory RewarderFactory contract address
     * @param _protocolFeeAddress Address to receive protocol fees
     * @param _minQuoteForLaunch Minimum quote required to launch
     */
    constructor(
        address _quote,
        address _uniswapV2Factory,
        address _uniswapV2Router,
        address _unitFactory,
        address _contentFactory,
        address _minterFactory,
        address _auctionFactory,
        address _rewarderFactory,
        address _protocolFeeAddress,
        uint256 _minQuoteForLaunch
    ) {
        if (
            _quote == address(0) || _uniswapV2Factory == address(0)
                || _uniswapV2Router == address(0) || _unitFactory == address(0) || _contentFactory == address(0)
                || _minterFactory == address(0) || _auctionFactory == address(0) || _rewarderFactory == address(0)
        ) {
            revert Core__ZeroAddress();
        }

        quote = _quote;
        uniswapV2Factory = _uniswapV2Factory;
        uniswapV2Router = _uniswapV2Router;
        unitFactory = _unitFactory;
        contentFactory = _contentFactory;
        minterFactory = _minterFactory;
        auctionFactory = _auctionFactory;
        rewarderFactory = _rewarderFactory;
        protocolFeeAddress = _protocolFeeAddress;
        minQuoteForLaunch = _minQuoteForLaunch;
    }

    /*----------  EXTERNAL FUNCTIONS  -----------------------------------*/

    /**
     * @notice Launch a new Stickr Channel with associated Unit token, LP, Content, Minter, and Auction.
     * @dev Caller must approve quote tokens before calling.
     * @param params Launch parameters struct
     * @return unit Address of deployed Unit token
     * @return content Address of deployed Content NFT contract
     * @return minter Address of deployed Minter contract
     * @return rewarder Address of deployed Rewarder contract
     * @return auction Address of deployed Auction contract
     * @return lpToken Address of Unit/quote LP token
     */
    function launch(LaunchParams calldata params)
        external
        nonReentrant
        returns (
            address unit,
            address content,
            address minter,
            address rewarder,
            address auction,
            address lpToken
        )
    {
        // Validate basic inputs
        if (params.launcher == address(0)) revert Core__InvalidLauncher();
        if (params.quoteAmount < minQuoteForLaunch) revert Core__InsufficientQuote();
        if (bytes(params.tokenName).length == 0) revert Core__EmptyTokenName();
        if (bytes(params.tokenSymbol).length == 0) revert Core__EmptyTokenSymbol();
        if (params.unitAmount == 0) revert Core__InvalidUnitAmount();

        // Transfer quote from launcher
        IERC20(quote).safeTransferFrom(msg.sender, address(this), params.quoteAmount);

        // Deploy Unit token via factory (Core becomes initial minter)
        unit = IUnitFactory(unitFactory).deploy(params.tokenName, params.tokenSymbol);

        // Mint initial Unit tokens for LP seeding
        IUnit(unit).mint(address(this), params.unitAmount);

        // Create Unit/quote LP via Uniswap V2
        IERC20(unit).safeApprove(uniswapV2Router, 0);
        IERC20(unit).safeApprove(uniswapV2Router, params.unitAmount);
        IERC20(quote).safeApprove(uniswapV2Router, 0);
        IERC20(quote).safeApprove(uniswapV2Router, params.quoteAmount);

        (,, uint256 liquidity) = IUniswapV2Router(uniswapV2Router).addLiquidity(
            unit,
            quote,
            params.unitAmount,
            params.quoteAmount,
            params.unitAmount,
            params.quoteAmount,
            address(this),
            block.timestamp + LP_DEADLINE_BUFFER
        );

        // Get LP token address and burn initial liquidity
        lpToken = IUniswapV2Factory(uniswapV2Factory).getPair(unit, quote);
        IERC20(lpToken).safeTransfer(DEAD_ADDRESS, liquidity);

        // Deploy Auction with LP as payment token (receives treasury fees, burns LP)
        auction = IAuctionFactory(auctionFactory).deploy(
            params.auctionInitPrice,
            lpToken,
            DEAD_ADDRESS,
            params.auctionEpochPeriod,
            params.auctionPriceMultiplier,
            params.auctionMinInitPrice
        );

        // Deploy Content via factory (creates Rewarder internally)
        content = IContentFactory(contentFactory).deploy(
            params.tokenName,
            params.tokenSymbol,
            params.uri,
            unit,
            quote,
            auction,
            params.launcher, // team address = launcher
            address(this),
            rewarderFactory,
            params.contentMinInitPrice,
            params.contentIsModerated
        );

        // Get Rewarder address from Content
        rewarder = IContent(content).rewarder();

        // Deploy Minter via factory
        minter = IMinterFactory(minterFactory).deploy(
            unit,
            rewarder,
            params.initialUps,
            params.tailUps,
            params.halvingPeriod
        );

        // Transfer Unit minting rights to Minter (permanently locked since Minter has no setMinter function)
        IUnit(unit).setMinter(minter);

        // Transfer Content ownership to launcher
        IContent(content).transferOwnership(params.launcher);

        // Update registry
        contentToIndex[content] = contents.length;
        contents.push(content);
        isDeployedContent[content] = true;
        contentToAuction[content] = auction;
        contentToLP[content] = lpToken;

        emit Core__Launched(
            params.launcher,
            content,
            unit,
            minter,
            rewarder,
            auction,
            lpToken,
            params.tokenName,
            params.tokenSymbol,
            params.uri,
            params.quoteAmount,
            params.unitAmount,
            params.initialUps,
            params.tailUps,
            params.halvingPeriod,
            params.contentMinInitPrice,
            params.contentIsModerated,
            params.auctionInitPrice,
            params.auctionEpochPeriod,
            params.auctionPriceMultiplier,
            params.auctionMinInitPrice
        );

        return (unit, content, minter, rewarder, auction, lpToken);
    }

    /*----------  RESTRICTED FUNCTIONS  ---------------------------------*/

    /**
     * @notice Update the protocol fee recipient address.
     * @dev Can be set to address(0) to disable protocol fees.
     * @param _protocolFeeAddress New protocol fee address
     */
    function setProtocolFeeAddress(address _protocolFeeAddress) external onlyOwner {
        protocolFeeAddress = _protocolFeeAddress;
        emit Core__ProtocolFeeAddressSet(_protocolFeeAddress);
    }

    /**
     * @notice Update the minimum quote required to launch.
     * @param _minQuoteForLaunch New minimum amount
     */
    function setMinQuoteForLaunch(uint256 _minQuoteForLaunch) external onlyOwner {
        minQuoteForLaunch = _minQuoteForLaunch;
        emit Core__MinQuoteForLaunchSet(_minQuoteForLaunch);
    }

    /*----------  VIEW FUNCTIONS  ---------------------------------------*/

    /**
     * @notice Get the total number of deployed content contracts.
     * @return Number of content contracts launched
     */
    function contentsLength() external view returns (uint256) {
        return contents.length;
    }
}
