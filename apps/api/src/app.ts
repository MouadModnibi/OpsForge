import { fastify } from 'fastify';
import { Client } from 'pg';

export function buildApp() {
  const app = fastify({ logger: true });

  app.get('/health', async () => {
    return {
      status: 'ok',
      uptime: process.uptime(),
      timestamp: new Date().toISOString(),
    };
  });

  app.get('/ready', async (request, reply) => {
    const client = new Client({
      connectionString: process.env.DATABASE_URL,
    });

    try {
      await client.connect();
      await client.query('SELECT 1');
      await client.end();
      return { status: 'ready' };
    } catch (err) {
      app.log.error(err);
      reply.code(503);
      return { status: 'not ready' };
    }
  });

  return app;
}