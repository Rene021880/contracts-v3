import { expect } from 'chai';
import { ethers } from 'hardhat';

import { SignerWithAddress } from '@nomiclabs/hardhat-ethers/signers';

import { BancorNetwork, NetworkSettings, PendingWithdrawals, TokenHolderUpgradeable } from 'typechain';

import { ZERO_ADDRESS } from 'test/helpers/Constants';
import { shouldHaveGap } from 'test/helpers/Proxy';
import {
    createTokenHolder,
    createNetworkSettings,
    createPendingWithdrawals,
    createBancorNetwork
} from 'test/helpers/Factory';

let accounts: SignerWithAddress[];
let nonOwner: SignerWithAddress;

let networkSettings: NetworkSettings;
let pendingWithdrawals: PendingWithdrawals;

describe('BancorNetwork', () => {
    shouldHaveGap('BancorNetwork', '_protectionWallet');

    before(async () => {
        accounts = await ethers.getSigners();

        [, nonOwner] = accounts;
    });

    beforeEach(async () => {
        networkSettings = await createNetworkSettings();
        pendingWithdrawals = await createPendingWithdrawals();
    });

    describe('construction', async () => {
        it('should revert when attempting to reinitialize', async () => {
            const network = await createBancorNetwork(networkSettings, pendingWithdrawals);

            await expect(network.initialize()).to.be.revertedWith('Initializable: contract is already initialized');
        });

        it('should be properly initialized', async () => {
            const network = await createBancorNetwork(networkSettings, pendingWithdrawals);

            expect(await network.version()).to.equal(1);

            expect(await network.settings()).to.equal(networkSettings.address);
            expect(await network.pendingWithdrawals()).to.equal(pendingWithdrawals.address);
            expect(await network.protectionWallet()).to.equal(ZERO_ADDRESS);
            expect(await network.poolCollections()).to.be.empty;
            expect(await network.liquidityPools()).to.be.empty;
        });
    });

    describe('protection wallet', async () => {
        let newProtectionWallet: TokenHolderUpgradeable;
        let network: BancorNetwork;

        beforeEach(async () => {
            network = await createBancorNetwork(networkSettings, pendingWithdrawals);

            newProtectionWallet = await createTokenHolder();
        });

        it('should revert when a non-owner attempts to set the protection wallet', async () => {
            await expect(network.connect(nonOwner).setProtectionWallet(newProtectionWallet.address)).to.be.revertedWith(
                'ERR_ACCESS_DENIED'
            );
        });

        it('should revert when setting protection wallet to an invalid address', async () => {
            await expect(network.setProtectionWallet(ZERO_ADDRESS)).to.be.revertedWith('ERR_INVALID_ADDRESS');
        });

        it('should be to able to set and update the protection wallet', async () => {
            await newProtectionWallet.transferOwnership(network.address);

            const res = await network.setProtectionWallet(newProtectionWallet.address);
            await expect(res)
                .to.emit(network, 'ProtectionWalletUpdated')
                .withArgs(ZERO_ADDRESS, newProtectionWallet.address);
            expect(await network.protectionWallet()).to.equal(newProtectionWallet.address);
            expect(await newProtectionWallet.owner()).to.equal(network.address);

            const newProtectionWallet2 = await createTokenHolder();
            await newProtectionWallet2.transferOwnership(network.address);

            const res2 = await network.setProtectionWallet(newProtectionWallet2.address);
            await expect(res2)
                .to.emit(network, 'ProtectionWalletUpdated')
                .withArgs(newProtectionWallet.address, newProtectionWallet2.address);
            expect(await network.protectionWallet()).to.equal(newProtectionWallet2.address);
            expect(await newProtectionWallet2.owner()).to.equal(network.address);
        });

        it('should revert when attempting to set the protection wallet without transferring its ownership', async () => {
            await expect(network.setProtectionWallet(newProtectionWallet.address)).to.be.revertedWith(
                'ERR_ACCESS_DENIED'
            );
        });

        it('should revert when a non-owner attempts to transfer the ownership of the protection wallet', async () => {
            const newOwner = accounts[4];

            await expect(
                network.connect(newOwner).transferProtectionWalletOwnership(newOwner.address)
            ).to.be.revertedWith('ERR_ACCESS_DENIED');
        });

        it('should allow explicitly transferring the ownership', async () => {
            const newOwner = accounts[4];

            await newProtectionWallet.transferOwnership(network.address);
            await network.setProtectionWallet(newProtectionWallet.address);
            expect(await newProtectionWallet.owner()).to.equal(network.address);

            await network.transferProtectionWalletOwnership(newOwner.address);
            await newProtectionWallet.connect(newOwner).acceptOwnership();
            expect(await newProtectionWallet.owner()).to.equal(newOwner.address);
        });
    });
});