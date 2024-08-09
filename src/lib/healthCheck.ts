// src/healthCheck.ts

import type { Server } from "bun";
import { log, error } from "$utils/index";
import { getLatestFunctionStatuses } from "$lib/index";

let isApplicationHealthy = true;

export function setApplicationStatus(healthy: boolean) {
  isApplicationHealthy = healthy;
}

export function startHealthCheckServer(port: number = 8080): Server {
  const server = Bun.serve({
    port: port,
    fetch(req) {
      const url = new URL(req.url);
      if (url.pathname === "/health") {
        const latestStatuses = getLatestFunctionStatuses();
        const successes = latestStatuses.filter(
          (status) => status.status === "success",
        );
        const failures = latestStatuses.filter(
          (status) => status.status === "error",
        );

        const isEventingFunctionsHealthy = failures.length === 0;

        const response = {
          application_status: isApplicationHealthy ? "Healthy" : "Unhealthy",
          eventing_functions_status: isEventingFunctionsHealthy
            ? "Healthy"
            : "Unhealthy",
          details: {
            successes,
            failures,
          },
        };

        return new Response(JSON.stringify(response, null, 2), {
          status: isApplicationHealthy ? 200 : 503,
          headers: { "Content-Type": "application/json" },
        });
      }
      return new Response("Not Found", { status: 404 });
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
