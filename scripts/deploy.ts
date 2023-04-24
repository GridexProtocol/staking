import {ethers} from "hardhat";

async function main() {
    const factory = await ethers.getContractFactory("Staking");
    const staking = await factory.deploy("0x2F27118E3D2332aFb7d165140Cf1bB127eA6975d");
    await staking.deployed();

    console.log("Staking deployed to:", staking.address);
}

main()
    .then(() => process.exit())
    .catch((error) => {
        console.error(error);
        process.exit(1);
    });
