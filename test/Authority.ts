// test/Authority.test.ts
import { ethers } from "hardhat";
import { Signer, Contract } from "ethers";
import { expect } from "chai";

describe("Authority", function () {
  let authority: Contract;
  let owner: Signer;
  let borrower1: Signer;
  let borrower2: Signer;
  let lender1: Signer;
  let lender2: Signer;
  let admin1: Signer;
  let admin2: Signer;

  beforeEach(async function () {
    [owner, borrower1, borrower2, lender1, lender2, admin1, admin2] =
      await ethers.getSigners();
    const AuthorityFactory = await ethers.getContractFactory("Authority");
    authority = await AuthorityFactory.deploy();
    await authority.deployed();
    await authority.initialize();
    await authority.connect(owner).addAdmin(await admin1.getAddress());
  });

  describe("addBorrower", function () {
    it("should add a borrower to the whitelist as owner", async function () {
      await authority.connect(owner).addBorrower(await borrower1.getAddress());
      expect(
        await authority.isWhitelistedBorrower(await borrower1.getAddress())
      ).to.be.true;
    });

    it("should add a borrower to the whitelist as admin", async function () {
      await authority.connect(admin1).addBorrower(await borrower1.getAddress());
      expect(
        await authority.isWhitelistedBorrower(await borrower1.getAddress())
      ).to.be.true;
    });

    it("should not allow a non-owner to add a borrower", async function () {
      await expect(
        authority.connect(borrower1).addBorrower(await borrower2.getAddress())
      ).to.be.revertedWith("Authority: caller is not the owner or admin");
      expect(
        await authority.isWhitelistedBorrower(await borrower2.getAddress())
      ).to.be.false;
    });
  });

  describe("removeBorrower", function () {
    beforeEach(async function () {
      await authority.connect(owner).addBorrower(await borrower1.getAddress());
    });

    it("should remove a borrower from the whitelist as owner", async function () {
      await authority
        .connect(owner)
        .removeBorrower(await borrower1.getAddress());
      expect(
        await authority.isWhitelistedBorrower(await borrower1.getAddress())
      ).to.be.false;
    });

    it("should remove a borrower from the whitelist as admin", async function () {
      await authority
        .connect(admin1)
        .removeBorrower(await borrower1.getAddress());
      expect(
        await authority.isWhitelistedBorrower(await borrower1.getAddress())
      ).to.be.false;
    });

    it("should not allow a non-owner to remove a borrower", async function () {
      await expect(
        authority
          .connect(borrower1)
          .removeBorrower(await borrower1.getAddress())
      ).to.be.revertedWith("Authority: caller is not the owner or admin");
      expect(
        await authority.isWhitelistedBorrower(await borrower1.getAddress())
      ).to.be.true;
    });
  });

  describe("allBorrowers", function () {
    beforeEach(async function () {
      await authority.connect(owner).addBorrower(await borrower1.getAddress());
      await authority.connect(owner).addBorrower(await borrower2.getAddress());
    });

    it("should return an array of all whitelisted borrower addresses", async function () {
      const expected = [
        await borrower1.getAddress(),
        await borrower2.getAddress(),
      ];
      const actual = await authority.allBorrowers();
      expect(actual).to.have.members(expected);
    });
  });

  describe("addLender", function () {
    it("should add a lender to the whitelist as owner", async function () {
      await authority.connect(owner).addLender(await lender1.getAddress());
      expect(await authority.isWhitelistedLender(await lender1.getAddress())).to
        .be.true;
    });

    it("should add a lender to the whitelist as admin", async function () {
      await authority.connect(admin1).addLender(await lender1.getAddress());
      expect(await authority.isWhitelistedLender(await lender1.getAddress())).to
        .be.true;
    });

    it("should not allow a non-owner to add a lender", async function () {
      await expect(
        authority.connect(lender1).addLender(await lender2.getAddress())
      ).to.be.revertedWith("Authority: caller is not the owner or admin");
      expect(await authority.isWhitelistedLender(await lender2.getAddress())).to
        .be.false;
    });
  });

  describe("removeLender", function () {
    beforeEach(async function () {
      await authority.connect(owner).addLender(await lender1.getAddress());
    });

    it("should remove a lender from the whitelist as owner", async function () {
      await authority.connect(owner).removeLender(await lender1.getAddress());
      expect(await authority.isWhitelistedLender(await lender1.getAddress())).to
        .be.false;
    });

    it("should remove a lender from the whitelist as admin", async function () {
      await authority.connect(admin1).removeLender(await lender1.getAddress());
      expect(await authority.isWhitelistedLender(await lender1.getAddress())).to
        .be.false;
    });

    it("should not allow a non-owner to remove a lender", async function () {
      await expect(
        authority.connect(lender1).removeLender(await lender1.getAddress())
      ).to.be.revertedWith("Authority: caller is not the owner or admin");
      expect(await authority.isWhitelistedLender(await lender1.getAddress())).to
        .be.true;
    });
  });

  describe("allLenders", function () {
    beforeEach(async function () {
      await authority.connect(owner).addLender(await lender1.getAddress());
      await authority.connect(owner).addLender(await lender2.getAddress());
    });

    it("should return an array of all whitelisted lender addresses", async function () {
      const expected = [await lender1.getAddress(), await lender2.getAddress()];
      const actual = await authority.allLenders();
      expect(actual).to.have.members(expected);
    });
  });

  describe("addAdmin", function () {
    it("should add an admin to the whitelist as owner", async function () {
      await authority.connect(owner).addAdmin(await admin2.getAddress());
      expect(await authority.isAdmin(await admin2.getAddress())).to.be.true;
    });

    it("should add an admin to the whitelist as admin", async function () {
      await authority.connect(admin1).addAdmin(await admin2.getAddress());
      expect(await authority.isAdmin(await admin2.getAddress())).to.be.true;
    });

    it("should not allow a non-owner to add an admin", async function () {
      await expect(
        authority.connect(lender1).addAdmin(await admin2.getAddress())
      ).to.be.revertedWith("Authority: caller is not the owner or admin");
      expect(await authority.isAdmin(await admin2.getAddress())).to.be.false;
    });
  });

  describe("removeAdmin", function () {
    beforeEach(async function () {
      await authority.connect(owner).addAdmin(await admin1.getAddress());
    });

    it("should remove an admin from the whitelist as owner", async function () {
      await authority.connect(owner).removeAdmin(await admin1.getAddress());
      expect(await authority.isAdmin(await admin1.getAddress())).to.be.false;
    });

    it("should remove an admin from the whitelist as admin", async function () {
      await authority.connect(admin1).removeAdmin(await admin1.getAddress());
      expect(await authority.isAdmin(await admin1.getAddress())).to.be.false;
    });

    it("should not allow a non-owner to remove an admin", async function () {
      await expect(
        authority.connect(lender1).removeAdmin(await admin1.getAddress())
      ).to.be.revertedWith("Authority: caller is not the owner or admin");
      expect(await authority.isAdmin(await admin1.getAddress())).to.be.true;
    });
  });

  describe("allAdmins", function () {
    beforeEach(async function () {
      await authority.connect(owner).addAdmin(await admin1.getAddress());
      await authority.connect(owner).addAdmin(await admin2.getAddress());
    });

    it("should return an array of all whitelisted admin addresses", async function () {
      const expected = [await admin1.getAddress(), await admin2.getAddress()];
      const actual = await authority.allAdmins();
      expect(actual).to.have.members(expected);
    });
  });
});
