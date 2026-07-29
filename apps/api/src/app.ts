import Fastify, { type FastifyRequest } from "fastify";
import { Client } from "pg";
import * as promClient from "prom-client";

export function buildApp() {
  const app = Fastify({ logger: true });

  // Prometheus registry
  const register = new promClient.Registry();
  promClient.collectDefaultMetrics({ register });

  // Total HTTP requests
  const httpRequestsTotal = new promClient.Counter({
    name: "opsforge_http_requests_total",
    help: "Total number of HTTP requests",
    labelNames: ["method", "route", "status_code"],
    registers: [register],
  });

  // Request duration
  const httpRequestDuration = new promClient.Histogram({
    name: "opsforge_http_request_duration_seconds",
    help: "HTTP request duration in seconds",
    labelNames: ["method", "route", "status_code"],
    buckets: [0.01, 0.05, 0.1, 0.5, 1, 2],
    registers: [register],
  });

  // Start timer
  app.addHook("onRequest", async (request: FastifyRequest & { startTime?: bigint }) => {
    request.startTime = process.hrtime.bigint();
  });

  // Record metrics
  app.addHook("onResponse", async (request: FastifyRequest & { startTime?: bigint }, reply) => {
    const duration =
  Number(process.hrtime.bigint() - (request.startTime ?? process.hrtime.bigint())) / 1e9;

    const route = request.routeOptions?.url || request.url;

    httpRequestsTotal.inc({
      method: request.method,
      route,
      status_code: String(reply.statusCode),
    });

    httpRequestDuration.observe(
      {
        method: request.method,
        route,
        status_code: String(reply.statusCode),
      },
      duration
    );
  });

  app.get("/health", async () => ({
    status: "ok",
    uptime: process.uptime(),
    timestamp: new Date().toISOString(),
  }));

  app.get("/ready", async (_, reply) => {
    const db = new Client({
      connectionString: process.env.DATABASE_URL,
    });

    try {
      await db.connect();
      await db.query("SELECT 1");
      await db.end();

      return { status: "ready" };
    } catch (err) {
      app.log.error(err);
      reply.code(503);
      return { status: "not ready" };
    }
  });

  // Prometheus endpoint
  app.get("/metrics", async (_, reply) => {
    reply.header("Content-Type", register.contentType);
    return register.metrics();
  });

  return app;
}