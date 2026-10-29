import { loadEnv } from './bootstrap/env.js';
import { createApp } from './app.js';
import { createContainer, shutdownContainer } from './lib/container.js';

async function main() {
  loadEnv();
  const container = await createContainer();
  const app = createApp(container);
  const port = container.config.get<number>('app.port') ?? 7000;

  const server = app.listen(port, () => {
    console.log(`Memora API v2 http://localhost:${port}`);
    console.log(`Swagger http://localhost:${port}/docs`);
    console.log(`Health http://localhost:${port}/health`);
  });

  const close = async () => {
    server.close();
    await shutdownContainer(container);
    process.exit(0);
  };
  process.on('SIGINT', () => void close());
  process.on('SIGTERM', () => void close());
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
