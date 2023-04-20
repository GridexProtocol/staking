import {ethers, network} from "hardhat";
import {expect} from "chai";
import {loadFixture} from "@nomicfoundation/hardhat-network-helpers";
import {MyERC20, Staking} from "../typechain-types";

describe("Staking", () => {
    async function deployFixture() {
        const signers = await ethers.getSigners();

        const erc20factory = await ethers.getContractFactory("MyERC20");
        const erc20 = (await erc20factory.deploy()) as MyERC20;
        await erc20.deployed();

        const stakingFactory = await ethers.getContractFactory("Staking");
        const staking = (await stakingFactory.deploy(erc20.address)) as Staking;
        await staking.deployed();

        await erc20.mint(signers[0].address, 10n ** 18n);
        await erc20.mint(signers[1].address, 10n ** 18n);
        await erc20.connect(signers[0]).approve(staking.address, 10n ** 18n * 2n);
        await erc20.connect(signers[1]).approve(staking.address, 10n ** 18n / 2n);

        return {
            owner: signers[0],
            otherAccount: signers[1],
            erc20: erc20,
            staking: staking,
        };
    }

    describe("#stake", () => {
        it("should revert with right error if amount is zero", async () => {
            const {staking} = await loadFixture(deployFixture);
            await expect(staking.stake(0)).to.revertedWith("Staking: amount must be greater than 0");
        });

        it("should revert with right error if allowance is not enough", async () => {
            const {otherAccount, staking} = await loadFixture(deployFixture);
            await expect(staking.connect(otherAccount).stake(10n ** 18n)).to.revertedWith(
                "ERC20: insufficient allowance"
            );
        });

        it("should revert with right error if balance is not enough", async () => {
            const {owner, staking} = await loadFixture(deployFixture);
            await expect(staking.connect(owner).stake(10n ** 18n * 2n)).to.revertedWith(
                "ERC20: transfer amount exceeds balance"
            );
        });

        it("should transfer tokens from sender to contract", async () => {
            const {owner, staking, erc20} = await loadFixture(deployFixture);
            await expect(staking.connect(owner).stake(10n ** 18n))
                .to.emit(staking, "Stake")
                .withArgs(1, owner.address, 10n ** 18n);
            expect(await erc20.balanceOf(owner.address)).to.equal(0n);
            expect(await erc20.balanceOf(staking.address)).to.equal(10n ** 18n);
            const {owner: ownerStr, amount, redeemableTime} = await staking.stakingInfos(1);
            expect(ownerStr).to.equal(owner.address);
            expect(amount).to.equal(10n ** 18n);
            expect(redeemableTime).to.equal(0);
        });

        it("staking id should be incremented", async () => {
            const {owner, staking} = await loadFixture(deployFixture);
            await expect(staking.connect(owner).stake(10n ** 18n / 2n))
                .to.emit(staking, "Stake")
                .withArgs(1, owner.address, 10n ** 18n / 2n);
            await expect(staking.connect(owner).stake(10n ** 18n / 2n))
                .to.emit(staking, "Stake")
                .withArgs(2, owner.address, 10n ** 18n / 2n);
        });
    });

    describe("#unstake", () => {
        it("should revert with right error if staking id is not found", async () => {
            const {staking} = await loadFixture(deployFixture);
            await expect(staking.unstake(1)).to.revertedWith("Staking: not owner");
        });

        it("should revert with right error if owner not match", async () => {
            const {otherAccount, staking} = await loadFixture(deployFixture);
            await staking.stake(10n ** 18n);
            await expect(staking.connect(otherAccount).unstake(1)).to.revertedWith("Staking: not owner");
        });

        it("should revert with right error if redeemable time is greater than 0", async () => {
            const {owner, staking} = await loadFixture(deployFixture);
            await staking.connect(owner).stake(10n ** 18n);
            await staking.unstake(1);
            await expect(staking.unstake(1)).to.revertedWith("Staking: already unstaked");
        });

        it("should update redeemable time", async () => {
            const {owner, staking} = await loadFixture(deployFixture);
            await staking.connect(owner).stake(10n ** 18n);
            const time = Math.floor(new Date().getTime() / 1000) + 24 * 60 * 60;
            await expect(staking.unstake(1))
                .to.emit(staking, "Unstake")
                .withArgs(1, (t: number) => t >= time);
            const {redeemableTime} = await staking.stakingInfos(1);
            expect(redeemableTime).to.greaterThanOrEqual(time);
        });
    });

    describe("#redeem", () => {
        it("should revert with right error if staking id is not found", async () => {
            const {staking} = await loadFixture(deployFixture);
            await expect(staking.redeem(1)).to.revertedWith("Staking: not owner");
        });

        it("should revert with right error if owner not match", async () => {
            const {otherAccount, staking} = await loadFixture(deployFixture);
            await staking.stake(10n ** 18n);
            await staking.unstake(1);
            await expect(staking.connect(otherAccount).redeem(1)).to.revertedWith("Staking: not owner");
        });

        it("should revert with right error if not unstaked", async () => {
            const {staking} = await loadFixture(deployFixture);
            await staking.stake(10n ** 18n);
            await expect(staking.redeem(1)).to.revertedWith("Staking: not unstaked");
        });

        it("should revert with right error if redeemable time is not reached", async () => {
            const {staking} = await loadFixture(deployFixture);
            await staking.stake(10n ** 18n);
            await staking.unstake(1);
            await expect(staking.redeem(1)).to.revertedWith("Staking: not redeemable");
        });

        it("should revert with right error if redeem twice", async () => {
            const {staking} = await loadFixture(deployFixture);
            await staking.stake(10n ** 18n);
            await staking.unstake(1);
            await network.provider.send("evm_increaseTime", [24 * 60 * 60]);
            await staking.redeem(1);
            await expect(staking.redeem(1)).to.revertedWith("Staking: not owner");
        });

        it("should transfer tokens from contract to owner", async () => {
            const {owner, staking, erc20} = await loadFixture(deployFixture);
            await staking.stake(10n ** 18n);
            await staking.unstake(1);
            await network.provider.send("evm_increaseTime", [24 * 60 * 60]);
            await expect(staking.redeem(1)).to.emit(staking, "Redeem").withArgs(1);
            expect(await erc20.balanceOf(owner.address)).to.equal(10n ** 18n);
            expect(await erc20.balanceOf(staking.address)).to.equal(0n);
        });
    });
});
