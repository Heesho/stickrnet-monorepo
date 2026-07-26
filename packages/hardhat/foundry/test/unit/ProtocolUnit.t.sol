// SPDX-License-Identifier: MIT
pragma solidity 0.8.19;

import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {IERC721Receiver} from "@openzeppelin/contracts/token/ERC721/IERC721Receiver.sol";
import {ProtocolFixture} from "../../helpers/ProtocolFixture.sol";
import {Core} from "../../../contracts/Core.sol";
import {Content} from "../../../contracts/Content.sol";
import {Rewarder} from "../../../contracts/Rewarder.sol";
import {Auction} from "../../../contracts/Auction.sol";
import {Coin} from "../../../contracts/Coin.sol";
import {Multicall} from "../../../contracts/Multicall.sol";
import {MockLP} from "../../../contracts/mocks/MockUniswapV2.sol";
import {MockNonNFTReceiver} from "../../../contracts/mocks/MockNFTReceivers.sol";

contract ReentrantNFTWallet is IERC721Receiver {
    Content public immutable content;
    bool public callbackAttempted;
    bool public reentrancySucceeded;

    constructor(Content _content) {
        content = _content;
    }

    function onERC721Received(address, address, uint256 tokenId, bytes calldata) external returns (bytes4) {
        callbackAttempted = true;
        (reentrancySucceeded,) = address(content).call(abi.encodeCall(Content.surrender, (tokenId)));
        return IERC721Receiver.onERC721Received.selector;
    }
}

