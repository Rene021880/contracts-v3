import { AutoCompoundingStakingRewards, BNTPool, ExternalRewardsVault, ProxyAdmin } from '../../components/Contracts';
import { ContractName, DeployedContracts } from '../../utils/Deploy';
import { expectRoleMembers, Roles } from '../helpers/AccessControl';
import { describeDeployment } from '../helpers/Deploy';
import { expect } from 'chai';
import { getNamedAccounts } from 'hardhat';

describeDeployment('1642682509-auto-compounding-rewards', ContractName.AutoCompoundingStakingRewardsV1, () => {
    let proxyAdmin: ProxyAdmin;
    let deployer: string;
    let bntPool: BNTPool;
    let externalRewardsVault: ExternalRewardsVault;
    let autoCompoundingStakingRewards: AutoCompoundingStakingRewards;

    before(async () => {
        ({ deployer } = await getNamedAccounts());
    });

    beforeEach(async () => {
        proxyAdmin = await DeployedContracts.ProxyAdmin.deployed();
        bntPool = await DeployedContracts.BNTPoolV1.deployed();
        externalRewardsVault = await DeployedContracts.ExternalRewardsVaultV1.deployed();
        autoCompoundingStakingRewards = await DeployedContracts.AutoCompoundingStakingRewardsV1.deployed();
    });

    it('should deploy and configure the auto-compounding rewards contract', async () => {
        expect(await proxyAdmin.getProxyAdmin(autoCompoundingStakingRewards.address)).to.equal(proxyAdmin.address);

        expect(await autoCompoundingStakingRewards.version()).to.equal(1);

        await expectRoleMembers(autoCompoundingStakingRewards, Roles.Upgradeable.ROLE_ADMIN, [deployer]);
        await expectRoleMembers(bntPool, Roles.BNTPool.ROLE_BNT_POOL_TOKEN_MANAGER, [
            autoCompoundingStakingRewards.address
        ]);
        await expectRoleMembers(externalRewardsVault, Roles.Vault.ROLE_ASSET_MANAGER, [
            autoCompoundingStakingRewards.address
        ]);
    });
});
