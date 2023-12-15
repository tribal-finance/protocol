import { ethers } from 'hardhat';
import { expect } from 'chai';
import { Contract, Signer } from 'ethers';

describe('EmptyToken', function () {
    let EmptyToken: Contract;
    let accounts: Signer[];

    beforeEach(async function () {
        accounts = await ethers.getSigners();
        const EmptyTokenFactory = await ethers.getContractFactory('EmptyToken');
        EmptyToken = await EmptyTokenFactory.deploy();
        await EmptyToken.deployed();

        const totalSupply = await EmptyToken.totalSupply();
        expect(totalSupply).to.equal(0);
    });

    it('should transfer when sender has enough balance', async function () {
        const initialBalance = await EmptyToken.balanceOf(await accounts[0].getAddress());
        
        await EmptyToken.transfer(await accounts[1].getAddress(), initialBalance);
        expect(await EmptyToken.callStatic.transfer(await accounts[1].getAddress(), initialBalance)).equals(true);

        const totalSupply = await EmptyToken.totalSupply();
        expect(totalSupply).to.equal(0);
    });

    it('should not transfer when sender has insufficient balance but return true', async function () {
        const initialBalance = await EmptyToken.balanceOf(await accounts[0].getAddress());
        const transferValue = initialBalance.add(1);

        await expect(EmptyToken.transfer(await accounts[1].getAddress(), transferValue)).to.not.emit(EmptyToken, 'Transfer');

        const totalSupply = await EmptyToken.totalSupply();
        expect(totalSupply).to.equal(0);
    });

    it('should transferFrom when sender has enough balance and allowance', async function () {
        const initialBalance = await EmptyToken.balanceOf(await accounts[0].getAddress());
        const transferValue = initialBalance.div(2);

        await EmptyToken.approve(await accounts[1].getAddress(), transferValue);

        await EmptyToken.transferFrom(await accounts[0].getAddress(), await accounts[2].getAddress(), initialBalance);
        expect(await EmptyToken.callStatic.transferFrom(await accounts[0].getAddress(), await accounts[2].getAddress(), initialBalance)).equals(true);

        const totalSupply = await EmptyToken.totalSupply();
        expect(totalSupply).to.equal(0);
    });

    it('should not transferFrom when sender has insufficient balance but return true', async function () {
        const initialBalance = await EmptyToken.balanceOf(await accounts[0].getAddress());
        const transferValue = initialBalance.add(1);

        await EmptyToken.approve(await accounts[1].getAddress(), transferValue);
        await expect(EmptyToken.connect(accounts[1]).transferFrom(await accounts[0].getAddress(), await accounts[2].getAddress(), transferValue)).to.not.emit(EmptyToken, 'Transfer');

        const totalSupply = await EmptyToken.totalSupply();
        expect(totalSupply).to.equal(0);
    });

    it('should not transferFrom when sender has insufficient allowance but return true', async function () {
        const initialBalance = await EmptyToken.balanceOf(await accounts[0].getAddress());
        const transferValue = initialBalance.add(1);
        
        await EmptyToken.approve(await accounts[1].getAddress(), transferValue.sub(1));
        await expect(EmptyToken.connect(accounts[1]).transferFrom(await accounts[0].getAddress(), await accounts[2].getAddress(), transferValue)).to.not.emit(EmptyToken, 'Transfer');

        const totalSupply = await EmptyToken.totalSupply();
        expect(totalSupply).to.equal(0);
    });
});
