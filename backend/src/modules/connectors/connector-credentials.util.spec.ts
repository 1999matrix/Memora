import { hasLiveConnectorConfig, useConnectorDemo } from './connector-credentials.util';

describe('connector-credentials.util', () => {
  it('detects demo mode', () => {
    expect(useConnectorDemo({ mode: 'demo' })).toBe(true);
    expect(useConnectorDemo({ useStub: true })).toBe(true);
    expect(useConnectorDemo({})).toBe(false);
  });

  it('requires github token owner repo', () => {
    expect(
      hasLiveConnectorConfig('GITHUB', {
        token: 'x',
        owner: 'o',
        repo: 'r',
      }),
    ).toBe(true);
    expect(hasLiveConnectorConfig('GITHUB', { token: 'x' })).toBe(false);
  });
});
