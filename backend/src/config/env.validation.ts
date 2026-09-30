import * as Joi from 'joi';

export const validationSchema = Joi.object({
  PORT: Joi.number().default(3000),
  NODE_ENV: Joi.string()
    .valid('development', 'production', 'test')
    .default('development'),
  APP_NAME: Joi.string().required(),
  APP_VERSION: Joi.string().required(),
  DATABASE_URL: Joi.string().required(),
  REDIS_HOST: Joi.string().default('127.0.0.1'),
  REDIS_PORT: Joi.number().default(6379),
  REDIS_PASSWORD: Joi.string().optional().allow(''),
  JWT_ACCESS_SECRET: Joi.string().min(16).required(),
  JWT_REFRESH_SECRET: Joi.string().min(16).required(),
  JWT_ACCESS_EXPIRES_IN: Joi.string().default('15m'),
  JWT_REFRESH_EXPIRES_IN: Joi.string().default('7d'),
  AI_PROVIDER: Joi.string().valid('stub', 'openai').default('stub'),
  OPENAI_API_KEY: Joi.when('AI_PROVIDER', {
    is: 'openai',
    then: Joi.string().min(1).required(),
    otherwise: Joi.string().optional().allow(''),
  }),
  OPENAI_CHAT_MODEL: Joi.string().default('gpt-4o-mini'),
  OPENAI_EMBEDDING_MODEL: Joi.string().default('text-embedding-3-small'),
  OPENAI_SUMMARY_MODEL: Joi.string().default('gpt-4o-mini'),
  EMBEDDING_DIMENSIONS: Joi.number().default(1536),
  STORAGE_ROOT: Joi.string().optional(),
});