contract ProtocolUnitTest is ProtocolFixture {
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

    function testProductionLaunchUsesEveryFactoryAndCompletesAuthorityHandoffs() public view {
        assertEq(core.contentsLength(), 1, "registry length");
        assertTrue(core.isDeployedContent(address(content)), "content registry flag");
        assertEq(core.contentToAuction(address(content)), address(auction), "auction registry");
        assertEq(core.contentToLP(address(content)), address(lp), "LP registry");
        assertEq(content.owner(), launcher, "content owner handoff");
        assertEq(coin.minter(), address(minter), "coin minter handoff");
        assertEq(rewarder.content(), address(content), "rewarder content authority");
        assertEq(rewarder.tokenToNotifier(address(coin)), address(minter), "coin notifier");
        assertEq(auction.paymentToken(), address(lp), "auction payment token");
        assertTrue(lp.balanceOf(core.DEAD_ADDRESS()) > 0, "initial LP not burned");
        assertEq(quote.balanceOf(address(core)), 0, "Core quote residue");
        assertEq(coin.balanceOf(address(core)), 0, "Core coin residue");
    }

    function testCoinRejectsUnauthorizedMintAndSupportsOwnerBurn() public {
        vm.prank(user1);
        vm.expectRevert(Coin.Coin__NotMinter.selector);
        coin.mint(user1, TOKEN);

        vm.warp(minter.activePeriod() + WEEK);
        minter.updatePeriod();
        vm.warp(currentTime() + DAY);
        uint256 tokenId = createSticker(creator);
        collectSticker(tokenId, user1, user1);
        vm.warp(currentTime() + DAY);
        uint256 beforeClaim = coin.balanceOf(user1);
        rewarder.getReward(user1, address(coin));
        uint256 reward = coin.balanceOf(user1) - beforeClaim;
        assertTrue(reward > 0, "reward not paid");
        vm.prank(user1);
        coin.burn(reward);
        assertEq(coin.balanceOf(user1), beforeClaim, "burn result");
    }

    function testInitialCollectionHasExactReservePremiumFeesAndEvent() public {
        uint256 tokenId = createSticker(creator);
        uint256 price = content.getPrice(tokenId);
        uint256 premium = content.premiumOf(tokenId);
        uint256 reserve = content.nextReserveOf(tokenId);

        vm.startPrank(user1);
        quote.approve(address(content), price);
        vm.expectEmit(true, true, true, true, address(content));
        emit Content__Collected(user1, user1, tokenId, 0, price, 0, reserve, premium);
        content.collect(user1, tokenId, 0, currentTime(), price);
        vm.stopPrank();

        assertEq(content.ownerOf(tokenId), user1, "owner");
        assertEq(content.reserveOf(tokenId), reserve, "reserve");
        assertEq(rewarder.accountToBalance(user1), reserve, "reward weight");
        assertEq(content.totalClaimable(), premium, "premium liabilities");
        assertEq(quote.balanceOf(address(content)), reserve + premium, "held quote");
        assertEq(content.accountToClaimable(creator), premium * 6000 / 10_000, "creator+owner claim");
        assertEq(content.accountToClaimable(address(auction)), premium * 3000 / 10_000, "treasury claim");
        assertEq(content.accountToClaimable(launcher), premium * 500 / 10_000, "team claim");
        assertEq(content.accountToClaimable(protocol), premium * 500 / 10_000, "protocol claim");
        assertCoreSolvency();
    }

    function testResaleReleasesOldReserveAndMovesOnlyNewReserveWeight() public {
        uint256 tokenId = createSticker(creator);
        collectSticker(tokenId, user1, user1);
        vm.warp(currentTime() + 12 hours);

        uint256 oldReserve = content.reserveOf(tokenId);
        uint256 premium = content.premiumOf(tokenId);
        uint256 newReserve = content.nextReserveOf(tokenId);
        uint256 liabilitiesBefore = content.totalClaimable();
        collectSticker(tokenId, user2, user3);

        assertEq(content.ownerOf(tokenId), user3, "payer/recipient ownership");
        assertEq(rewarder.accountToBalance(user1), 0, "old weight survived");
        assertEq(rewarder.accountToBalance(user2), 0, "payer received weight");
        assertEq(rewarder.accountToBalance(user3), newReserve, "recipient weight");
        assertEq(content.accountToClaimable(user1), oldReserve + premium * 4000 / 10_000, "seller proceeds");
        assertEq(content.totalClaimable(), liabilitiesBefore + oldReserve + premium, "liability delta");
        assertCoreSolvency();
    }

    function testSelfTradeRoleOverlapCannotCreateUnbackedWeight() public {
        vm.prank(deployer);
        core.setProtocolFeeAddress(creator);
        vm.prank(launcher);
        content.setTeam(creator);
        uint256 tokenId = createSticker(creator);
        collectSticker(tokenId, creator, creator);

        uint256 reserve = content.reserveOf(tokenId);
        uint256 premium = content.totalClaimable();
        assertEq(rewarder.accountToBalance(creator), reserve, "self-trade weight");
        assertEq(content.accountToClaimable(creator), premium * 7000 / 10_000, "controlled premium shares");
        assertEq(content.accountToClaimable(address(auction)), premium * 3000 / 10_000, "treasury premium");
        assertCoreSolvency();
    }

    function testSurrenderCooldownThenAtomicBurnRefundAndWeightRemoval() public {
        uint256 tokenId = createSticker(creator);
        collectSticker(tokenId, user1, user1);
        uint256 reserve = content.reserveOf(tokenId);
        uint256 balanceBefore = quote.balanceOf(user1);

        vm.prank(user1);
        vm.expectRevert(Content.Content__SurrenderCooldown.selector);
        content.surrender(tokenId);

        vm.warp(currentTime() + DAY);
        vm.prank(user1);
        content.surrender(tokenId);

        assertEq(content.reserveOf(tokenId), 0, "burned reserve");
        assertEq(rewarder.accountToBalance(user1), 0, "burned weight");
        assertEq(quote.balanceOf(user1), balanceBefore + reserve, "refund");
        assertEq(content.totalSupply(), 0, "live supply");
        vm.expectRevert(bytes("ERC721: invalid token ID"));
        content.ownerOf(tokenId);
        assertCoreSolvency();
    }

    function testSafeReceiverAllowsSmartWalletAndBlocksCallbackReentrancy() public {
        uint256 tokenId = createSticker(creator);
        ReentrantNFTWallet wallet = new ReentrantNFTWallet(content);
        collectSticker(tokenId, user1, address(wallet));
        assertTrue(wallet.callbackAttempted(), "receiver callback missing");
        assertFalse(wallet.reentrancySucceeded(), "callback reentrancy succeeded");
        assertEq(content.ownerOf(tokenId), address(wallet), "smart wallet owner");
        assertEq(rewarder.accountToBalance(address(wallet)), content.reserveOf(tokenId), "smart wallet weight");

        uint256 secondToken = createSticker(creator);
        MockNonNFTReceiver invalid = new MockNonNFTReceiver();
        uint256 price = content.getPrice(secondToken);
        vm.startPrank(user2);
        quote.approve(address(content), price);
        vm.expectRevert(bytes("ERC721: transfer to non ERC721Receiver implementer"));
        content.collect(address(invalid), secondToken, 0, currentTime(), price);
        vm.stopPrank();
        assertEq(content.reserveOf(secondToken), 0, "reverted receiver changed reserve");
    }

    function testRewardEmissionAccrualClaimAndZeroStakePause() public {
        vm.warp(minter.activePeriod() + WEEK);
        minter.updatePeriod();
        uint256 finishBefore = rewarder.left(address(coin));
        assertTrue(finishBefore > 0, "reward not notified");
        vm.warp(currentTime() + DAY);
        uint256 tokenId = createSticker(creator);
        collectSticker(tokenId, user1, user1);
        vm.warp(currentTime() + DAY);
        uint256 earned = rewarder.earned(user1, address(coin));
        assertApproxEqAbs(earned, finishBefore / 7, 1e12, "one-day reward");
        rewarder.getReward(user1, address(coin));
        assertEq(coin.balanceOf(user1), earned, "reward claim");
    }

    function testAuctionExpiryUsesFloorAndBurnsExactLP() public {
        quote.mint(address(auction), 50 * USDC);
        vm.warp(currentTime() + DAY);
        uint256 price = auction.getPrice();
        assertEq(price, auction.minInitPrice(), "auction floor");
        lp.mint(user1, price);
        address[] memory assets = new address[](1);
        assets[0] = address(quote);
        uint256 deadBefore = lp.balanceOf(core.DEAD_ADDRESS());
        vm.startPrank(user1);
        lp.approve(address(auction), price);
        auction.buy(assets, user1, 0, currentTime(), price);
        vm.stopPrank();
        assertEq(lp.balanceOf(core.DEAD_ADDRESS()), deadBefore + price, "LP burn payment");
        assertEq(quote.balanceOf(user1), 1_000_000_000 * USDC + 50 * USDC, "auction asset receipt");
        assertEq(auction.epochId(), 1, "auction epoch");
    }

    function testMulticallProtectsPrefundedBalanceAndClearsAllowance() public {
        uint256 tokenId = createSticker(creator);
        uint256 stranded = 123 * USDC;
        vm.prank(creator);
        quote.transfer(address(multicall), stranded);
        uint256 price = content.getPrice(tokenId);
        uint256 maximum = price + 7 * USDC;
        vm.startPrank(user1);
        quote.approve(address(multicall), maximum);
        multicall.collect(address(content), tokenId, 0, currentTime(), maximum);
        vm.stopPrank();
        assertEq(quote.balanceOf(address(multicall)), stranded, "prefund stolen");
        assertEq(quote.allowance(address(multicall), address(content)), 0, "residual allowance");
        assertCoreSolvency();
    }

    function testAccessControlsAndFailureSelectors() public {
        vm.prank(user1);
        vm.expectRevert(bytes("Ownable: caller is not the owner"));
        content.setTeam(user1);

        vm.prank(user1);
        vm.expectRevert(Rewarder.Rewarder__NotContent.selector);
        rewarder.deposit(user1, USDC);

        uint256 tokenId = createSticker(creator);
        vm.prank(user1);
        vm.expectRevert(Content.Content__TransferDisabled.selector);
        content.approve(user2, tokenId);

        vm.prank(user1);
        vm.expectRevert(Multicall.Multicall__InvalidContent.selector);
        multicall.collect(user2, 1, 0, currentTime(), USDC);
    }
}
