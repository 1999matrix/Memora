export const APP_CONSTANTS = {
    PAGINATION: {
      DEFAULT_PAGE: 1,
      DEFAULT_LIMIT: 20,
      MAX_LIMIT: 100,
    },
  
    PASSWORD: {
      MIN_LENGTH: 8,
    },
  
    JWT: {
      ACCESS_TOKEN_EXPIRES: '15m',
      REFRESH_TOKEN_EXPIRES: '7d',
    },
  } as const;