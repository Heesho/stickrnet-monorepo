// SPDX-License-Identifier: MIT
pragma solidity 0.8.19;

import {ProtocolFixture} from "../../helpers/ProtocolFixture.sol";

contract DifferentialScenarioTest is ProtocolFixture {
    string internal constant SNAPSHOT_PATH = "foundry/snapshots/foundry.snapshot";

    function testWriteNormalizedDifferentialScenarios() public {
        vm.writeFile(SNAPSHOT_PATH, "");
        _snapshot("channel-launch", 0, "launch", "launcher", "none", 0, 0, 0, 0);

        uint256 first = createSticker(creator);
        (uint256 price, uint256 oldReserve, uint256 newReserve, uint256 premium) = collectSticker(first, user1, user1);
        _snapshot("initial-collection", first, "collect", "user1", "user1", price, oldReserve, newReserve, premium);

        vm.warp(BASE_TIME + 12 hours);
        (price, oldReserve, newReserve, premium) = collectSticker(first, user2, user3);
        _snapshot("sticker-resale", first, "collect", "user2", "user3", price, oldReserve, newReserve, premium);

        uint256 self = createSticker(creator);
        (price, oldReserve, newReserve, premium) = collectSticker(self, creator, creator);
        _snapshot(
            "creator-self-collection", self, "collect", "creator", "creator", price, oldReserve, newReserve, premium
        );

        uint256 wash = createSticker(creator);
        address[4] memory actors = [creator, user1, user2, user3];
        for (uint256 i; i < 10; ++i) {
            address actor = actors[i % actors.length];
            (price, oldReserve, newReserve, premium) = collectSticker(wash, actor, actor);
        }
        _snapshot("ten-controlled-trades", wash, "collect", "user1", "user1", price, oldReserve, newReserve, premium);

        vm.warp(minter.activePeriod() + WEEK);
        minter.updatePeriod();
        vm.warp(currentTime() + DAY);
        rewarder.getReward(user1, address(coin));
        _snapshot("reward-emission-claim", wash, "reward-claim", "user1", "user1", coin.balanceOf(user1), 0, 0, 0);

        uint256 surrenderReserve = content.reserveOf(first);
        vm.prank(user3);
        content.surrender(first);
        _snapshot("surrender", 0, "surrender", "user3", "burned", surrenderReserve, first, 0, 0);

        uint256 zeroPremium = createSticker(creator);
        vm.warp(currentTime() + DAY);
        (price, oldReserve, newReserve, premium) = collectSticker(zeroPremium, user1, user1);
        _snapshot("premium-zero", zeroPremium, "collect", "user1", "user1", price, oldReserve, newReserve, premium);

        uint256 treasuryClaim = content.accountToClaimable(address(auction));
        content.claim(address(auction));
        uint256 auctionPrice = auction.getPrice();
        uint256 auctionAssets = quote.balanceOf(address(auction));
        lp.mint(user2, auctionPrice);
        address[] memory assets = new address[](1);
        assets[0] = address(quote);
        vm.startPrank(user2);
        lp.approve(address(auction), auctionPrice);
        auction.buy(assets, user2, auction.epochId(), currentTime(), auctionPrice);
        vm.stopPrank();
        _snapshot(
            "treasury-auction",
            zeroPremium,
            "auction-buy",
            "user2",
            "user2",
            auctionPrice,
            auctionAssets,
            treasuryClaim,
            0
        );

        vm.prank(launcher);
        content.setTeam(creator);
        vm.prank(deployer);
        core.setProtocolFeeAddress(creator);
        uint256 overlap = createSticker(creator);
        (price, oldReserve, newReserve, premium) = collectSticker(overlap, creator, creator);
        _snapshot("role-overlap", overlap, "collect", "creator", "creator", price, oldReserve, newReserve, premium);

        vm.prank(user1);
        (bool ok, bytes memory revertData) = address(content).call(
            abi.encodeCall(
                content.collect, (user1, overlap, content.idToEpochId(overlap) + 1, currentTime(), type(uint256).max)
            )
        );
        _failureSnapshot("failure-stale-epoch", ok, revertData);

        vm.prank(user1);
        (ok, revertData) = address(content).call(
            abi.encodeCall(
                content.collect, (user1, overlap, content.idToEpochId(overlap), currentTime() - 1, type(uint256).max)
            )
        );
        _failureSnapshot("failure-expired-deadline", ok, revertData);

        vm.prank(user1);
        (ok, revertData) = address(content).call(
            abi.encodeCall(content.collect, (user1, overlap, content.idToEpochId(overlap), currentTime(), 0))
        );
        _failureSnapshot("failure-max-price", ok, revertData);

        vm.prank(creator);
        (ok, revertData) = address(content).call(abi.encodeCall(content.surrender, (overlap)));
        _failureSnapshot("failure-surrender-cooldown", ok, revertData);

        vm.prank(user1);
        (ok, revertData) = address(rewarder).call(abi.encodeCall(rewarder.deposit, (user1, 1)));
        _failureSnapshot("failure-rewarder-access", ok, revertData);
    }

    function _failureSnapshot(string memory scenario, bool ok, bytes memory revertData) internal {
        assertFalse(ok, "failure scenario unexpectedly succeeded");
        uint256 selector;
        if (revertData.length >= 4) {
            assembly {
                selector := shr(224, mload(add(revertData, 32)))
            }
        }
        _snapshot(scenario, 0, "revert", "user1", "none", selector, 0, 0, 0);
    }

    function _snapshot(
        string memory scenario,
        uint256 tokenId,
        string memory action,
        string memory actor,
        string memory recipient,
        uint256 eventAmount0,
        uint256 eventAmount1,
        uint256 eventAmount2,
        uint256 eventAmount3
    ) internal {
        _line(scenario, "timestamp", currentTime());
        _line(scenario, "action", action);
        _line(scenario, "actor", actor);
        _line(scenario, "recipient", recipient);
        _line(scenario, "eventAmount0", eventAmount0);
        _line(scenario, "eventAmount1", eventAmount1);
        _line(scenario, "eventAmount2", eventAmount2);
        _line(scenario, "eventAmount3", eventAmount3);
        _line(scenario, "tokenId", tokenId);
        _line(scenario, "reserve", tokenId == 0 ? 0 : content.reserveOf(tokenId));
        _line(scenario, "premium", tokenId == 0 ? 0 : content.premiumOf(tokenId));
        _line(scenario, "price", tokenId == 0 ? 0 : content.getPrice(tokenId));
        _line(scenario, "totalReserved", content.totalReserved());
        _line(scenario, "totalClaimable", content.totalClaimable());
        _line(scenario, "rewardTotalSupply", rewarder.totalSupply());
        _line(scenario, "contentQuoteBalance", quote.balanceOf(address(content)));
        _line(scenario, "creatorWeight", rewarder.accountToBalance(creator));
        _line(scenario, "user1Weight", rewarder.accountToBalance(user1));
        _line(scenario, "user2Weight", rewarder.accountToBalance(user2));
        _line(scenario, "user3Weight", rewarder.accountToBalance(user3));
        _line(scenario, "creatorClaimable", content.accountToClaimable(creator));
        _line(scenario, "user1Claimable", content.accountToClaimable(user1));
        _line(scenario, "user2Claimable", content.accountToClaimable(user2));
        _line(scenario, "user3Claimable", content.accountToClaimable(user3));
        _line(scenario, "treasuryClaimable", content.accountToClaimable(address(auction)));
        _line(scenario, "teamClaimable", content.accountToClaimable(launcher));
        _line(scenario, "protocolClaimable", content.accountToClaimable(protocol));
        _line(scenario, "user1Coin", coin.balanceOf(user1));
        _line(scenario, "auctionQuote", quote.balanceOf(address(auction)));
        _line(scenario, "auctionEpoch", auction.epochId());
        _line(scenario, "deadLp", lp.balanceOf(core.DEAD_ADDRESS()));
    }

    function _line(string memory scenario, string memory field, uint256 value) internal {
        _line(scenario, field, vm.toString(value));
    }

    function _line(string memory scenario, string memory field, string memory value) internal {
        vm.writeLine(SNAPSHOT_PATH, string.concat(scenario, "\t", field, "\t", value));
    }
}
