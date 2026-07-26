// SPDX-License-Identifier: MIT
pragma solidity 0.8.19;

import {ERC721, IERC721} from "@openzeppelin/contracts/token/ERC721/ERC721.sol";
import {ERC721URIStorage} from "@openzeppelin/contracts/token/ERC721/extensions/ERC721URIStorage.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import {ReentrancyGuard} from "@openzeppelin/contracts/security/ReentrancyGuard.sol";
import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";
import {IRewarderFactory} from "./interfaces/IRewarderFactory.sol";
import {IRewarder} from "./interfaces/IRewarder.sol";
import {ICore} from "./interfaces/ICore.sol";

/**
 * @title Content
 * @author heesho
 * @notice NFT collection where collectors can "steal" content by funding a refundable reserve
 *         plus a Dutch-auction premium. Only the reserve determines Rewarder mining power.
 * @dev The reserve grows by 10% on each collection. The premium decays to zero over one day.
 *      Premium split: 40% previous owner, 20% creator, 30% treasury, 5% team, 5% protocol.
 *      Fee-on-transfer and rebase tokens are NOT supported. The quote token must be a standard
 *      ERC20 token without transfer fees or rebasing mechanics.
 */
contract Content is ERC721, ERC721URIStorage, ReentrancyGuard, Ownable {
    using SafeERC20 for IERC20;

    /*----------  CONSTANTS  --------------------------------------------*/

    uint256 public constant PREVIOUS_OWNER_PREMIUM_FEE = 4_000;
    uint256 public constant CREATOR_PREMIUM_FEE = 2_000;
    uint256 public constant TREASURY_PREMIUM_FEE = 3_000;
    uint256 public constant TEAM_PREMIUM_FEE = 500;
    uint256 public constant PROTOCOL_PREMIUM_FEE = 500;
    uint256 public constant DIVISOR = 10_000;
    uint256 public constant RESERVE_MULTIPLIER = 11_000;
    uint256 public constant EPOCH_PERIOD = 1 days;
    uint256 public constant SURRENDER_COOLDOWN = 1 days;
    uint256 public constant MAX_URI_LENGTH = 2_048;
    uint256 public constant MAX_TOKEN_URI_LENGTH = 4_096;

    /*----------  IMMUTABLES  -------------------------------------------*/

    address public immutable rewarder;
    address public immutable coin;
    address public immutable quote;
    address public immutable core;
    uint256 public immutable minInitPrice;

    /*----------  STATE  ------------------------------------------------*/

    string public uri;
    address public treasury;
    address public team;

    bool public isModerated;
    mapping(address => bool) public accountToIsModerator;

    uint256 public nextTokenId;
    uint256 public totalSupply;

    mapping(uint256 => bool) public idToApproved;
    mapping(uint256 => address) public idToCreator;
    mapping(uint256 => uint256) public idToEpochId;
    mapping(uint256 => uint256) public idToReserve;
    mapping(uint256 => uint256) public idToPremiumStart;
    mapping(uint256 => uint256) public idToStartTime;
    mapping(uint256 => uint256) public idToLastCollectedAt;

    mapping(address => uint256) public accountToClaimable;
    uint256 public totalReserved;
    uint256 public totalClaimable;

    /*----------  ERRORS  -----------------------------------------------*/

    error Content__ZeroTo();
    error Content__ZeroLengthUri();
    error Content__ZeroMinPrice();
    error Content__Expired();
    error Content__EpochIdMismatch();
    error Content__MaxPriceExceeded();
    error Content__TransferDisabled();
    error Content__NotApproved();
    error Content__AlreadyApproved();
    error Content__NotModerator();
    error Content__InvalidTreasury();
    error Content__InvalidCore();
    error Content__InvalidCoin();
    error Content__InvalidQuote();
    error Content__NothingToClaim();
    error Content__NotTokenOwner();
    error Content__NoReserve();
    error Content__SurrenderCooldown();
    error Content__ReserveGrowthOverflow();
    error Content__IncorrectPayment();
    error Content__RewarderReserveMismatch();
    error Content__Insolvent();
    error Content__UriTooLong();

    /*----------  EVENTS  -----------------------------------------------*/

    event Content__Created(address indexed who, address indexed to, uint256 indexed tokenId, string uri);
    event Content__Collected(
        address indexed who,
        address indexed to,
        uint256 indexed tokenId,
        uint256 epochId,
        uint256 price,
        uint256 oldReserve,
        uint256 newReserve,
        uint256 premium
    );
    event Content__Surrendered(address indexed owner, uint256 indexed tokenId, uint256 reserve);
    event Content__UriSet(string uri);
    event Content__TreasurySet(address indexed treasury);
    event Content__TeamSet(address indexed team);
    event Content__IsModeratedSet(bool isModerated);
    event Content__ModeratorsSet(address indexed account, bool accountToIsModerator);
    event Content__Approved(address indexed moderator, uint256 indexed tokenId);
    event Content__RewardAdded(address indexed rewardToken);
    event Content__RewardNotifierSet(address indexed rewardToken, address indexed notifier);
    event Content__Claimed(address indexed account, uint256 amount);

    /*----------  CONSTRUCTOR  ------------------------------------------*/

    /**
     * @notice Deploy a new Content NFT collection.
     * @param _name Token name
     * @param _symbol Token symbol
     * @param _uri Metadata URI
     * @param _coin Coin token address
     * @param _quote Quote token (USDC) address
     * @param _treasury Treasury (Auction) address for fee collection
     * @param _team Team address for fee collection
     * @param _core Core contract address
     * @param _rewarderFactory RewarderFactory address
     * @param _minInitPrice Minimum starting auction price
     * @param _isModerated Whether content requires moderator approval
     */
    constructor(
        string memory _name,
        string memory _symbol,
        string memory _uri,
        address _coin,
        address _quote,
        address _treasury,
        address _team,
        address _core,
        address _rewarderFactory,
        uint256 _minInitPrice,
        bool _isModerated
    ) ERC721(_name, _symbol) {
        if (_minInitPrice == 0) revert Content__ZeroMinPrice();
        if (bytes(_uri).length == 0) revert Content__ZeroLengthUri();
        if (bytes(_uri).length > MAX_URI_LENGTH) revert Content__UriTooLong();
        if (_coin == address(0)) revert Content__InvalidCoin();
        if (_quote == address(0)) revert Content__InvalidQuote();
        if (_treasury == address(0)) revert Content__InvalidTreasury();
        if (_core == address(0)) revert Content__InvalidCore();

        uri = _uri;
        coin = _coin;
        quote = _quote;
        treasury = _treasury;
        team = _team;
        core = _core;
        minInitPrice = _minInitPrice;
        isModerated = _isModerated;

        rewarder = IRewarderFactory(_rewarderFactory).deploy(address(this));
        IRewarder(rewarder).addReward(_coin, address(this));
    }

    /*----------  EXTERNAL FUNCTIONS  -----------------------------------*/

    /**
     * @notice Create new content NFT.
     * @param to Recipient address (becomes creator)
     * @param tokenUri Metadata URI for the content
     * @return tokenId The ID of the created token
     */
    function create(address to, string memory tokenUri) external nonReentrant returns (uint256 tokenId) {
        if (to == address(0)) revert Content__ZeroTo();
        if (bytes(tokenUri).length == 0) revert Content__ZeroLengthUri();
        if (bytes(tokenUri).length > MAX_TOKEN_URI_LENGTH) revert Content__UriTooLong();

        tokenId = ++nextTokenId;
        totalSupply++;
        idToCreator[tokenId] = to;
        if (!isModerated) idToApproved[tokenId] = true;

        idToPremiumStart[tokenId] = minInitPrice;
        idToStartTime[tokenId] = block.timestamp;

        _safeMint(to, tokenId);
        _setTokenURI(tokenId, tokenUri);

        emit Content__Created(msg.sender, to, tokenId, tokenUri);
    }

    /**
     * @notice Collect (steal) content by paying the dutch auction price.
     * @param to Address to receive the content
     * @param tokenId Token ID to collect
     * @param epochId Expected epoch ID (frontrun protection)
     * @param deadline Transaction deadline
     * @param maxPrice Maximum price willing to pay (slippage protection)
     * @return price Actual price paid
     */
    function collect(
        address to,
        uint256 tokenId,
        uint256 epochId,
        uint256 deadline,
        uint256 maxPrice
    ) external nonReentrant returns (uint256 price) {
        if (to == address(0)) revert Content__ZeroTo();
        if (!idToApproved[tokenId]) revert Content__NotApproved();
        if (block.timestamp > deadline) revert Content__Expired();
        if (epochId != idToEpochId[tokenId]) revert Content__EpochIdMismatch();

        price = getPrice(tokenId);
        if (price > maxPrice) revert Content__MaxPriceExceeded();

        address creator = idToCreator[tokenId];
        address prevOwner = ownerOf(tokenId);
        uint256 oldReserve = idToReserve[tokenId];
        uint256 newReserve = _nextReserve(oldReserve);
        uint256 premium = premiumOf(tokenId);

        uint256 balanceBefore = IERC20(quote).balanceOf(address(this));
        IERC20(quote).safeTransferFrom(msg.sender, address(this), price);
        if (IERC20(quote).balanceOf(address(this)) != balanceBefore + price) {
            revert Content__IncorrectPayment();
        }

        address protocol = ICore(core).protocolFeeAddress();
        uint256 prevOwnerPremium = premium * PREVIOUS_OWNER_PREMIUM_FEE / DIVISOR;
        uint256 creatorPremium = premium * CREATOR_PREMIUM_FEE / DIVISOR;
        uint256 teamPremium = team == address(0) ? 0 : premium * TEAM_PREMIUM_FEE / DIVISOR;
        uint256 protocolPremium =
            protocol == address(0) ? 0 : premium * PROTOCOL_PREMIUM_FEE / DIVISOR;
        uint256 treasuryPremium = premium * TREASURY_PREMIUM_FEE / DIVISOR;
        // Treasury also receives rounding dust and disabled team/protocol shares.
        treasuryPremium += premium
            - prevOwnerPremium
            - creatorPremium
            - treasuryPremium
            - teamPremium
            - protocolPremium;

        // Effects: reserve liabilities and Rewarder stake are always changed in lockstep.
        unchecked {
            idToEpochId[tokenId]++;
        }
        idToReserve[tokenId] = newReserve;
        idToPremiumStart[tokenId] = _nextReserve(newReserve);
        idToStartTime[tokenId] = block.timestamp;
        idToLastCollectedAt[tokenId] = block.timestamp;
        totalReserved = totalReserved - oldReserve + newReserve;

        uint256 prevOwnerClaimable = oldReserve + prevOwnerPremium;
        _accrueClaimable(prevOwner, prevOwnerClaimable);
        _accrueClaimable(creator, creatorPremium);
        _accrueClaimable(treasury, treasuryPremium);
        if (teamPremium > 0) _accrueClaimable(team, teamPremium);
        if (protocolPremium > 0) _accrueClaimable(protocol, protocolPremium);

        // Interactions: every reserve refund and premium share uses pull accounting.
        if (oldReserve > 0) {
            IRewarder(rewarder).withdraw(prevOwner, oldReserve);
        }
        IRewarder(rewarder).deposit(to, newReserve);

        _assertSolvent();

        // Receiver callback runs only after reserve and reward accounting is synchronized.
        _safeTransfer(prevOwner, to, tokenId, "");

        emit Content__Collected(msg.sender, to, tokenId, epochId, price, oldReserve, newReserve, premium);

        return price;
    }

    /**
     * @notice Burn a collected Sticker and recover its complete refundable reserve.
     * @param tokenId Token ID to surrender
     */
    function surrender(uint256 tokenId) external nonReentrant {
        if (ownerOf(tokenId) != msg.sender) revert Content__NotTokenOwner();

        uint256 reserve = idToReserve[tokenId];
        if (reserve == 0) revert Content__NoReserve();
        if (block.timestamp < idToLastCollectedAt[tokenId] + SURRENDER_COOLDOWN) {
            revert Content__SurrenderCooldown();
        }

        totalReserved -= reserve;
        idToReserve[tokenId] = 0;
        idToPremiumStart[tokenId] = 0;
        idToApproved[tokenId] = false;
        totalSupply--;

        IRewarder(rewarder).withdraw(msg.sender, reserve);
        _burn(tokenId);
        IERC20(quote).safeTransfer(msg.sender, reserve);

        _assertSolvent();

        emit Content__Surrendered(msg.sender, tokenId, reserve);
    }

    /**
     * @notice Claim accumulated fees for an account.
     * @dev Uses pull pattern to avoid blacklist issues with quote token.
     * @param account The account to claim for
     */
    function claim(address account) external nonReentrant {
        uint256 amount = accountToClaimable[account];
        if (amount == 0) revert Content__NothingToClaim();

        accountToClaimable[account] = 0;
        totalClaimable -= amount;

        IERC20(quote).safeTransfer(account, amount);

        _assertSolvent();

        emit Content__Claimed(account, amount);
    }

    /*----------  DISABLED TRANSFERS  -----------------------------------*/

    function approve(address, uint256) public virtual override(ERC721, IERC721) {
        revert Content__TransferDisabled();
    }

    function setApprovalForAll(address, bool) public virtual override(ERC721, IERC721) {
        revert Content__TransferDisabled();
    }

    function transferFrom(address, address, uint256) public virtual override(ERC721, IERC721) {
        revert Content__TransferDisabled();
    }

    function safeTransferFrom(address, address, uint256) public virtual override(ERC721, IERC721) {
        revert Content__TransferDisabled();
    }

    function safeTransferFrom(address, address, uint256, bytes memory) public virtual override(ERC721, IERC721) {
        revert Content__TransferDisabled();
    }

    /*----------  RESTRICTED FUNCTIONS  ---------------------------------*/

    /**
     * @notice Update the metadata URI.
     * @param _uri New metadata URI
     */
    function setUri(string memory _uri) external onlyOwner {
        if (bytes(_uri).length == 0) revert Content__ZeroLengthUri();
        if (bytes(_uri).length > MAX_URI_LENGTH) revert Content__UriTooLong();
        uri = _uri;
        emit Content__UriSet(_uri);
    }

    /**
     * @notice Update the treasury address.
     * @param _treasury New treasury address
     */
    function setTreasury(address _treasury) external onlyOwner {
        if (_treasury == address(0)) revert Content__InvalidTreasury();
        treasury = _treasury;
        emit Content__TreasurySet(_treasury);
    }

    /**
     * @notice Update the team address. Set to address(0) to disable team fee.
     * @param _team New team address
     */
    function setTeam(address _team) external onlyOwner {
        team = _team;
        emit Content__TeamSet(_team);
    }

    /**
     * @notice Toggle moderation mode.
     * @param _isModerated Whether to enable moderation
     */
    function setIsModerated(bool _isModerated) external onlyOwner {
        isModerated = _isModerated;
        emit Content__IsModeratedSet(_isModerated);
    }

    /**
     * @notice Set moderator status for accounts.
     * @param accounts Array of accounts to update
     * @param _accountToIsModerator Whether to grant moderator status
     */
    function setModerators(address[] calldata accounts, bool _accountToIsModerator) external onlyOwner {
        for (uint256 i = 0; i < accounts.length; i++) {
            accountToIsModerator[accounts[i]] = _accountToIsModerator;
            emit Content__ModeratorsSet(accounts[i], _accountToIsModerator);
        }
    }

    /**
     * @notice Approve content for collection (moderators only).
     * @param tokenIds Array of token IDs to approve
     */
    function approveContents(uint256[] calldata tokenIds) external {
        if (msg.sender != owner() && !accountToIsModerator[msg.sender]) revert Content__NotModerator();
        for (uint256 i = 0; i < tokenIds.length; i++) {
            if (idToApproved[tokenIds[i]]) revert Content__AlreadyApproved();
            ownerOf(tokenIds[i]); // Reverts if token doesn't exist
            idToApproved[tokenIds[i]] = true;
            emit Content__Approved(msg.sender, tokenIds[i]);
        }
    }

    /**
     * @notice Add a new reward token to the rewarder.
     * @param rewardToken Reward token address
     */
    function addReward(address rewardToken) external onlyOwner {
        IRewarder(rewarder).addReward(rewardToken, msg.sender);
        emit Content__RewardAdded(rewardToken);
        emit Content__RewardNotifierSet(rewardToken, msg.sender);
    }

    /**
     * @notice Set the only account allowed to notify a registered reward token.
     */
    function setRewardNotifier(address rewardToken, address notifier) external onlyOwner {
        IRewarder(rewarder).setRewardNotifier(rewardToken, notifier);
        emit Content__RewardNotifierSet(rewardToken, notifier);
    }

    /*----------  INTERNAL OVERRIDES  -----------------------------------*/

    function _burn(uint256 tokenId) internal override(ERC721, ERC721URIStorage) {
        super._burn(tokenId);
    }

    function _accrueClaimable(address account, uint256 amount) internal {
        if (amount == 0) return;
        accountToClaimable[account] += amount;
        totalClaimable += amount;
    }

    function _nextReserve(uint256 currentReserve) internal view returns (uint256) {
        if (currentReserve == 0) return minInitPrice;
        if (currentReserve > type(uint256).max / RESERVE_MULTIPLIER) {
            revert Content__ReserveGrowthOverflow();
        }
        return currentReserve * RESERVE_MULTIPLIER / DIVISOR;
    }

    function _assertSolvent() internal view {
        if (IRewarder(rewarder).totalSupply() != totalReserved) {
            revert Content__RewarderReserveMismatch();
        }
        if (IERC20(quote).balanceOf(address(this)) < totalReserved + totalClaimable) {
            revert Content__Insolvent();
        }
    }

    function supportsInterface(bytes4 interfaceId)
        public
        view
        override(ERC721, ERC721URIStorage)
        returns (bool)
    {
        return super.supportsInterface(interfaceId);
    }

    function tokenURI(uint256 tokenId)
        public
        view
        override(ERC721, ERC721URIStorage)
        returns (string memory)
    {
        return super.tokenURI(tokenId);
    }

    /*----------  VIEW FUNCTIONS  ---------------------------------------*/

    /**
     * @notice Get the refundable reserve locked behind a token.
     */
    function reserveOf(uint256 tokenId) public view returns (uint256) {
        return idToReserve[tokenId];
    }

    /**
     * @notice Get the current decaying speculative premium for a token.
     */
    function premiumOf(uint256 tokenId) public view returns (uint256) {
        if (!_exists(tokenId)) return 0;
        uint256 timePassed = block.timestamp - idToStartTime[tokenId];
        if (timePassed >= EPOCH_PERIOD) return 0;
        uint256 premiumStart = idToPremiumStart[tokenId];
        return premiumStart - premiumStart * timePassed / EPOCH_PERIOD;
    }

    /**
     * @notice Get the reserve the next collector must fund.
     */
    function nextReserveOf(uint256 tokenId) public view returns (uint256) {
        if (!_exists(tokenId)) return 0;
        return _nextReserve(idToReserve[tokenId]);
    }

    /**
     * @notice Get the total collection price: next reserve plus current premium.
     * @param tokenId Token ID
     * @return Current total collection price
     */
    function getPrice(uint256 tokenId) public view returns (uint256) {
        if (!_exists(tokenId)) return 0;
        return _nextReserve(idToReserve[tokenId]) + premiumOf(tokenId);
    }
}
