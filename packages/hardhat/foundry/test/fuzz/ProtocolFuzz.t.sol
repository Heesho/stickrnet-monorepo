// SPDX-License-Identifier: MIT
pragma solidity 0.8.19;

import {ProtocolFixture} from "../../helpers/ProtocolFixture.sol";
import {Content} from "../../../contracts/Content.sol";
import {Auction} from "../../../contracts/Auction.sol";
import {MockERC20} from "../../../contracts/mocks/MockERC20.sol";

contract ProtocolFuzzTest is ProtocolFixture {
    function testFuzzCollectionAlwaysFundsReserveAndPremium(uint32 elapsed, uint8 actorSeed) public {
        uint256 tokenId = createSticker(creator);
        vm.warp(BASE_TIME + bound(elapsed, 0, DAY + 1));
        address[4] memory actors = [creator, user1, user2, user3];
        address payer = actors[actorSeed % actors.length];
        address recipient = actors[(actorSeed / actors.length) % actors.length];

        uint256 reserve = content.nextReserveOf(tokenId);
        uint256 premium = content.premiumOf(tokenId);
        uint256 price = content.getPrice(tokenId);
        assertEq(price, reserve + premium, "price decomposition");
        collectSticker(tokenId, payer, recipient);

        assertEq(content.reserveOf(tokenId), reserve, "stored reserve");
        assertEq(rewarder.accountToBalance(recipient), reserve, "recipient weight");
        assertEq(content.totalReserved(), reserve, "aggregate reserve");
        assertEq(content.totalClaimable(), premium, "aggregate premium claims");
        assertEq(quote.balanceOf(address(content)), price, "incoming assets");
        assertCoreSolvency();
    }

    function testFuzzResaleRemovesPreviousWeight(uint32 elapsed, uint8 firstSeed, uint8 secondSeed) public {
        address[4] memory actors = [creator, user1, user2, user3];
        address first = actors[firstSeed % actors.length];
        address second = actors[secondSeed % actors.length];
        uint256 tokenId = createSticker(creator);
        collectSticker(tokenId, first, first);
        vm.warp(currentTime() + bound(elapsed, 0, DAY + 1));
        uint256 expectedReserve = content.nextReserveOf(tokenId);
        collectSticker(tokenId, second, second);

        assertEq(content.ownerOf(tokenId), second, "resale owner");
        assertEq(content.reserveOf(tokenId), expectedReserve, "resale reserve");
        if (first != second) assertEq(rewarder.accountToBalance(first), 0, "previous weight survived");
        assertEq(rewarder.accountToBalance(second), expectedReserve, "new owner weight");
        assertCoreSolvency();
    }

    function testFuzzRepeatedControlledTradesRemainFullyBacked(uint8 requestedTrades, uint32 elapsedPerTrade) public {
        uint256 trades = bound(requestedTrades, 1, 100);
        uint256 elapsed = bound(elapsedPerTrade, 0, DAY);
        address[4] memory actors = [creator, user1, user2, user3];
        uint256 tokenId = createSticker(creator);
        for (uint256 i; i < trades; ++i) {
            collectSticker(tokenId, actors[i % actors.length], actors[i % actors.length]);
            assertCoreSolvency();
            assertEq(rewarder.totalSupply(), content.reserveOf(tokenId), "trade reserve weight");
            vm.warp(currentTime() + elapsed);
        }
        assertEq(rewarder.accountToBalance(content.ownerOf(tokenId)), content.reserveOf(tokenId), "final owner weight");
    }

    function testFuzzSurrenderBoundaryIsAtomic(uint32 delay) public {
        uint256 tokenId = createSticker(creator);
        collectSticker(tokenId, user1, user1);
        uint256 reserve = content.reserveOf(tokenId);
        uint256 collectedAt = content.idToLastCollectedAt(tokenId);
        uint256 boundedDelay = bound(delay, 0, 2 * DAY);
        vm.warp(collectedAt + boundedDelay);
        vm.prank(user1);
        if (boundedDelay < DAY) {
            vm.expectRevert(Content.Content__SurrenderCooldown.selector);
            content.surrender(tokenId);
            assertEq(content.reserveOf(tokenId), reserve, "failed surrender reserve");
            assertEq(rewarder.accountToBalance(user1), reserve, "failed surrender weight");
        } else {
            content.surrender(tokenId);
            assertEq(content.reserveOf(tokenId), 0, "surrender reserve");
            assertEq(rewarder.accountToBalance(user1), 0, "surrender weight");
        }
        assertCoreSolvency();
    }

    function testFuzzFeeRoundingNeverExceedsPremium(uint96 minimumPrice, uint32 elapsed) public {
        uint256 minPrice = bound(minimumPrice, 1, 1_000_000 * USDC);
        vm.prank(deployer);
        Content roundingContent = new Content(
            "Rounding",
            "RND",
            "ipfs://rounding",
            address(coin),
            address(quote),
            address(auction),
            launcher,
            address(core),
            address(rewarderFactory),
            minPrice,
            false
        );
        uint256 tokenId = roundingContent.create(creator, "ipfs://rounding-item");
        vm.warp(currentTime() + bound(elapsed, 0, DAY + 1));
        uint256 price = roundingContent.getPrice(tokenId);
        uint256 premium = roundingContent.premiumOf(tokenId);
        vm.startPrank(user1);
        quote.approve(address(roundingContent), price);
        roundingContent.collect(user1, tokenId, 0, currentTime(), price);
        vm.stopPrank();

        assertEq(roundingContent.totalClaimable(), premium, "fee sum exceeds premium");
        assertEq(roundingContent.totalReserved(), minPrice, "rounding reserve");
        assertEq(quote.balanceOf(address(roundingContent)), minPrice + premium, "rounding liabilities");
    }

    function testFuzzAuctionPriceIsAlwaysWithinFloorAndStart(
        uint64 rawDuration,
        uint64 rawElapsed,
        uint128 rawFloor,
        uint128 rawStart,
        uint64 rawMultiplier
    ) public {
        uint256 duration = bound(rawDuration, 1 hours, 365 days);
        uint256 floor = bound(rawFloor, 1e6, 1e24);
        uint256 start = bound(rawStart, floor, 1e30);
        uint256 multiplier = bound(rawMultiplier, 11e17, 3e18);
        Auction fuzzAuction = new Auction(start, address(lp), core.DEAD_ADDRESS(), duration, multiplier, floor);
        vm.warp(currentTime() + bound(rawElapsed, 0, duration * 2));
        uint256 price = fuzzAuction.getPrice();
        assertGe(price, floor, "auction below floor");
        assertLe(price, start, "auction above start");
        if (currentTime() >= fuzzAuction.startTime() + duration) assertEq(price, floor, "expired auction price");
    }

    function testFuzzRewardAccrualIsReserveProportional(uint96 rewardInput, uint32 elapsedInput) public {
        uint256 token1 = createSticker(creator);
        uint256 token2 = createSticker(user2);
        collectSticker(token1, user1, user1);
        collectSticker(token2, user2, user2);
        collectSticker(token2, user2, user2);

        MockERC20 rewards = new MockERC20("Fuzz Reward", "FRWD");
        vm.prank(launcher);
        content.addReward(address(rewards));
        uint256 amount = bound(rewardInput, WEEK, 1e30);
        rewards.mint(launcher, amount);
        vm.startPrank(launcher);
        rewards.approve(address(rewarder), amount);
        rewarder.notifyRewardAmount(address(rewards), amount);
        vm.stopPrank();
        vm.warp(currentTime() + bound(elapsedInput, 1, WEEK));

        uint256 earned1 = rewarder.earned(user1, address(rewards));
        uint256 earned2 = rewarder.earned(user2, address(rewards));
        uint256 reserve1 = rewarder.accountToBalance(user1);
        uint256 reserve2 = rewarder.accountToBalance(user2);
        assertApproxEqAbs(earned1 * reserve2, earned2 * reserve1, reserve1 + reserve2, "reward ratio");
        assertCoreSolvency();
    }
}
