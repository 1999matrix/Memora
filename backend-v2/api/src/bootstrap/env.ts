import 'dotenv/config';

import { validationSchema } from '../domain/config/env.validation.js';

export function loadEnv(): void {
  const { error } = validationSchema.validate(process.env, {
    abortEarly: false,
    allowUnknown: true,
  });
  if (error) {
    throw new Error(`Invalid environment: ${error.message}`);
  }
}
