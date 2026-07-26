// SPDX-License-Identifier: MIT
pragma solidity 0.8.19;

import {TestBase} from "../../helpers/TestBase.sol";
import {ProtocolFixture} from "../../helpers/ProtocolFixture.sol";
import {Core} from "../../../contracts/Core.sol";
import {Content} from "../../../contracts/Content.sol";
import {Rewarder} from "../../../contracts/Rewarder.sol";
import {Minter} from "../../../contracts/Minter.sol";
import {Auction} from "../../../contracts/Auction.sol";
import {Coin} from "../../../contracts/Coin.sol";
import {MockUSDC} from "../../../contracts/mocks/MockUSDC.sol";
import {MockLP} from "../../../contracts/mocks/MockUniswapV2.sol";
import {MockERC20} from "../../../contracts/mocks/MockERC20.sol";

contract ProtocolHandler is TestBase {
    uint256 internal constant DAY = 1 days;
    uint256 internal constant DIVISOR = 10_000;
    uint256 internal constant RESERVE_MULTIPLIER = 11_000;

    Core public immutable core;
    Content public immutable content;
    Rewarder public immutable rewarder;
    Minter public immutable minter;
    Auction public immutable auction;
    Coin public immutable coin;
    MockUSDC public immutable quote;
    MockLP public immutable lp;
    address public immutable launcher;
    address public immutable deployer;
    uint256 public immutable minimumReserve;

    address[] internal actors;
    uint256[] internal tokens;
    address[] internal trackedRecipients;
    mapping(address => bool) internal isTrackedRecipient;

    mapping(uint256 => bool) public ghostActive;
    mapping(uint256 => address) public ghostOwner;
    mapping(uint256 => address) public ghostCreator;
    mapping(uint256 => uint256) public ghostReserve;
    mapping(uint256 => uint256) public ghostPremiumStart;
    mapping(uint256 => uint256) public ghostStartTime;
    mapping(uint256 => uint256) public ghostLastCollectedAt;
    mapping(address => uint256) public ghostRewardWeight;
    mapping(address => uint256) public ghostClaimable;

    uint256 public ghostTotalIncoming;
    uint256 public ghostTotalPayouts;
    uint256 public ghostTotalReserved;
    uint256 public ghostTotalClaimable;
    uint256 public ghostPremiumDistributed;
    uint256 public ghostReserveRefundLiabilities;
    uint256 public ghostSurrenderPayouts;
    uint256 public ghostEmissionsTriggered;
    uint256 public ghostRewardsClaimed;
    uint256 public calls;
    bool public discrepancy;

    event HandlerAction(bytes4 indexed selector, uint256 indexed tokenId, address indexed actor, uint256 amount);

    constructor(
        Core _core,
        Content _content,
        Rewarder _rewarder,
        Minter _minter,
        Auction _auction,
        Coin _coin,
        MockUSDC _quote,
        MockLP _lp,
        address _deployer,
        address _launcher,
        address[] memory _actors
    ) {
        core = _core;
        content = _content;
        rewarder = _rewarder;
        minter = _minter;
        auction = _auction;
        coin = _coin;
        quote = _quote;
        lp = _lp;
        deployer = _deployer;
        launcher = _launcher;
        minimumReserve = _content.minInitPrice();
        actors = _actors;
        _trackRecipient(address(_auction));
        _trackRecipient(_content.team());
        _trackRecipient(_core.protocolFeeAddress());
        for (uint256 i; i < _actors.length; ++i) {
            _trackRecipient(_actors[i]);
        }
    }

    function create(uint256 ownerSeed, uint256 callerSeed) external {
        address owner = _actor(ownerSeed);
        address caller = _actor(callerSeed);
        vm.prank(caller);
        uint256 tokenId = content.create(owner, "ipfs://invariant");
        tokens.push(tokenId);
        ghostActive[tokenId] = true;
        ghostOwner[tokenId] = owner;
        ghostCreator[tokenId] = owner;
        ghostPremiumStart[tokenId] = minimumReserve;
        ghostStartTime[tokenId] = currentTime();
        calls++;
        emit HandlerAction(this.create.selector, tokenId, caller, 0);
    }

    function collect(uint256 tokenSeed, uint256 payerSeed, uint256 recipientSeed) external {
        if (tokens.length == 0) return;
        uint256 tokenId = tokens[tokenSeed % tokens.length];
        if (!ghostActive[tokenId]) return;
        address payer = _actor(payerSeed);
        address recipient = _actor(recipientSeed);
        address previousOwner = ghostOwner[tokenId];
        uint256 oldReserve = ghostReserve[tokenId];
        uint256 newReserve = _nextReserve(oldReserve);
        uint256 premium = _premium(tokenId);
        uint256 expectedPrice = newReserve + premium;
        if (
            content.reserveOf(tokenId) != oldReserve || content.nextReserveOf(tokenId) != newReserve
                || content.premiumOf(tokenId) != premium || content.getPrice(tokenId) != expectedPrice
        ) {
            discrepancy = true;
            return;
        }

        vm.startPrank(payer);
        quote.approve(address(content), expectedPrice);
        content.collect(recipient, tokenId, content.idToEpochId(tokenId), currentTime(), expectedPrice);
        vm.stopPrank();

        address creator = ghostCreator[tokenId];
        address team = content.team();
        address protocol = core.protocolFeeAddress();
        address treasury = address(auction);
        uint256 ownerPremium = premium * 4_000 / DIVISOR;
        uint256 creatorPremium = premium * 2_000 / DIVISOR;
        uint256 treasuryPremium = premium * 3_000 / DIVISOR;
        uint256 teamPremium = team == address(0) ? 0 : premium * 500 / DIVISOR;
        uint256 protocolPremium = protocol == address(0) ? 0 : premium * 500 / DIVISOR;
        treasuryPremium += premium - ownerPremium - creatorPremium - treasuryPremium - teamPremium - protocolPremium;

        _addClaim(previousOwner, oldReserve + ownerPremium);
        _addClaim(creator, creatorPremium);
        _addClaim(treasury, treasuryPremium);
        if (teamPremium > 0) _addClaim(team, teamPremium);
        if (protocolPremium > 0) _addClaim(protocol, protocolPremium);

        ghostRewardWeight[previousOwner] -= oldReserve;
        ghostRewardWeight[recipient] += newReserve;
        ghostTotalReserved = ghostTotalReserved - oldReserve + newReserve;
        ghostTotalIncoming += expectedPrice;
        ghostPremiumDistributed += premium;
        ghostReserveRefundLiabilities += oldReserve;
        ghostOwner[tokenId] = recipient;
        ghostReserve[tokenId] = newReserve;
        ghostPremiumStart[tokenId] = _nextReserve(newReserve);
        ghostStartTime[tokenId] = currentTime();
        ghostLastCollectedAt[tokenId] = currentTime();
        calls++;
        emit HandlerAction(this.collect.selector, tokenId, payer, expectedPrice);
    }

    function claim(uint256 recipientSeed) external {
        if (trackedRecipients.length == 0) return;
        address recipient = trackedRecipients[recipientSeed % trackedRecipients.length];
        uint256 amount = ghostClaimable[recipient];
        if (amount == 0) return;
        content.claim(recipient);
        ghostClaimable[recipient] = 0;
        ghostTotalClaimable -= amount;
        ghostTotalPayouts += amount;
        calls++;
        emit HandlerAction(this.claim.selector, 0, recipient, amount);
    }

    function surrender(uint256 tokenSeed) external {
        if (tokens.length == 0) return;
        uint256 tokenId = tokens[tokenSeed % tokens.length];
        uint256 reserve = ghostReserve[tokenId];
        if (!ghostActive[tokenId] || reserve == 0) return;
        if (currentTime() < ghostLastCollectedAt[tokenId] + DAY) return;
        address owner = ghostOwner[tokenId];
        vm.prank(owner);
        content.surrender(tokenId);
        ghostRewardWeight[owner] -= reserve;
        ghostTotalReserved -= reserve;
        ghostTotalPayouts += reserve;
        ghostSurrenderPayouts += reserve;
        ghostReserve[tokenId] = 0;
        ghostPremiumStart[tokenId] = 0;
        ghostActive[tokenId] = false;
        calls++;
        emit HandlerAction(this.surrender.selector, tokenId, owner, reserve);
    }

    function advanceTime(uint32 rawSeconds) external {
        uint256 elapsed = bound(rawSeconds, 1, 14 days);
        vm.warp(currentTime() + elapsed);
        vm.roll(block.number + 1);
        calls++;
        emit HandlerAction(this.advanceTime.selector, 0, address(0), elapsed);
    }

    function updateEmission() external {
        uint256 beforeBalance = coin.balanceOf(address(rewarder));
        minter.updatePeriod();
        uint256 afterBalance = coin.balanceOf(address(rewarder));
        if (afterBalance > beforeBalance) ghostEmissionsTriggered += afterBalance - beforeBalance;
        calls++;
        emit HandlerAction(this.updateEmission.selector, 0, address(minter), afterBalance - beforeBalance);
    }

    function claimReward(uint256 actorSeed) external {
        address actor = _actor(actorSeed);
        uint256 beforeBalance = coin.balanceOf(actor);
        rewarder.getReward(actor, address(coin));
        uint256 paid = coin.balanceOf(actor) - beforeBalance;
        ghostRewardsClaimed += paid;
        calls++;
        emit HandlerAction(this.claimReward.selector, 0, actor, paid);
    }

    function setTeam(uint256 actorSeed, bool disable) external {
        address nextTeam = disable ? address(0) : _actor(actorSeed);
        vm.prank(launcher);
        content.setTeam(nextTeam);
        if (nextTeam != address(0)) _trackRecipient(nextTeam);
        calls++;
        emit HandlerAction(this.setTeam.selector, 0, nextTeam, 0);
    }

    function setProtocolRecipient(uint256 actorSeed, bool disable) external {
        address nextProtocol = disable ? address(0) : _actor(actorSeed);
        vm.prank(deployer);
        core.setProtocolFeeAddress(nextProtocol);
        if (nextProtocol != address(0)) _trackRecipient(nextProtocol);
        calls++;
        emit HandlerAction(this.setProtocolRecipient.selector, 0, nextProtocol, 0);
    }

    function addAndNotifyReward(uint96 rawAmount) external {
        if (rewarder.rewardTokensLength() >= rewarder.MAX_REWARD_TOKENS()) return;
        uint256 amount = bound(rawAmount, rewarder.DURATION(), 1e28);
        MockERC20 token = new MockERC20("Invariant Reward", "IRWD");
        vm.prank(launcher);
        content.addReward(address(token));
        token.mint(launcher, amount);
        vm.startPrank(launcher);
        token.approve(address(rewarder), amount);
        rewarder.notifyRewardAmount(address(token), amount);
        vm.stopPrank();
        calls++;
        emit HandlerAction(this.addAndNotifyReward.selector, 0, address(token), amount);
    }

    function buyAuction(uint256 actorSeed) external {
        uint256 treasuryClaim = ghostClaimable[address(auction)];
        if (treasuryClaim > 0) {
            content.claim(address(auction));
            ghostClaimable[address(auction)] = 0;
            ghostTotalClaimable -= treasuryClaim;
            ghostTotalPayouts += treasuryClaim;
        }
        uint256 auctionAssets = quote.balanceOf(address(auction));
        if (auctionAssets == 0) return;
        address actor = _actor(actorSeed);
        uint256 price = auction.getPrice();
        lp.mint(actor, price);
        address[] memory assets = new address[](1);
        assets[0] = address(quote);
        vm.startPrank(actor);
        lp.approve(address(auction), price);
        auction.buy(assets, actor, auction.epochId(), currentTime(), price);
        vm.stopPrank();
        calls++;
        emit HandlerAction(this.buyAuction.selector, 0, actor, auctionAssets);
    }

    function tokenCount() external view returns (uint256) {
        return tokens.length;
    }

    function tokenAt(uint256 index) external view returns (uint256) {
        return tokens[index];
    }

    function actorCount() external view returns (uint256) {
        return actors.length;
    }

    function actorAt(uint256 index) external view returns (address) {
        return actors[index];
    }

    function recipientCount() external view returns (uint256) {
        return trackedRecipients.length;
    }

    function recipientAt(uint256 index) external view returns (address) {
        return trackedRecipients[index];
    }

    function ghostAssetBalance() external view returns (uint256) {
        return ghostTotalIncoming - ghostTotalPayouts;
    }

    function ghostPremium(uint256 tokenId) external view returns (uint256) {
        return _premium(tokenId);
    }

    function _actor(uint256 seed) internal view returns (address) {
        return actors[seed % actors.length];
    }

    function _nextReserve(uint256 reserve) internal view returns (uint256) {
        return reserve == 0 ? minimumReserve : reserve * RESERVE_MULTIPLIER / DIVISOR;
    }

    function _premium(uint256 tokenId) internal view returns (uint256) {
        if (!ghostActive[tokenId]) return 0;
        uint256 elapsed = currentTime() - ghostStartTime[tokenId];
        if (elapsed >= DAY) return 0;
        uint256 start = ghostPremiumStart[tokenId];
        return start - start * elapsed / DAY;
    }

    function _addClaim(address recipient, uint256 amount) internal {
        if (amount == 0) return;
        _trackRecipient(recipient);
        ghostClaimable[recipient] += amount;
        ghostTotalClaimable += amount;
    }

    function _trackRecipient(address recipient) internal {
        if (recipient == address(0) || isTrackedRecipient[recipient]) return;
        isTrackedRecipient[recipient] = true;
        trackedRecipients.push(recipient);
    }
}

