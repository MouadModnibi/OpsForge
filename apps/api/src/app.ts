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

  // Page 404 personnalisée avec CSS
  // Page 404 personnalisée avec CSS
  app.setNotFoundHandler((request, reply) => {
    const jsonPayload = JSON.stringify({
      message: `Route ${request.method}:${request.url} not found`,
      error: "Not Found",
      statusCode: 404,
    });

    const htmlContent = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>404 Not Found</title>
  <style>
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body {
      background: #0f172a;
      color: #f8fafc;
      font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace;
      display: flex;
      align-items: center;
      justify-content: center;
      min-height: 100vh;
      padding: 1rem;
    }
    .card {
      background: #1e293b;
      border: 1px solid #334155;
      border-radius: 12px;
      box-shadow: 0 20px 25px -5px rgba(0, 0, 0, 0.5);
      max-width: 500px;
      width: 100%;
      padding: 1.5rem;
    }
    .status-tag {
      display: inline-block;
      background-color: #ef4444;
      color: #ffffff;
      font-size: 0.75rem;
      font-weight: bold;
      padding: 0.25rem 0.625rem;
      border-radius: 9999px;
      margin-bottom: 1rem;
      text-transform: uppercase;
      letter-spacing: 0.05em;
    }
    pre {
      background-color: #0f172a;
      border: 1px solid #334155;
      border-radius: 8px;
      padding: 1rem;
      color: #38bdf8;
      font-size: 0.875rem;
      overflow-x: auto;
      white-space: pre-wrap;
      word-break: break-all;
    }
  </style>
</head>
<body>
  <div class="card">
    <span class="status-tag">404 Error</span>
    <pre>${jsonPayload}</pre>
  </div>
</body>
</html>`;

    reply
      .status(404)
      .header('Content-Type', 'text/html; charset=utf-8')
      .send(htmlContent);
  });

  return app;
}