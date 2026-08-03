export default () => ({
    app: {
      name: process.env.APP_NAME,
      version: process.env.APP_VERSION,
      port: parseInt(process.env.PORT || '3000', 10),
      environment: process.env.NODE_ENV || 'development',
    },
  });