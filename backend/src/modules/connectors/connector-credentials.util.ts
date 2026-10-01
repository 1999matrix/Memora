import { ConnectorType } from '../../generated/prisma/client';

export function useConnectorDemo(config: Record<string, unknown>): boolean {
  return config.mode === 'demo' || config.useStub === true;
}

function str(config: Record<string, unknown>, key: string): string | undefined {
  const v = config[key];
  return typeof v === 'string' && v.trim() ? v.trim() : undefined;
}

export function hasLiveConnectorConfig(
  type: ConnectorType,
  config: Record<string, unknown>,
): boolean {
  if (useConnectorDemo(config)) {
    return false;
  }

  switch (type) {
    case 'GITHUB':
      return Boolean(str(config, 'token') && str(config, 'owner') && str(config, 'repo'));
    case 'POSTGRESQL':
      return Boolean(str(config, 'connectionString') && str(config, 'sql'));
    case 'NOTION':
      return Boolean(str(config, 'token') && str(config, 'databaseId'));
    case 'SLACK':
      return Boolean(str(config, 'token') && str(config, 'channelId'));
    case 'JIRA':
      return Boolean(
        str(config, 'baseUrl') &&
          str(config, 'email') &&
          str(config, 'apiToken'),
      );
    case 'CONFLUENCE':
      return Boolean(
        str(config, 'baseUrl') &&
          str(config, 'email') &&
          str(config, 'apiToken'),
      );
    case 'GOOGLE_DRIVE':
      return Boolean(str(config, 'accessToken') && str(config, 'folderId'));
    case 'SHAREPOINT':
      return Boolean(
        str(config, 'accessToken') &&
          str(config, 'siteId') &&
          str(config, 'driveId'),
      );
    default:
      return false;
  }
}
