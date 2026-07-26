// SPDX-License-Identifier: MIT
pragma solidity 0.8.19;

interface Vm {
    struct Log {
        bytes32[] topics;
        bytes data;
        address emitter;
    }

    function addr(uint256 privateKey) external returns (address);
    function assume(bool condition) external;
    function chainId(uint256 newChainId) external;
    function deal(address account, uint256 newBalance) external;
    function expectEmit(bool checkTopic1, bool checkTopic2, bool checkTopic3, bool checkData, address emitter)
        external;
    function expectRevert(bytes4 revertData) external;
    function expectRevert(bytes calldata revertData) external;
    function getRecordedLogs() external returns (Log[] memory);
    function getBlockTimestamp() external view returns (uint256);
    function label(address account, string calldata newLabel) external;
    function pauseGasMetering() external;
    function prank(address msgSender) external;
    function recordLogs() external;
    function roll(uint256 newHeight) external;
    function resumeGasMetering() external;
    function startPrank(address msgSender) external;
    function stopPrank() external;
    function toString(address value) external pure returns (string memory);
    function toString(bytes32 value) external pure returns (string memory);
    function toString(uint256 value) external pure returns (string memory);
    function warp(uint256 newTimestamp) external;
    function writeFile(string calldata path, string calldata data) external;
    function writeLine(string calldata path, string calldata data) external;
}

abstract contract TestBase {
    Vm internal constant vm = Vm(address(uint160(uint256(keccak256("hevm cheat code")))));

    error AssertionFailed(string message);

    function assertTrue(bool condition, string memory message) internal pure {
        if (!condition) revert AssertionFailed(message);
    }

    function assertFalse(bool condition, string memory message) internal pure {
        if (condition) revert AssertionFailed(message);
    }

    function assertEq(uint256 actual, uint256 expected, string memory message) internal pure {
        if (actual != expected) revert AssertionFailed(message);
    }

    function assertEq(address actual, address expected, string memory message) internal pure {
        if (actual != expected) revert AssertionFailed(message);
    }

    function assertEq(bytes32 actual, bytes32 expected, string memory message) internal pure {
        if (actual != expected) revert AssertionFailed(message);
    }

    function assertEq(bool actual, bool expected, string memory message) internal pure {
        if (actual != expected) revert AssertionFailed(message);
    }

    function assertGe(uint256 actual, uint256 minimum, string memory message) internal pure {
        if (actual < minimum) revert AssertionFailed(message);
    }

    function assertLe(uint256 actual, uint256 maximum, string memory message) internal pure {
        if (actual > maximum) revert AssertionFailed(message);
    }

    function assertApproxEqAbs(uint256 actual, uint256 expected, uint256 tolerance, string memory message)
        internal
        pure
    {
        uint256 difference = actual > expected ? actual - expected : expected - actual;
        if (difference > tolerance) revert AssertionFailed(message);
    }

    function bound(uint256 value, uint256 minimum, uint256 maximum) internal pure returns (uint256) {
        if (minimum > maximum) revert AssertionFailed("invalid bound");
        if (value >= minimum && value <= maximum) return value;
        uint256 size = maximum - minimum + 1;
        return minimum + value % size;
    }

    function currentTime() internal view returns (uint256) {
        return vm.getBlockTimestamp();
    }
}
