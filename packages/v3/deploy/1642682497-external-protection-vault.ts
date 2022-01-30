import { ContractName, DeploymentTag, deployProxy, DeployedContracts } from '../utils/Deploy';
import { DeployFunction } from 'hardhat-deploy/types';
import { HardhatRuntimeEnvironment } from 'hardhat/types';

const func: DeployFunction = async ({ getNamedAccounts }: HardhatRuntimeEnvironment) => {
    const { deployer } = await getNamedAccounts();

    const networkTokenGovernance = await DeployedContracts.NetworkTokenGovernance.deployed();
    const govTokenGovernance = await DeployedContracts.GovTokenGovernance.deployed();

    await deployProxy({
        name: ContractName.ExternalProtectionVaultV1,
        from: deployer,
        args: [networkTokenGovernance.address, govTokenGovernance.address]
    });

    return true;
};

func.id = ContractName.ExternalProtectionVaultV1;
func.dependencies = [DeploymentTag.V2, ContractName.ProxyAdmin];
func.tags = [DeploymentTag.V3, ContractName.ExternalProtectionVaultV1];

export default func;