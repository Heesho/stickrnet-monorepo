// SPDX-License-Identifier: MIT
pragma solidity 0.8.19;

import {TestBase} from "./TestBase.sol";
import {Core} from "../../contracts/Core.sol";
import {Content} from "../../contracts/Content.sol";
import {Rewarder} from "../../contracts/Rewarder.sol";
import {Minter} from "../../contracts/Minter.sol";
import {Auction} from "../../contracts/Auction.sol";
import {Coin} from "../../contracts/Coin.sol";
import {Multicall} from "../../contracts/Multicall.sol";
import {CoinFactory} from "../../contracts/CoinFactory.sol";
import {ContentFactory} from "../../contracts/ContentFactory.sol";
import {MinterFactory} from "../../contracts/MinterFactory.sol";
import {RewarderFactory} from "../../contracts/RewarderFactory.sol";
import {AuctionFactory} from "../../contracts/AuctionFactory.sol";
import {MockUSDC} from "../../contracts/mocks/MockUSDC.sol";
import {MockLP, MockUniswapV2Factory, MockUniswapV2Router} from "../../contracts/mocks/MockUniswapV2.sol";

abstract contract ProtocolFixture is TestBase {
    uint256 internal constant BASE_TIME = 1_800_000_000;
    uint256 internal constant DAY = 1 days;
    uint256 internal constant WEEK = 7 days;
    uint256 internal constant USDC = 1e6;
    uint256 internal constant TOKEN = 1e18;

    address internal deployer;
    address internal protocol;
    address internal launcher;
    address internal creator;
    address internal user1;
    address internal user2;
    address internal user3;

    MockUSDC internal quote;
    MockUniswapV2Factory internal uniswapFactory;
    MockUniswapV2Router internal router;
    CoinFactory internal coinFactory;
    ContentFactory internal contentFactory;
    MinterFactory internal minterFactory;
    RewarderFactory internal rewarderFactory;
    AuctionFactory internal auctionFactory;
    Core internal core;
    Multicall internal multicall;

    Coin internal coin;
    Content internal content;
    Rewarder internal rewarder;
    Minter internal minter;
    Auction internal auction;
    MockLP internal lp;

    function setUp() public virtual {
        vm.warp(BASE_TIME);
        vm.roll(1);
        deployer = vm.addr(1);
        protocol = vm.addr(2);
        launcher = vm.addr(3);
        creator = vm.addr(4);
        user1 = vm.addr(5);
        user2 = vm.addr(6);
        user3 = vm.addr(7);

        vm.label(deployer, "deployer");
        vm.label(protocol, "protocol");
        vm.label(launcher, "launcher-team");
        vm.label(creator, "creator");
        vm.label(user1, "user1");
        vm.label(user2, "user2");
        vm.label(user3, "user3");

        vm.startPrank(deployer);
        quote = new MockUSDC();
        uniswapFactory = new MockUniswapV2Factory();
        router = new MockUniswapV2Router(address(uniswapFactory));
        coinFactory = new CoinFactory();
        contentFactory = new ContentFactory();
        minterFactory = new MinterFactory();
        rewarderFactory = new RewarderFactory();
        auctionFactory = new AuctionFactory();
        core = new Core(
            address(quote),
            address(uniswapFactory),
            address(router),
            address(coinFactory),
            address(contentFactory),
            address(minterFactory),
            address(auctionFactory),
            address(rewarderFactory),
            protocol,
            10 * USDC
        );
        multicall = new Multicall(address(core), address(quote));
        vm.stopPrank();

        address[5] memory funded = [launcher, creator, user1, user2, user3];
        for (uint256 i; i < funded.length; ++i) {
            quote.mint(funded[i], 1_000_000_000 * USDC);
        }

        Core.LaunchParams memory params = defaultLaunchParams(launcher);
        vm.startPrank(launcher);
        quote.approve(address(core), params.quoteAmount);
        (
            address coinAddress,
            address contentAddress,
            address minterAddress,
            address rewarderAddress,
            address auctionAddress,
            address lpAddress
        ) = core.launch(params);
        vm.stopPrank();

        coin = Coin(coinAddress);
        content = Content(contentAddress);
        minter = Minter(minterAddress);
        rewarder = Rewarder(rewarderAddress);
        auction = Auction(auctionAddress);
        lp = MockLP(lpAddress);
    }

    function defaultLaunchParams(address owner) internal pure returns (Core.LaunchParams memory params) {
        params = Core.LaunchParams({
            launcher: owner,
            tokenName: "Stickr Verification",
            tokenSymbol: "STV",
            uri: "ipfs://verification",
            quoteAmount: 100 * USDC,
            coinAmount: 1_000_000 * TOKEN,
            initialUps: TOKEN,
            tailUps: TOKEN / 100,
            halvingPeriod: WEEK,
            contentMinInitPrice: 100 * USDC,
            contentIsModerated: false,
            auctionInitPrice: TOKEN,
            auctionEpochPeriod: DAY,
            auctionPriceMultiplier: 15e17,
            auctionMinInitPrice: 1e6
        });
    }

    function createSticker(address owner) internal returns (uint256 tokenId) {
        vm.prank(creator);
        tokenId = content.create(owner, "ipfs://sticker");
    }

    function collectSticker(uint256 tokenId, address payer, address recipient)
        internal
        returns (uint256 price, uint256 oldReserve, uint256 newReserve, uint256 premium)
    {
        price = content.getPrice(tokenId);
        oldReserve = content.reserveOf(tokenId);
        premium = content.premiumOf(tokenId);
        newReserve = content.nextReserveOf(tokenId);
        vm.startPrank(payer);
        quote.approve(address(content), price);
        content.collect(recipient, tokenId, content.idToEpochId(tokenId), currentTime(), price);
        vm.stopPrank();
    }

    function assertCoreSolvency() internal view {
        assertEq(rewarder.totalSupply(), content.totalReserved(), "reward supply != total reserve");
        assertGe(
            quote.balanceOf(address(content)),
            content.totalReserved() + content.totalClaimable(),
            "quote does not cover liabilities"
        );
    }
}
