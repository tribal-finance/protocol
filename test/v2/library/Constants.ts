import { expect } from "chai";
import { ethers } from "hardhat";
import {
    POOL_STORAGE_READER,
    POOL_STORAGE_WRITER,
    DEPLOYER,
    ADMIN,
    OWNER,
    LENDER,
    BORROWER,
    PROTOCOL
} from "../utils/constants";
import { TestConstants } from "../../../typechain-types";

describe("TestConstants Contract", function() {
    let testConstants: TestConstants;

    before(async function() {
        const TestConstants = await ethers.getContractFactory("TestConstants");
        testConstants = await TestConstants.deploy();
    });

    describe("Constants", function() {
        it("should have the correct POOL_STORAGE_READER value", async function() {
            expect(await testConstants.getPoolStorageReader()).to.equal(POOL_STORAGE_READER);
        });

        it("should have the correct POOL_STORAGE_WRITER value", async function() {
            expect(await testConstants.getPoolStorageWriter()).to.equal(POOL_STORAGE_WRITER);
        });

        it("should have the correct DEPLOYER value", async function() {
            expect(await testConstants.getDeployer()).to.equal(DEPLOYER);
        });

        it("should have the correct ADMIN value", async function() {
            expect(await testConstants.getAdmin()).to.equal(ADMIN);
        });

        it("should have the correct OWNER value", async function() {
            expect(await testConstants.getOwner()).to.equal(OWNER);
        });

        it("should have the correct LENDER value", async function() {
            expect(await testConstants.getLender()).to.equal(LENDER);
        });

        it("should have the correct BORROWER value", async function() {
            expect(await testConstants.getBorrower()).to.equal(BORROWER);
        });

        it("should have the correct PROTOCOL value", async function() {
            expect(await testConstants.getProtocol()).to.equal(PROTOCOL);
        });
    });
});
