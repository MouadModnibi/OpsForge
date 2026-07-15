import { fastify } from 'fastify';

export function buildApp() {
  const app = fastify({ logger: true });

  app.get('/health', async () => {
    return {
      status: 'ok',
      uptime: process.uptime(),
      timestamp: new Date().toISOString(),
    };
  });

  return app;
}  