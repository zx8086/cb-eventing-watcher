/* src/healthCheck.ts */

import type { Server } from "bun";
import { log, error } from "$utils/index";
import { getLatestFunctionStatuses } from "$lib/index";
import { trace, context, SpanStatusCode } from "@opentelemetry/api";

const tracer = trace.getTracer("health-check-server");

let isApplicationHealthy = true;

export function setApplicationStatus(healthy: boolean) {
  isApplicationHealthy = healthy;
}

export function startHealthCheckServer(port: number = 8080): Server {
  const server = Bun.serve({
    port: port,
    fetch(req) {
      return tracer.startActiveSpan("health_check", async (span) => {
        try {
          const url = new URL(req.url);
          span.setAttribute("http.method", req.method);
          span.setAttribute("http.url", url.pathname);

          if (url.pathname === "/health") {
            const latestStatuses = getLatestFunctionStatuses();
            const successes = latestStatuses.filter(
              (status) => status.status === "success",
            );
            const failures = latestStatuses.filter(
              (status) => status.status === "error",
            );
            const isEventingFunctionsHealthy = failures.length === 0;

            span.setAttribute(
              "eventing_functions.healthy",
              isEventingFunctionsHealthy,
            );
            span.setAttribute("application.healthy", isApplicationHealthy);
            span.setAttribute("successful_functions", successes.length);
            span.setAttribute("failed_functions", failures.length);

            const response = {
              application_status: isApplicationHealthy
                ? "Healthy"
                : "Unhealthy",
              eventing_functions_status: isEventingFunctionsHealthy
                ? "Healthy"
                : "Unhealthy",
              details: {
                successes,
                failures,
              },
            };

            span.setStatus({ code: SpanStatusCode.OK });
            return new Response(JSON.stringify(response, null, 2), {
              status: isApplicationHealthy ? 200 : 503,
              headers: { "Content-Type": "application/json" },
            });
          }

          span.setStatus({ code: SpanStatusCode.ERROR, message: "Not Found" });
          return new Response("Not Found", { status: 404 });
        } catch (err) {
          span.recordException(err as Error);
          span.setStatus({
            code: SpanStatusCode.ERROR,
            message: (err as Error).message,
          });
          throw err;
        } finally {
          span.end();
        }
      });
    },
  });

  log(`Health check server started on ${server.url}`);
  return server;
}

process.on("uncaughtException", (err) => {
  error("Uncaught Exception", { error: err.message });
  setApplicationStatus(false);
});

process.on("unhandledRejection", (reason, promise) => {
  error("Unhandled Rejection", { reason: reason });
  setApplicationStatus(false);
});
