export default () => ({
  app: {
    name: process.env.APP_NAME,
    version: process.env.APP_VERSION,
    port: parseInt(process.env.PORT || '7000', 10),
    environment: process.env.NODE_ENV || 'development',
  },
  database: {
    url: process.env.DATABASE_URL,
  },
  redis: {
    /** TCP URL (Upstash: rediss://default:…@….upstash.io:6379). Overrides host/port/password. */
    url: process.env.REDIS_URL || undefined,
    host: process.env.REDIS_HOST || '127.0.0.1',
    port: parseInt(process.env.REDIS_PORT || '6379', 10),
    password: process.env.REDIS_PASSWORD || undefined,
    restUrl: process.env.UPSTASH_REDIS_REST_URL || undefined,
    restToken: process.env.UPSTASH_REDIS_REST_TOKEN || undefined,
  },
  jwt: {
    accessSecret: process.env.JWT_ACCESS_SECRET,
    refreshSecret: process.env.JWT_REFRESH_SECRET,
    accessExpiresIn: process.env.JWT_ACCESS_EXPIRES_IN || '15m',
    refreshExpiresIn: process.env.JWT_REFRESH_EXPIRES_IN || '7d',
  },
  storage: {
    root: process.env.STORAGE_ROOT || undefined,
  },
  rag: {
    embeddingDimensions: parseInt(
      process.env.EMBEDDING_DIMENSIONS || '1536',
      10,
    ),
  },
  ai: {
    provider: process.env.AI_PROVIDER || 'auto',
    serviceUrl: process.env.AI_SERVICE_URL || undefined,
    openai: {
      apiKey: process.env.OPENAI_API_KEY,
      chatModel: process.env.OPENAI_CHAT_MODEL || 'gpt-4o-mini',
      embeddingModel:
        process.env.OPENAI_EMBEDDING_MODEL || 'text-embedding-3-small',
      summaryModel: process.env.OPENAI_SUMMARY_MODEL || 'gpt-4o-mini',
    },
  },
});
