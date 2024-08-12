/* src/lib/healthCheck.ts */

import type { Server } from "bun";
import { log, error, initializeUptime, getUptime } from "$utils/index";
import { getLatestFunctionStatuses } from "$lib/index";
import { getFunctionStats } from "$services";
import { trace, context, SpanStatusCode } from "@opentelemetry/api";
import { config } from "$config";
import { meter } from "../instrumentation";

const tracer = trace.getTracer("health-check-server");

let isApplicationHealthy = true;

let lastLoggedResponse: string | null = null;
let lastLoggedTime = 0;

initializeUptime();

// Create metrics
const dcpBacklogGauge = meter.createObservableGauge(
  "health_check.dcp_backlog",
  {
    description: "DCP backlog size from health check",
    unit: "1",
  },
);

const executionStatsGauge = meter.createObservableGauge(
  "health_check.execution_stats",
  {
    description: "Execution stats from health check",
    unit: "1",
  },
);

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
  let latestStatuses;
  try {
    latestStatuses = await tracer.startActiveSpan(
      "getLatestFunctionStatuses",
      async (childSpan) => {
        const statuses = await getLatestFunctionStatuses();
        childSpan.setStatus({ code: SpanStatusCode.OK });
        childSpan.end();
        return statuses;
      },
    );
  } catch (err) {
    error("Error fetching latest function statuses", { error: err });
    latestStatuses = [];
  }

  log("Latest function statuses", { statuses: JSON.stringify(latestStatuses) });

  const successes = latestStatuses.filter(
    (status) => status && status.status === "success",
  );
  const failures = latestStatuses.filter(
    (status) => status && status.status === "error",
  );
  const isEventingFunctionsHealthy = failures.length === 0;

  // Fetch DCP backlog and execution stats for each function
  const functionStats = await Promise.all(
    latestStatuses.map(async (status) => {
      if (!status || !status.function_name) {
        error("Invalid status object", { status: JSON.stringify(status) });
        return null;
      }
      try {
        log(`Fetching stats for function: ${status.function_name}`);
        const stats = await getFunctionStats(status.function_name);
        log(`Received stats for function: ${status.function_name}`, {
          stats: JSON.stringify(stats),
        });
        return { functionName: status.function_name, stats };
      } catch (err) {
        error(`Error fetching stats for function ${status.function_name}`, {
          error: err,
        });
        return null;
      }
    }),
  );

  // Filter out null values
  const validFunctionStats = functionStats.filter(Boolean);

  log("Valid function stats", { stats: JSON.stringify(validFunctionStats) });

  // Record metrics
  dcpBacklogGauge.addCallback((observer) => {
    validFunctionStats.forEach(({ functionName, stats }) => {
      if (stats && typeof stats.dcp_backlog === "number") {
        observer.observe(stats.dcp_backlog, { functionName });
        log(`Recorded DCP backlog for ${functionName}: ${stats.dcp_backlog}`);
      } else {
        log(`Missing or invalid DCP backlog for ${functionName}`, {
          stats: JSON.stringify(stats),
        });
      }
    });
  });

  executionStatsGauge.addCallback((observer) => {
    validFunctionStats.forEach(({ functionName, stats }) => {
      if (stats && stats.execution_stats) {
        const execStats = stats.execution_stats;
        [
          "on_update_success",
          "on_update_failure",
          "on_delete_success",
          "on_delete_failure",
        ].forEach((metric) => {
          if (typeof execStats[metric] === "number") {
            observer.observe(execStats[metric], { functionName, metric });
            log(`Recorded ${metric} for ${functionName}: ${execStats[metric]}`);
          } else {
            log(`Missing or invalid ${metric} for ${functionName}`, {
              execStats: JSON.stringify(execStats),
            });
          }
        });
      } else {
        log(`Missing or invalid execution stats for ${functionName}`, {
          stats: JSON.stringify(stats),
        });
      }
    });
  });

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
    metrics: {
      dcp_backlog: validFunctionStats.map(({ functionName, stats }) => ({
        functionName,
        backlog: stats.dcp_backlog,
      })),
      execution_stats: validFunctionStats.map(({ functionName, stats }) => ({
        functionName,
        on_update_success: stats.execution_stats.on_update_success,
        on_update_failure: stats.execution_stats.on_update_failure,
        on_delete_success: stats.execution_stats.on_delete_success,
        on_delete_failure: stats.execution_stats.on_delete_failure,
      })),
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
