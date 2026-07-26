// SPDX-License-Identifier: MIT
pragma solidity 0.8.19;

import {ProtocolFixture} from "../../helpers/ProtocolFixture.sol";
import {Core} from "../../../contracts/Core.sol";

contract GasSnapshotTest is ProtocolFixture {
    function setUp() public override {
        vm.pauseGasMetering();
        super.setUp();
    }

    function testGasChannelLaunch() public {
        Core.LaunchParams memory params = defaultLaunchParams(launcher);
        params.tokenName = "Gas Snapshot";
        params.tokenSymbol = "GAS";
        vm.startPrank(launcher);
        quote.approve(address(core), params.quoteAmount);
        vm.resumeGasMetering();
        core.launch(params);
        vm.stopPrank();
    }

    function testGasStickerCreation() public {
        vm.prank(creator);
        vm.resumeGasMetering();
        content.create(creator, "ipfs://gas");
    }

    function testGasFirstCollection() public {
        uint256 tokenId = createSticker(creator);
        uint256 price = content.getPrice(tokenId);
        vm.startPrank(user1);
        quote.approve(address(content), price);
        vm.resumeGasMetering();
        content.collect(user1, tokenId, content.idToEpochId(tokenId), currentTime(), price);
        vm.stopPrank();
    }

    function testGasSubsequentCollection() public {
        uint256 tokenId = createSticker(creator);
        collectSticker(tokenId, user1, user1);
        uint256 price = content.getPrice(tokenId);
        vm.startPrank(user2);
        quote.approve(address(content), price);
        vm.resumeGasMetering();
        content.collect(user2, tokenId, content.idToEpochId(tokenId), currentTime(), price);
        vm.stopPrank();
    }

    function testGasClaim() public {
        uint256 tokenId = createSticker(creator);
        collectSticker(tokenId, user1, user1);
        collectSticker(tokenId, user2, user2);
        vm.resumeGasMetering();
        content.claim(user1);
    }

    function testGasRewardClaim() public {
        uint256 tokenId = createSticker(creator);
        collectSticker(tokenId, user1, user1);
        vm.warp(minter.activePeriod() + WEEK);
        minter.updatePeriod();
        vm.warp(currentTime() + DAY);
        vm.resumeGasMetering();
        rewarder.getReward(user1, address(coin));
    }

    function testGasSurrender() public {
        uint256 tokenId = createSticker(creator);
        collectSticker(tokenId, user1, user1);
        vm.warp(currentTime() + DAY);
        vm.prank(user1);
        vm.resumeGasMetering();
        content.surrender(tokenId);
    }

    function testGasTreasuryAuction() public {
        uint256 tokenId = createSticker(creator);
        collectSticker(tokenId, user1, user1);
        content.claim(address(auction));
        uint256 price = auction.getPrice();
        lp.mint(user2, price);
        vm.startPrank(user2);
        lp.approve(address(auction), price);
        address[] memory assets = new address[](1);
        assets[0] = address(quote);
        vm.resumeGasMetering();
        auction.buy(assets, user2, auction.epochId(), currentTime(), price);
        vm.stopPrank();
    }

    function testGasMinterUpdate() public {
        vm.warp(minter.activePeriod() + WEEK);
        vm.resumeGasMetering();
        minter.updatePeriod();
    }
}
