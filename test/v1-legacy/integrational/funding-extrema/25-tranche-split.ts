import { expect } from "chai";
import { ethers } from "hardhat";
import { Signer } from "ethers";

import { loadFixture } from "@nomicfoundation/hardhat-network-helpers";
import setupUSDC, { USDC_PRECISION, USDC_ADDRESS_6 } from "../../helpers/usdc";
import { DEFAULT_LENDING_POOL_PARAMS, deployUnitranchePool } from "../../../../lib/pool_deployments";

import {
    ITestUSDC,
    LendingPool,
    PoolFactory,
    TrancheVault,
    PlatformToken,
} from "../../../../typechain-types";
import { USDC, WAD } from "../../helpers/conversion";
import {
    DeployedContractsType,
    deployFactoryAndImplementations,
    _getDeployedContracts,
    deployPlatformToken,
} from "../../../../lib/pool_deployments";
import testSetup from "../../helpers/usdc";
import STAGES from "../../helpers/stages";

const deterministicRand = (seed: number) => {
    const numbers = []
    for(let i = 0; i < 25; i++) {
        const rand = Math.sqrt(Math.abs((100000 + seed)* Math.sin(i * 32)));
        const str = rand.toString().substring(4, 8);
        numbers.push(parseFloat(str) || 12);
    }
    const total = numbers.reduce((acc, val) => acc + val, 0); 
    const normalized = numbers.map(num => Math.round((num / total) * 100)); 

    // rounding error
    normalized[0] += 1;

    let sum = 0;
    const fundingSplitWads = []
    for(let i = 0; i < 25; i++) {
        sum += normalized[i];
        fundingSplitWads.push(WAD(normalized[i] / 100))
    }
    expect(sum).equals(100)
    return fundingSplitWads
}

describe.skip("Deploy lending with 25 vaults, fine granularity test", function () {
    context("For unitranche pool", async function () {
        async function uniPoolFixture() {
            const { signers, usdc } = await testSetup();
            const [deployer, lender1, lender2, lender3, borrower, foundation] =
                signers;
            const lenders = [lender1, lender2, lender3];

            const platformToken = await deployPlatformToken(
                deployer,
                lenders,
                foundation.address
            );

            const poolFactory: PoolFactory = await deployFactoryAndImplementations(
                deployer,
                borrower,
                lenders,
                foundation.address
            );

            const afterDeploy = async (contracts: DeployedContractsType) => {
                return contracts;
            };

            const data = await deployUnitranchePool(
                poolFactory,
                deployer,
                borrower,
                lenders,
                {
                    platformTokenContractAddress: platformToken.address,
                },
                afterDeploy
            );

            return {
                ...data,
                usdc,
                ...(await _getDeployedContracts(poolFactory)),
                platformToken,
            };
        }

        let usdc: ITestUSDC,
            platformToken: PlatformToken,
            lendingPool: LendingPool,
            firstTrancheVault: TrancheVault,
            poolFactory: PoolFactory,
            deployer: Signer,
            borrower: Signer,
            lender1: Signer,
            lender2: Signer;

        before(async () => {
            const data = await loadFixture(uniPoolFixture);
            usdc = data.usdc;
            platformToken = data.platformToken;
            lendingPool = data.lendingPool;
            firstTrancheVault = data.firstTrancheVault;
            poolFactory = data.poolFactory;
            deployer = data.deployer;
            borrower = data.borrower;
            lender1 = data.lenders[0];
            lender2 = data.lenders[1];
        });

        it("Properly sets each min/max in tranche", async () => {
            const defaultParams = DEFAULT_LENDING_POOL_PARAMS;

            defaultParams.platformTokenContractAddress = await lendingPool.platformTokenContractAddress();
            defaultParams.stableCoinContractAddress = await lendingPool.stableCoinContractAddress();
            defaultParams.maxFundingCapacity = ethers.utils.parseUnits("420", 6 + 6); // $4200k
            defaultParams.minFundingCapacity = ethers.utils.parseUnits("69", 6 + 6); // $690k
            defaultParams.tranchesCount = 25;
            defaultParams.trancheAPRsWads = Array(25).fill(1);
            defaultParams.trancheBoostRatios = Array(25).fill(1);
            defaultParams.trancheBoostedAPRsWads =  Array(25).fill(1);

            const mins = deterministicRand(0)
            const maxs = deterministicRand(10)

            const fundingSplitsWads = []
            for(let i = 0; i < 25; i++) {
                fundingSplitsWads.push([maxs[i], mins[i]])
            }

            const lendingPoolParams = { ...defaultParams, borrowerAddress: await borrower.getAddress() };
            const poolAddr = await poolFactory.callStatic.deployPool(lendingPoolParams, fundingSplitsWads); 
            await poolFactory.deployPool(lendingPoolParams, fundingSplitsWads);

            const lendingPoolGen2 = await ethers.getContractAt("LendingPool", poolAddr)

            expect(await lendingPoolGen2.tranchesCount()).equals(25)

            let totalVMin = ethers.BigNumber.from(0);
            let totalVMax = ethers.BigNumber.from(0);
            const formattedTotalMin = ethers.utils.formatUnits(defaultParams.minFundingCapacity, 6);
            const formattedTotalMax = ethers.utils.formatUnits(defaultParams.maxFundingCapacity, 6);
            for(let i = 0; i < 25; i++) {
                const tranche = await ethers.getContractAt("TrancheVault", await lendingPoolGen2.trancheVaultAddresses(i));
                const vMin = await tranche.minFundingCapacity();
                const vMax = await tranche.maxFundingCapacity();

                totalVMin = vMin.add(totalVMin);
                totalVMax = vMax.add(totalVMax)


                const formattedSliceMin = ethers.utils.formatEther(mins[i])
                const formattedSliceMax = ethers.utils.formatEther(maxs[i])

                const expectedMinFundingCapacity = parseFloat(formattedTotalMin) * parseFloat(formattedSliceMin);
                const expectedMaxFundingCapacity = parseFloat(formattedTotalMax) * parseFloat(formattedSliceMax);
                
                const formattedVmin = parseInt(ethers.utils.formatUnits(vMin, 6));
                const formattedVmax = parseInt(ethers.utils.formatUnits(vMax, 6));

                expect(parseInt(expectedMinFundingCapacity.toString())).equals(formattedVmin)
                expect(parseInt(expectedMaxFundingCapacity.toString())).equals(formattedVmax)
            }

            // ensures total sum of vault mins/max match global min/max set in lending pool
            // proof number partitioning is working as expected and gives very granular settings for min/maxs for each vault
            expect(totalVMax).equals(defaultParams.maxFundingCapacity)
            expect(totalVMin).equals(defaultParams.minFundingCapacity);

        })
    });
});