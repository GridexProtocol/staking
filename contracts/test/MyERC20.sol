// SPDX-License-Identifier: UNLICENSED
pragma solidity ^0.8.0;
import "@openzeppelin/contracts/token/ERC20/ERC20.sol";

contract MyERC20 is ERC20 {
    constructor() ERC20("Token", "TKN") {}

    function mint(address account, uint256 amount) public {
        _mint(account, amount);
    }
}