contract ProtocolInvariantTest is ProtocolFixture {
    struct FuzzSelector {
        address addr;
        bytes4[] selectors;
    }

    struct FuzzArtifactSelector {
        string artifact;
        bytes4[] selectors;
    }

    struct FuzzInterface {
        address addr;
        string[] artifacts;
    }

    ProtocolHandler internal handler;

    function setUp() public override {
        super.setUp();
        address[] memory actors = new address[](4);
        actors[0] = creator;
        actors[1] = user1;
        actors[2] = user2;
        actors[3] = user3;
        handler =
            new ProtocolHandler(core, content, rewarder, minter, auction, coin, quote, lp, deployer, launcher, actors);
    }

    function targetContracts() public view returns (address[] memory targets) {
        targets = new address[](1);
        targets[0] = address(handler);
    }

    function targetSelectors() public view returns (FuzzSelector[] memory configured) {
        configured = new FuzzSelector[](1);
        bytes4[] memory selectors = new bytes4[](11);
        selectors[0] = ProtocolHandler.create.selector;
        selectors[1] = ProtocolHandler.collect.selector;
        selectors[2] = ProtocolHandler.claim.selector;
        selectors[3] = ProtocolHandler.surrender.selector;
        selectors[4] = ProtocolHandler.advanceTime.selector;
        selectors[5] = ProtocolHandler.updateEmission.selector;
        selectors[6] = ProtocolHandler.claimReward.selector;
        selectors[7] = ProtocolHandler.setTeam.selector;
        selectors[8] = ProtocolHandler.setProtocolRecipient.selector;
        selectors[9] = ProtocolHandler.addAndNotifyReward.selector;
        selectors[10] = ProtocolHandler.buyAuction.selector;
        configured[0] = FuzzSelector({addr: address(handler), selectors: selectors});
    }

    function targetArtifactSelectors() public pure returns (FuzzArtifactSelector[] memory values) {
        values = new FuzzArtifactSelector[](0);
    }

    function targetArtifacts() public pure returns (string[] memory values) {
        values = new string[](0);
    }

    function excludeArtifacts() public pure returns (string[] memory values) {
        values = new string[](0);
    }

    function targetSenders() public pure returns (address[] memory values) {
        values = new address[](0);
    }

    function excludeSenders() public pure returns (address[] memory values) {
        values = new address[](0);
    }

    function excludeContracts() public pure returns (address[] memory values) {
        values = new address[](0);
    }

    function targetInterfaces() public pure returns (FuzzInterface[] memory values) {
        values = new FuzzInterface[](0);
    }

    function excludeSelectors() public pure returns (FuzzSelector[] memory values) {
        values = new FuzzSelector[](0);
    }

    function invariantRewardSupplyEqualsIndependentReserveLedger() public view {
        assertFalse(handler.discrepancy(), "model/contract price discrepancy");
        assertEq(rewarder.totalSupply(), handler.ghostTotalReserved(), "reward supply vs ghost reserves");
        assertEq(content.totalReserved(), handler.ghostTotalReserved(), "content total vs ghost reserves");
    }

    function invariantActiveReserveSumAndBurnedState() public view {
        uint256 sum;
        uint256 count = handler.tokenCount();
        for (uint256 i; i < count; ++i) {
            uint256 tokenId = handler.tokenAt(i);
            uint256 expected = handler.ghostReserve(tokenId);
            assertEq(content.reserveOf(tokenId), expected, "token reserve vs ghost");
            if (handler.ghostActive(tokenId)) {
                sum += expected;
                assertEq(content.ownerOf(tokenId), handler.ghostOwner(tokenId), "token owner vs ghost");
                assertEq(content.premiumOf(tokenId), handler.ghostPremium(tokenId), "token premium vs ghost");
            } else {
                assertEq(expected, 0, "inactive ghost reserve");
                assertEq(content.nextReserveOf(tokenId), 0, "inactive next reserve");
                assertEq(content.premiumOf(tokenId), 0, "inactive premium");
            }
        }
        assertEq(sum, handler.ghostTotalReserved(), "active reserve sum");
    }

    function invariantOwnerWeightsEqualIndependentAllocation() public view {
        uint256 sum;
        uint256 count = handler.actorCount();
        for (uint256 i; i < count; ++i) {
            address actor = handler.actorAt(i);
            uint256 expected = handler.ghostRewardWeight(actor);
            assertEq(rewarder.accountToBalance(actor), expected, "actor reward weight vs ghost");
            sum += expected;
        }
        assertEq(sum, rewarder.totalSupply(), "account reward weight sum");
    }

    function invariantClaimsAndQuoteAssetsMatchIndependentConservationLedger() public view {
        uint256 claimSum;
        uint256 count = handler.recipientCount();
        for (uint256 i; i < count; ++i) {
            address recipient = handler.recipientAt(i);
            uint256 expected = handler.ghostClaimable(recipient);
            assertEq(content.accountToClaimable(recipient), expected, "recipient claim vs ghost");
            claimSum += expected;
        }
        assertEq(claimSum, handler.ghostTotalClaimable(), "claimable sum");
        assertEq(content.totalClaimable(), handler.ghostTotalClaimable(), "content claims vs ghost");
        assertEq(quote.balanceOf(address(content)), handler.ghostAssetBalance(), "assets vs independent cash ledger");
        assertEq(
            quote.balanceOf(address(content)),
            handler.ghostTotalReserved() + handler.ghostTotalClaimable(),
            "assets vs liabilities"
        );
    }

    function invariantPremiumAndReserveRefundsAreOnlyClaimLiabilities() public view {
        assertEq(
            handler.ghostTotalClaimable() + handler.ghostTotalPayouts(),
            handler.ghostPremiumDistributed() + handler.ghostReserveRefundLiabilities()
                + handler.ghostSurrenderPayouts(),
            "claim/payout origin"
        );
    }
}
