// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

contract Counter {
    uint256 public count;

    event Incremented(uint256 newCount);

    function increment() public {
        count++;
        emit Incremented(count);
    }

    function add(uint256 amount) public {
        count += amount;
        emit Incremented(count);
    }
}
