/* src/lib/healthCheck.ts */

import type { Server } from "bun";
import { log, error, initializeUptime, getUptime } from "$utils/index";
import { getLatestFunctionStatuses } from "$lib/index";
import { trace, context, SpanStatusCode } from "@opentelemetry/api";
import config from "../config/config.ts";

const tracer = trace.getTracer("health-check-server");

let isApplicationHealthy = true;

let lastLoggedResponse: string | null = null;
// const LOG_INTERVAL = config.app.HEALTH_CHECK_LOG_INTERVAL;
let lastLoggedTime = 0;

// const HEALTH_CHECK_INTERVAL = config.app.HEALTH_CHECK_INTERVAL;

initializeUptime();

export function setApplicationStatus(healthy: boolean) {
  isApplicationHealthy = healthy;
}

export function startHealthCheckServer(
  port: number = config.app.HEALTH_CHECK_PORT,
): Server {
  const server = Bun.serve({
    port: port,
    fetch(req) {
      return tracer.startActiveSpan("health_check", async (span) => {
        try {
          const url = new URL(req.url);
          span.setAttribute("http.method", req.method);
          span.setAttribute("http.url", url.pathname);
          if (url.pathname === "/health") {
            return await runHealthCheck(span);
          }
          span.setStatus({ code: SpanStatusCode.ERROR, message: "Not Found" });
          log("Not Found", {
            traceId: span.spanContext().traceId,
            spanId: span.spanContext().spanId,
          });
          return new Response("Not Found", { status: 404 });
        } catch (err) {
          handleError(span, err as Error);
          throw err;
        } finally {
          span.end();
        }
      });
    },
  });
  log(`Health Check Server started on ${server.url}`, { serverId: server.id });

  setInterval(() => {
    tracer.startActiveSpan("scheduled_health_check", async (span) => {
      try {
        await runHealthCheck(span);
      } catch (err) {
        handleError(span, err as Error);
      } finally {
        span.end();
      }
    });
  }, config.app.HEALTH_CHECK_INTERVAL);

  return server;
}

async function runHealthCheck(span: trace.Span): Promise<Response> {
  const latestStatuses = await tracer.startActiveSpan(
    "getLatestFunctionStatuses",
    async (childSpan) => {
      const statuses = await getLatestFunctionStatuses();
      childSpan.setStatus({ code: SpanStatusCode.OK });
      childSpan.end();
      return statuses;
    },
  );

  const successes = latestStatuses.filter(
    (status) => status.status === "success",
  );
  const failures = latestStatuses.filter((status) => status.status === "error");
  const isEventingFunctionsHealthy = failures.length === 0;

  span.setAttribute("eventing_functions.healthy", isEventingFunctionsHealthy);
  span.setAttribute("application.healthy", isApplicationHealthy);
  span.setAttribute("successful_functions", successes.length);
  span.setAttribute("failed_functions", failures.length);

  const response = {
    timestamp: new Date().toISOString(),
    uptime: getUptime(),
    application_status: isApplicationHealthy ? "Healthy" : "Unhealthy",
    eventing_functions_status: isEventingFunctionsHealthy
      ? "Healthy"
      : "Unhealthy",
    details: {
      successes,
      failures,
    },
  };

  const responseJson = JSON.stringify(response, null, 2);
  const now = Date.now();

  if (
    responseJson !== lastLoggedResponse ||
    now - lastLoggedTime > config.app.HEALTH_CHECK_LOG_INTERVAL
  ) {
    log("Health check results", {
      traceId: span.spanContext().traceId,
      spanId: span.spanContext().spanId,
      healthCheckResults: responseJson,
    });

    lastLoggedResponse = responseJson;
    lastLoggedTime = now;
  }

  span.setStatus({ code: SpanStatusCode.OK });
  log("Health check completed", {
    traceId: span.spanContext().traceId,
    spanId: span.spanContext().spanId,
    applicationStatus: response.application_status,
    eventingFunctionsStatus: response.eventing_functions_status,
    successCount: successes.length,
    failureCount: failures.length,
  });

  return new Response(responseJson, {
    status: isApplicationHealthy ? 200 : 503,
    headers: { "Content-Type": "application/json" },
  });
}

function handleError(span: trace.Span, err: Error) {
  span.recordException(err);
  span.setStatus({
    code: SpanStatusCode.ERROR,
    message: err.message,
  });
  error("Error in health check", {
    error: err.message,
    traceId: span.spanContext().traceId,
    spanId: span.spanContext().spanId,
  });
}

process.on("uncaughtException", (err) => {
  error("Uncaught Exception", { error: err.message });
  setApplicationStatus(false);
});

process.on("unhandledRejection", (reason, promise) => {
  error("Unhandled Rejection", { reason: reason });
  setApplicationStatus(false);
});
