import { StubConnectorDriver } from './drivers/stub-connector.driver';

describe('StubConnectorDriver', () => {
  it('covers all PRD connector types', () => {
    const types = [
      'GOOGLE_DRIVE',
      'GITHUB',
      'NOTION',
      'CONFLUENCE',
      'JIRA',
      'SLACK',
      'SHAREPOINT',
      'POSTGRESQL',
    ] as const;

    expect(types).toHaveLength(8);
    for (const type of types) {
      expect(new StubConnectorDriver(type).type).toBe(type);
    }
  });

  it('stub sync returns incremental payload shape', async () => {
    const github = new StubConnectorDriver('GITHUB');
    const result = await github.sync({
      connectorId: 'c1',
      workspaceId: 'w1',
      organizationId: 'o1',
      config: { seed: 'demo' },
      syncCursor: null,
    });

    expect(result.items.length).toBe(3);
    expect(result.items[0].externalId).toContain('github');
    expect(result.nextCursor).toBeTruthy();
  });
});
