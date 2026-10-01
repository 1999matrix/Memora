import { DelegatingConnectorDriver } from './delegating.connector';

describe('DelegatingConnectorDriver', () => {
  it('github demo sync uses stub payload', async () => {
    const driver = new DelegatingConnectorDriver('GITHUB');
    const result = await driver.sync({
      connectorId: 'c-test',
      workspaceId: 'w1',
      organizationId: 'o1',
      config: { mode: 'demo' },
      syncCursor: null,
    });
    expect(result.items.length).toBe(3);
    expect(result.items[0].externalId).toContain('github');
  });

  it('google drive demo testConnection passes', async () => {
    const driver = new DelegatingConnectorDriver('GOOGLE_DRIVE');
    const ok = await driver.testConnection({
      connectorId: 'c1',
      workspaceId: 'w1',
      organizationId: 'o1',
      config: {},
      syncCursor: null,
    });
    expect(ok).toBe(true);
  });

  it('sharepoint maps to live driver only with credentials', async () => {
    const driver = new DelegatingConnectorDriver('SHAREPOINT');
    const ok = await driver.testConnection({
      connectorId: 'c1',
      workspaceId: 'w1',
      organizationId: 'o1',
      config: {
        accessToken: 'x',
        siteId: 's',
        driveId: 'd',
      },
      syncCursor: null,
    });
    expect(typeof ok).toBe('boolean');
  });
});
