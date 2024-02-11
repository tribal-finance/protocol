import { ethers } from "hardhat";
import { Wallet } from "ethers";

export const generateLenders = async (totalLenders: number): Promise<Wallet[]> => {
    let additionalLenders: Wallet[] = [];

    const signers = await ethers.getSigners();

    const fundingAccount = signers[0];
    const promises: Promise<any>[] = [];

    for (let i = 0; i < totalLenders; i++) {
        const wallet: Wallet = Wallet.createRandom().connect(ethers.provider);;

        additionalLenders.push(wallet);

        promises.push(fundingAccount.sendTransaction({
            to: wallet.address,
            value: ethers.utils.parseEther(".1"),
        }));
    }

    await Promise.all(promises);

    return additionalLenders;
}
