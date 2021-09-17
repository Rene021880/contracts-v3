import { engine } from '../engine';
import { initEngine } from './helpers/Init';
import { expect } from 'chai';

describe('init engine', () => {
    beforeEach(async () => {
        await initEngine();
    });

    it('basic migrate', async () => {
        const migration = (await import('./singleMigrations/basic')).default;
        expect(await engine.migrateOneUp(migration, 0, {}, {})).to.not.throw;
    });

    it('throw migrate', async () => {
        const migration = (await import('./singleMigrations/throw')).default;
        expect(await engine.migrateOneUp(migration, 0, {}, {})).to.throw;
    });
});
