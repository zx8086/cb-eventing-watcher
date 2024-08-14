/* src/lib/healthCheck.ts */

import { log, error, getUptime } from "$utils";
import { getFunctionList, getFunctionStats } from "$services";
import { config } from "$config";
import { meter } from "../instrumentation";
import { trace, SpanStatusCode, type Span } from "@opentelemetry/api";
import type {
  CouchbaseFunction,
  FunctionStatus,
  ExecutionStats,
  FailureStats,
  DcpBacklogSize,
  FunctionStats,
} from "$types";
import type { Server } from "bun";

const tracer = trace.getTracer(
  config.openTelemetry.SERVICE_NAME,
  config.openTelemetry.SERVICE_VERSION,
);

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

export function startHealthCheckServer(port: number = 3000): Server {
  const server = Bun.serve({
    port: port,
    hostname: "0.0.0.0",
    fetch(req: Request) {
      return tracer.startActiveSpan("health_check", async (span: Span) => {
        try {
          const url = new URL(req.url);
          span.setAttribute("http.method", req.method);
          span.setAttribute("http.url", url.pathname);
          if (url.pathname === "/health") {
            return await runHealthCheck(span, url);
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
  log(
    `Health Check Server started on http://${server.hostname}:${server.port}/`,
  );

  return server;
}

async function runHealthCheck(span: Span, url: URL): Promise<Response> {
  try {
    const showDetailed = url.searchParams.get("detailed");
    const filterName = url.searchParams.get("name");

    // Validate parameters
    if (
      showDetailed !== null &&
      showDetailed !== "true" &&
      showDetailed !== "false"
    ) {
      return new Response(
        JSON.stringify({
          error: "Invalid 'detailed' parameter. Use 'true' or 'false'.",
        }),
        {
          status: 400,
          headers: { "Content-Type": "application/json" },
        },
      );
    }

    if (filterName !== null && filterName.trim() === "") {
      return new Response(
        JSON.stringify({
          error: "Invalid 'name' parameter. Provide a non-empty string.",
        }),
        {
          status: 400,
          headers: { "Content-Type": "application/json" },
        },
      );
    }

    const functionList = await getFunctionList();
    const functionStats = await Promise.all(
      functionList.map(async (functionName: string) => {
        try {
          const stats = await getFunctionStats(functionName);
          return {
            name: functionName,
            ...stats,
          };
        } catch (err) {
          error(`Error fetching stats for function ${functionName}`, {
            error: err,
          });
          return {
            name: functionName,
            status: "undeployed" as const,
            success: 0,
            failure: 0,
            backlog: 0,
            timeout: 0,
            error: String(err),
            execution_stats: {} as ExecutionStats,
            failure_stats: {} as FailureStats,
            dcp_backlog: 0,
          };
        }
      }),
    );

    // Sort functionStats by name
    functionStats.sort((a, b) => a.name.localeCompare(b.name));

    let filteredFunctionStats = functionStats;
    if (filterName) {
      filteredFunctionStats = functionStats.filter((stats) =>
        stats.name.includes(filterName),
      );
      if (filteredFunctionStats.length === 0) {
        return new Response(
          JSON.stringify({
            error: `No functions found matching the name '${filterName}'.`,
          }),
          {
            status: 404,
            headers: { "Content-Type": "application/json" },
          },
        );
      }
    }

    const deployedFunctions = filteredFunctionStats.filter(
      (stats) => stats.status === "deployed",
    );
    const undeployedFunctions = filteredFunctionStats.filter(
      (stats) => stats.status === "undeployed",
    );
    const pausedFunctions = filteredFunctionStats.filter(
      (stats) => stats.status === "paused",
    );
    const isEventingFunctionsHealthy =
      undeployedFunctions.length === 0 && pausedFunctions.length === 0;

    const currentTimestamp = new Date();
    currentTimestamp.setHours(currentTimestamp.getHours() + 2);
    const formattedTimestamp = currentTimestamp.toISOString();

    const response: any = {
      timestamp: formattedTimestamp,
      status: {
        watcher: isApplicationHealthy ? "OK" : "Potential Issue(s)",
        eventing: isEventingFunctionsHealthy ? "OK" : "Potential Issue(s)",
      },
      uptime: getUptime(),
      functions: filteredFunctionStats.map((stats) => {
        const baseInfo = {
          name: stats.name,
          status: stats.status,
          lastChecked: formattedTimestamp,
        };
        if (stats.status === "deployed") {
          return {
            ...baseInfo,
            success: stats.success,
            failure: stats.failure,
            backlog: stats.backlog,
            timeout: stats.timeout,
          };
        } else if (stats.status === "undeployed") {
          return {
            ...baseInfo,
            error: stats.error,
          };
        } else {
          return baseInfo;
        }
      }),
      summary: {
        total: filteredFunctionStats.length,
        deployed: deployedFunctions.length,
        undeployed: undeployedFunctions.length,
        paused: pausedFunctions.length,
      },
    };

    if (showDetailed === "true") {
      response.detailedEventingMetrics = deployedFunctions.map((stats) => ({
        name: stats.name,
        backlog: stats.backlog,
        success: stats.success,
        failure: stats.failure,
        dcp_backlog: stats.dcp_backlog,
        execution_stats: stats.execution_stats,
        failure_stats: stats.failure_stats,
        lastChecked: formattedTimestamp,
      }));
    }

    const responseJson = JSON.stringify(response, null, 2);
    span.setStatus({ code: SpanStatusCode.OK });
    log("Health check completed", {
      traceId: span.spanContext().traceId,
      spanId: span.spanContext().spanId,
      applicationStatus: response.status.watcher,
      eventingFunctionsStatus: response.status.eventing,
      deployedCount: deployedFunctions.length,
      undeployedCount: undeployedFunctions.length,
      pausedCount: pausedFunctions.length,
      timestamp: formattedTimestamp,
      filterName: filterName || "none",
      showDetailed: showDetailed,
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

function handleError(span: Span, err: Error) {
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

process.on("uncaughtException", (err: Error) => {
  error("Uncaught Exception", { error: err.message });
  setApplicationStatus(false);
});

process.on(
  "unhandledRejection",
  (reason: unknown, promise: Promise<unknown>) => {
    error("Unhandled Rejection", { reason: String(reason) });
    setApplicationStatus(false);
  },
);
