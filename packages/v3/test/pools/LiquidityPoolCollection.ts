import { expect } from 'chai';
import { ethers } from 'hardhat';
import { BigNumber } from 'ethers';

import { SignerWithAddress } from '@nomiclabs/hardhat-ethers/signers';

import Contracts from 'components/Contracts';
import { LiquidityPoolCollection, TestERC20Token, TestBancorNetwork, NetworkSettings } from 'typechain';
import { createSystem } from 'test/helpers/Factory';
import { PPM_RESOLUTION, ZERO_ADDRESS } from 'test/helpers/Constants';

const DEFAULT_TRADING_FEE_PPM = BigNumber.from(2000);
const POOL_TYPE = BigNumber.from(1);
const SYMBOL = 'TKN';
const EMPTY_STRING = '';

let nonOwner: SignerWithAddress;

let reserveToken: TestERC20Token;

describe('LiquidityPoolCollection', () => {
    before(async () => {
        [, nonOwner] = await ethers.getSigners();
    });

    beforeEach(async () => {
        reserveToken = await Contracts.TestERC20Token.deploy(SYMBOL, SYMBOL, BigNumber.from(1_000_000));
    });

    describe('construction', () => {
        it('should be properly initialized', async () => {
            const { collection, network } = await createSystem();

            expect(await collection.version()).to.equal(1);

            expect(await collection.poolType()).to.equal(POOL_TYPE);
            expect(await collection.network()).to.equal(network.address);
            expect(await collection.defaultTradingFeePPM()).to.equal(DEFAULT_TRADING_FEE_PPM);
        });
    });

    describe('token symbol overrides', async () => {
        const newSymbol = 'TKN2';
        let collection: LiquidityPoolCollection;

        beforeEach(async () => {
            ({ collection } = await createSystem());
        });

        it('should revert when a non-owner attempts to set a token symbol override', async () => {
            await expect(
                collection.connect(nonOwner).setTokenSymbolOverride(reserveToken.address, newSymbol)
            ).to.be.revertedWith('ERR_ACCESS_DENIED');
        });

        it('should be to able to set and update a token symbol override', async () => {
            expect(await collection.tokenSymbolOverride(reserveToken.address)).to.equal(EMPTY_STRING);

            await collection.setTokenSymbolOverride(reserveToken.address, newSymbol);
            expect(await collection.tokenSymbolOverride(reserveToken.address)).to.equal(newSymbol);

            await collection.setTokenSymbolOverride(reserveToken.address, SYMBOL);
            expect(await collection.tokenSymbolOverride(reserveToken.address)).to.equal(SYMBOL);

            await collection.setTokenSymbolOverride(reserveToken.address, EMPTY_STRING);
            expect(await collection.tokenSymbolOverride(reserveToken.address)).to.equal(EMPTY_STRING);
        });
    });

    describe('default trading fee', () => {
        const newDefaultTradingFree = BigNumber.from(100000);
        let collection: LiquidityPoolCollection;

        beforeEach(async () => {
            ({ collection } = await createSystem());

            expect(await collection.defaultTradingFeePPM()).to.equal(DEFAULT_TRADING_FEE_PPM);
        });

        it('should revert when a non-owner attempts to set the default trading fee', async () => {
            await expect(
                collection.connect(nonOwner).setDefaultTradingFeePPM(newDefaultTradingFree)
            ).to.be.revertedWith('ERR_ACCESS_DENIED');
        });

        it('should revert when setting the default trading fee to an invalid value', async () => {
            await expect(collection.setDefaultTradingFeePPM(PPM_RESOLUTION.add(BigNumber.from(1)))).to.be.revertedWith(
                'ERR_INVALID_FEE'
            );
        });

        it('should be to able to set and update the default trading fee', async () => {
            const res = await collection.setDefaultTradingFeePPM(newDefaultTradingFree);
            await expect(res)
                .to.emit(collection, 'DefaultTradingFeePPMUpdated')
                .withArgs(DEFAULT_TRADING_FEE_PPM, newDefaultTradingFree);

            expect(await collection.defaultTradingFeePPM()).to.equal(newDefaultTradingFree);

            const res2 = await collection.setDefaultTradingFeePPM(DEFAULT_TRADING_FEE_PPM);
            await expect(res2)
                .to.emit(collection, 'DefaultTradingFeePPMUpdated')
                .withArgs(newDefaultTradingFree, DEFAULT_TRADING_FEE_PPM);

            expect(await collection.defaultTradingFeePPM()).to.equal(DEFAULT_TRADING_FEE_PPM);
        });
    });

    describe('create pool', () => {
        let networkSettings: NetworkSettings;
        let network: TestBancorNetwork;
        let collection: LiquidityPoolCollection;

        const poolTokenSymbol = (symbol: string) => `bn${symbol}`;
        const poolTokenName = (symbol: string) => `Bancor ${symbol} Pool Token`;

        beforeEach(async () => {
            ({ network, networkSettings, collection } = await createSystem());
        });

        it('should revert when attempting to create a pool from a non-network', async () => {
            let nonNetwork = nonOwner;
            await expect(collection.connect(nonNetwork).createPool(reserveToken.address)).to.be.revertedWith(
                'ERR_ACCESS_DENIED'
            );
        });

        it('should revert when attempting to create a pool for a non-whitelisted token', async () => {
            await expect(network.createPoolF(collection.address, reserveToken.address)).to.be.revertedWith(
                'ERR_POOL_NOT_WHITELISTED'
            );
        });

        context('whitelisted token', () => {
            beforeEach(async () => {
                await networkSettings.addTokenToWhitelist(reserveToken.address);
            });

            it('should not allow to create the same pool twice', async () => {
                await network.createPoolF(collection.address, reserveToken.address);

                await expect(network.createPoolF(collection.address, reserveToken.address)).to.be.revertedWith(
                    'ERR_POOL_ALREADY_EXISTS'
                );
            });

            it('should create a pool', async () => {
                let pool = await collection.poolData(reserveToken.address);
                expect(pool.poolToken).to.equal(ZERO_ADDRESS);

                const res = await network.createPoolF(collection.address, reserveToken.address);
                pool = await collection.poolData(reserveToken.address);
                const { poolToken: poolTokenAddress } = pool;

                await expect(res).to.emit(collection, 'PoolCreated').withArgs(poolTokenAddress, reserveToken.address);

                const poolToken = await Contracts.PoolToken.attach(poolTokenAddress);
                expect(poolToken).not.to.equal(ZERO_ADDRESS);
                const reserveTokenSymbol = await reserveToken.symbol();
                expect(await poolToken.reserveToken()).to.equal(reserveToken.address);
                expect(await poolToken.symbol()).to.equal(poolTokenSymbol(reserveTokenSymbol));
                expect(await poolToken.name()).to.equal(poolTokenName(reserveTokenSymbol));

                expect(pool.tradingFeePPM).to.equal(DEFAULT_TRADING_FEE_PPM);
                expect(pool.depositsEnabled).to.be.false;
                expect(pool.tradingLiquidity).to.equal(BigNumber.from(0));
                expect(pool.tradingLiquidityProduct).to.equal(BigNumber.from(0));
                expect(pool.stakedBalance).to.equal(BigNumber.from(0));
                expect(pool.initialRate).to.equal({ n: BigNumber.from(0), d: BigNumber.from(0) });
                expect(pool.depositLimit).to.equal(BigNumber.from(0));
            });

            context('with token symbol override', () => {
                const newSymbol = 'TKN2';

                beforeEach(async () => {
                    await collection.setTokenSymbolOverride(reserveToken.address, newSymbol);
                });

                it('should create a pool', async () => {
                    await network.createPoolF(collection.address, reserveToken.address);

                    const pool = await collection.poolData(reserveToken.address);
                    const { poolToken: poolTokenAddress } = pool;
                    const poolToken = await Contracts.PoolToken.attach(poolTokenAddress);
                    const reserveTokenSymbol = await reserveToken.symbol();
                    expect(await poolToken.reserveToken()).to.equal(reserveToken.address);
                    expect(await poolToken.symbol()).to.equal(poolTokenSymbol(newSymbol));
                    expect(await poolToken.name()).to.equal(poolTokenName(newSymbol));
                });
            });
        });
    });

    describe('pool settings', () => {
        let networkSettings: NetworkSettings;
        let network: TestBancorNetwork;
        let collection: LiquidityPoolCollection;

        beforeEach(async () => {
            ({ network, networkSettings, collection } = await createSystem());

            await networkSettings.addTokenToWhitelist(reserveToken.address);

            await network.createPoolF(collection.address, reserveToken.address);
        });

        describe('initial rate', () => {
            const newInitialRate = { n: BigNumber.from(1000), d: BigNumber.from(5000) };

            it('should revert when a non-owner attempts to set the initial rate', async () => {
                await expect(
                    collection.connect(nonOwner).setInitialRate(reserveToken.address, newInitialRate)
                ).to.be.revertedWith('ERR_ACCESS_DENIED');
            });

            it('should revert when setting an invalid rate', async () => {
                await expect(
                    collection.setInitialRate(reserveToken.address, { n: BigNumber.from(1000), d: BigNumber.from(0) })
                ).to.be.revertedWith('ERR_INVALID_RATE');
            });

            it('should revert when setting the initial rate of a non-existing pool', async () => {
                const newReserveToken = await Contracts.TestERC20Token.deploy(
                    SYMBOL,
                    SYMBOL,
                    BigNumber.from(1_000_000)
                );

                await expect(collection.setInitialRate(newReserveToken.address, newInitialRate)).to.be.revertedWith(
                    'ERR_POOL_DOES_NOT_EXIST'
                );
            });

            it('should allow setting and updating the initial rate', async () => {
                let pool = await collection.poolData(reserveToken.address);
                expect(pool.initialRate).to.equal({ n: BigNumber.from(0), d: BigNumber.from(0) });

                const res = await collection.setInitialRate(reserveToken.address, newInitialRate);
                await expect(res)
                    .to.emit(collection, 'InitialRateUpdated')
                    .withArgs(reserveToken.address, pool.initialRate, newInitialRate);

                pool = await collection.poolData(reserveToken.address);
                expect(pool.initialRate).to.equal(newInitialRate);

                const newInitialRate2 = { n: BigNumber.from(100000), d: BigNumber.from(50) };
                const res2 = await collection.setInitialRate(reserveToken.address, newInitialRate2);
                await expect(res2)
                    .to.emit(collection, 'InitialRateUpdated')
                    .withArgs(reserveToken.address, pool.initialRate, newInitialRate2);

                pool = await collection.poolData(reserveToken.address);
                expect(pool.initialRate).to.equal(newInitialRate2);
            });
        });

        describe('trading fee', () => {
            const newTradingFee = BigNumber.from(50555);

            it('should revert when a non-owner attempts to set the trading fee', async () => {
                await expect(
                    collection.connect(nonOwner).setTradingFeePPM(reserveToken.address, newTradingFee)
                ).to.be.revertedWith('ERR_ACCESS_DENIED');
            });

            it('should revert when setting an trading fee', async () => {
                await expect(
                    collection.setTradingFeePPM(reserveToken.address, PPM_RESOLUTION.add(BigNumber.from(1)))
                ).to.be.revertedWith('ERR_INVALID_FEE');
            });

            it('should revert when setting the trading fee of a non-existing pool', async () => {
                const newReserveToken = await Contracts.TestERC20Token.deploy(
                    SYMBOL,
                    SYMBOL,
                    BigNumber.from(1_000_000)
                );

                await expect(collection.setTradingFeePPM(newReserveToken.address, newTradingFee)).to.be.revertedWith(
                    'ERR_POOL_DOES_NOT_EXIST'
                );
            });

            it('should allow setting and updating the trading fee', async () => {
                let pool = await collection.poolData(reserveToken.address);
                expect(pool.tradingFeePPM).to.equal(DEFAULT_TRADING_FEE_PPM);

                const res = await collection.setTradingFeePPM(reserveToken.address, newTradingFee);
                await expect(res)
                    .to.emit(collection, 'TradingFeePPMUpdated')
                    .withArgs(reserveToken.address, pool.tradingFeePPM, newTradingFee);

                pool = await collection.poolData(reserveToken.address);
                expect(pool.tradingFeePPM).to.equal(newTradingFee);

                const newTradingFee2 = BigNumber.from(0);
                const res2 = await collection.setTradingFeePPM(reserveToken.address, newTradingFee2);
                await expect(res2)
                    .to.emit(collection, 'TradingFeePPMUpdated')
                    .withArgs(reserveToken.address, pool.tradingFeePPM, newTradingFee2);

                pool = await collection.poolData(reserveToken.address);
                expect(pool.tradingFeePPM).to.equal(newTradingFee2);
            });
        });

        describe('enable deposits', () => {
            it('should revert when a non-owner attempts to enable deposits', async () => {
                await expect(
                    collection.connect(nonOwner).enableDeposits(reserveToken.address, true)
                ).to.be.revertedWith('ERR_ACCESS_DENIED');
            });

            it('should revert when enabling deposits for a non-existing pool', async () => {
                const newReserveToken = await Contracts.TestERC20Token.deploy(
                    SYMBOL,
                    SYMBOL,
                    BigNumber.from(1_000_000)
                );

                await expect(collection.enableDeposits(newReserveToken.address, true)).to.be.revertedWith(
                    'ERR_POOL_DOES_NOT_EXIST'
                );
            });

            it('should allow enabling and disabling deposits', async () => {
                let pool = await collection.poolData(reserveToken.address);
                expect(pool.depositsEnabled).to.be.false;

                const res = await collection.enableDeposits(reserveToken.address, true);
                await expect(res)
                    .to.emit(collection, 'DepositsEnabled')
                    .withArgs(reserveToken.address, pool.depositsEnabled, true);

                pool = await collection.poolData(reserveToken.address);
                expect(pool.depositsEnabled).to.be.true;

                const res2 = await collection.enableDeposits(reserveToken.address, false);
                await expect(res2)
                    .to.emit(collection, 'DepositsEnabled')
                    .withArgs(reserveToken.address, pool.depositsEnabled, false);

                pool = await collection.poolData(reserveToken.address);
                expect(pool.depositsEnabled).to.be.false;
            });
        });

        describe('deposit limit', () => {
            const newDepositLimit = BigNumber.from(99999);

            it('should revert when a non-owner attempts to set the deposit limit', async () => {
                await expect(
                    collection.connect(nonOwner).setDepositLimit(reserveToken.address, newDepositLimit)
                ).to.be.revertedWith('ERR_ACCESS_DENIED');
            });

            it('should revert when setting the deposit limit of a non-existing pool', async () => {
                const newReserveToken = await Contracts.TestERC20Token.deploy(
                    SYMBOL,
                    SYMBOL,
                    BigNumber.from(1_000_000)
                );

                await expect(collection.setDepositLimit(newReserveToken.address, newDepositLimit)).to.be.revertedWith(
                    'ERR_POOL_DOES_NOT_EXIST'
                );
            });

            it('should allow setting and updating the deposit limit', async () => {
                let pool = await collection.poolData(reserveToken.address);
                expect(pool.tradingFeePPM).to.equal(DEFAULT_TRADING_FEE_PPM);

                const res = await collection.setDepositLimit(reserveToken.address, newDepositLimit);
                await expect(res)
                    .to.emit(collection, 'DepositLimitUpdated')
                    .withArgs(reserveToken.address, pool.depositLimit, newDepositLimit);

                pool = await collection.poolData(reserveToken.address);
                expect(pool.depositLimit).to.equal(newDepositLimit);

                const newDepositLimit2 = BigNumber.from(1);
                const res2 = await collection.setDepositLimit(reserveToken.address, newDepositLimit2);
                await expect(res2)
                    .to.emit(collection, 'DepositLimitUpdated')
                    .withArgs(reserveToken.address, pool.depositLimit, newDepositLimit2);

                pool = await collection.poolData(reserveToken.address);
                expect(pool.depositLimit).to.equal(newDepositLimit2);
            });
        });
    });
});
