import { BancorV1Migration } from '../../components/Contracts';
import { ContractName, DeployedContracts } from '../../utils/Deploy';
import { describeDeployment } from '../helpers/Deploy';
import { expect } from 'chai';

describeDeployment('1642682510-migration-v1', ContractName.BancorV1MigrationV1, () => {
    let migration: BancorV1Migration;

    beforeEach(async () => {
        migration = await DeployedContracts.BancorV1MigrationV1.deployed();
    });

    it('should deploy and configure the V1 migration contract', async () => {
        expect(await migration.version()).to.equal(1);
    });
});
