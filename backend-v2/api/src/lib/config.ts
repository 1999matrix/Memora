import configuration from '../domain/config/configuration.js';

export type AppConfigService = {
  get<T = string>(path: string): T | undefined;
  getOrThrow<T = string>(path: string): T;
};

function getByPath(obj: unknown, path: string): unknown {
  return path.split('.').reduce<unknown>((current, key) => {
    if (current && typeof current === 'object' && key in current) {
      return (current as Record<string, unknown>)[key];
    }
    return undefined;
  }, obj);
}

export function createConfigService(): AppConfigService {
  const root = configuration();
  return {
    get<T = string>(path: string): T | undefined {
      return getByPath(root, path) as T | undefined;
    },
    getOrThrow<T = string>(path: string): T {
      const value = getByPath(root, path);
      if (value === undefined || value === null) {
        throw new Error(`Missing required config: ${path}`);
      }
      return value as T;
    },
  };
}
