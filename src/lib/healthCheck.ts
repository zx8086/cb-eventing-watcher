/* src/lib/healthCheck.ts */

import { log, error, getUptime } from "$utils";
import { getFunctionList, getFunctionStats } from "$services";
import { trace, SpanStatusCode } from "@opentelemetry/api";
import { config } from "$config";
import { meter } from "../instrumentation";

const tracer = trace.getTracer("health-check-server");

let isApplicationHealthy = true;

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
  port: number = config.application.HEALTH_CHECK_PORT,
) {
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
  log(`Health Check Server started on ${server.url}`);

  return server;
}

async function runHealthCheck(span: trace.Span): Promise<Response> {
  try {
    const functionList = await getFunctionList();
    const functionStats = await Promise.all(
      functionList.map(async (functionName) => {
        try {
          const stats = await getFunctionStats(functionName);
          return { ...stats, name: functionName };
        } catch (err) {
          error(`Error fetching stats for function ${functionName}`, {
            error: err,
          });
          return { name: functionName, status: "error", error: String(err) };
        }
      }),
    );

    const validFunctionStats = functionStats.filter(
      (stats) => stats.status !== "error",
    );
    const errorFunctions = functionStats.filter(
      (stats) => stats.status === "error",
    );

    const successes = validFunctionStats.filter(
      (stats) => stats.status === "deployed",
    );
    const failures = validFunctionStats.filter(
      (stats) => stats.status !== "deployed",
    );
    const isEventingFunctionsHealthy =
      failures.length === 0 && errorFunctions.length === 0;

    // Record metrics (unchanged)
    dcpBacklogGauge.addCallback((observer) => {
      validFunctionStats.forEach((stats) => {
        if (stats && typeof stats.dcp_backlog === "number") {
          observer.observe(stats.dcp_backlog, { functionName: stats.name });
        }
      });
    });

    executionStatsGauge.addCallback((observer) => {
      validFunctionStats.forEach((stats) => {
        if (stats && stats.execution_stats) {
          const execStats = stats.execution_stats;
          [
            "on_update_success",
            "on_update_failure",
            "on_delete_success",
            "on_delete_failure",
          ].forEach((metric) => {
            if (typeof execStats[metric] === "number") {
              observer.observe(execStats[metric], {
                functionName: stats.name,
                metric,
              });
            }
          });
        }
      });
    });

    span.setAttribute("eventing_functions.healthy", isEventingFunctionsHealthy);
    span.setAttribute("application.healthy", isApplicationHealthy);
    span.setAttribute("successful_functions", successes.length);
    span.setAttribute(
      "failed_functions",
      failures.length + errorFunctions.length,
    );

    const response = {
      Status: {
        Watcher: isApplicationHealthy ? "OK" : "Potential Issues",
        Eventing: isEventingFunctionsHealthy ? "OK " : "Potential Issues",
      },
      Uptime: getUptime(),
      Functions: [
        ...validFunctionStats.map((stats) => ({
          name: stats.name,
          status: stats.status,
          success: stats.success,
          failure: stats.failure,
          backlog: stats.backlog,
          timeout: stats.timeout,
        })),
        ...errorFunctions.map((stats) => ({
          name: stats.name,
          status: "error",
          error: stats.error,
        })),
      ],
      "Detailed Eventing Metrics": validFunctionStats.map((stats) => ({
        name: stats.name,
        dcp_backlog: stats.dcp_backlog,
        execution_stats: stats.execution_stats,
      })),
    };

    const responseJson = JSON.stringify(response, null, 2);

    span.setStatus({ code: SpanStatusCode.OK });
    log("Health check completed", {
      traceId: span.spanContext().traceId,
      spanId: span.spanContext().spanId,
      applicationStatus: response.Status.Application,
      eventingFunctionsStatus: response.Status["Eventing Functions"],
      successCount: successes.length,
      failureCount: failures.length,
      errorCount: errorFunctions.length,
    });

    return new Response(responseJson, {
      status: isApplicationHealthy && isEventingFunctionsHealthy ? 200 : 503,
      headers: { "Content-Type": "application/json" },
    });
  } catch (err) {
    handleError(span, err as Error);
    return new Response("Internal Server Error", { status: 500 });
  }
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
