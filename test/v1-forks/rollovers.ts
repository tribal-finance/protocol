import { ethers, network } from "hardhat";
import { ERC20, LendingPool, TestExecutor } from "../../typechain-types"
import { expect } from "chai";


describe("Rollover Fork Test", async () => {


    let lendingPool30DayCard: LendingPool;
    let lendingPool60DayWorkingCapital: LendingPool;

    let usdc: ERC20;

    let adminMultisig: TestExecutor;
    let borrowerMultisig: TestExecutor;
    let lenderMultisig: TestExecutor;

    before(async () => {
        await network.provider.request({
            method: "hardhat_reset",
            params: [{
                forking: {
                    jsonRpcUrl: process.env.MAINNET_FORK_ALCHEMY_URL,
                    blockNumber: 18666591
                }
            }]
        });

        lendingPool30DayCard = await ethers.getContractAt("LendingPool", "0x004B93E4f3BEb2a450D0b83CdaD71D757AB075f6")
        lendingPool60DayWorkingCapital = await ethers.getContractAt("LendingPool", "0x0132071033B399fc44308df578d7ceA685E12057")

        usdc = await ethers.getContractAt("ERC20", "0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48")

        const TestExecutor = await ethers.getContractFactory("TestExecutor");
        const testExecutor = await TestExecutor.deploy();
        await testExecutor.deployed();

        const bytecode = await ethers.provider.getCode(testExecutor.address);

        adminMultisig = await ethers.getContractAt("TestExecutor", "0x3346Dd2231de8707FDF673202D790E0B87239f86");
        borrowerMultisig = await ethers.getContractAt("TestExecutor", "0xb748289127A08AFe00948594Bf431FF138C9e9d4")
        lenderMultisig = await ethers.getContractAt("TestExecutor", "0x4BAb1a74f32434cc5AE4D7Df2Ec83a60B3fe507E")
        
        await network.provider.send("hardhat_setCode", [
            adminMultisig.address,
            bytecode
        ]);

        await network.provider.send("hardhat_setCode", [
            borrowerMultisig.address,
            bytecode
        ]);

        await network.provider.send("hardhat_setCode", [
            lenderMultisig.address,
            bytecode
        ]);
    })

    it("Should be able to enable rollovers (30 day card)", async () => {
        expect((await lendingPool30DayCard.lenderRollOverSettings(lenderMultisig.address)).enabled).equals(false);
        const encoding = lendingPool30DayCard.interface.encodeFunctionData("lenderEnableRollOver", [true, true, true])
        await lenderMultisig.execute(lendingPool30DayCard.address, encoding);
        expect((await lendingPool30DayCard.lenderRollOverSettings(lenderMultisig.address)).enabled).equals(true);
    })

    it("Should be able to enable rollovers (60 day working captial)", async () => {
        expect((await lendingPool60DayWorkingCapital.lenderRollOverSettings(lenderMultisig.address)).enabled).equals(false);
        const encoding = lendingPool60DayWorkingCapital.interface.encodeFunctionData("lenderEnableRollOver", [true, true, true])
        await lenderMultisig.execute(lendingPool60DayWorkingCapital.address, encoding);
        expect((await lendingPool60DayWorkingCapital.lenderRollOverSettings(lenderMultisig.address)).enabled).equals(true);
   })
})