// src/services/couchbaseService.ts
import config from "../config/config.ts";
import { log, error } from "../utils/logger.ts";
import type {
  CouchbaseFunction,
  FunctionStatus,
  ExecutionStats,
  FailureStats,
  DcpBacklogSize,
} from "../types/index.ts";
import { trace, context, SpanStatusCode } from "@opentelemetry/api";

const tracer = trace.getTracer("couchbase-service");

const baseURL = config.COUCHBASE_HOST;
const headers = new Headers({
  Authorization:
    "Basic " +
    btoa(`${config.COUCHBASE_USERNAME}:${config.COUCHBASE_PASSWORD}`),
  "Content-Type": "application/json",
});

async function fetchWithAuth(endpoint: string): Promise<any> {
  return tracer.startActiveSpan(`fetchWithAuth ${endpoint}`, async (span) => {
    const url = `${baseURL}${endpoint}`;
    span.setAttribute("http.url", url);
    span.setAttribute("http.method", "GET");

    log(`Fetching from Couchbase: ${url}`);
    try {
      const response = await fetch(url, { headers });
      span.setAttribute("http.status_code", response.status);

      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }
      const data = await response.json();
      log(`Successfully fetched data from ${url}`);
      span.setStatus({ code: SpanStatusCode.OK });
      return data;
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : "Unknown error";
      error(`Error fetching from Couchbase: ${url}`, { error: errorMessage });
      span.recordException(err as Error);
      span.setStatus({ code: SpanStatusCode.ERROR, message: errorMessage });
      throw err;
    } finally {
      span.end();
    }
  });
}

export async function getFunctionList(): Promise<string[]> {
  return tracer.startActiveSpan("getFunctionList", async (span) => {
    try {
      const data = await fetchWithAuth("/api/v1/list/functions");
      span.setAttribute("function_count", data.functions.length);
      span.setStatus({ code: SpanStatusCode.OK });
      return data.functions;
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : "Unknown error";
      error("Error getting function list", { error: errorMessage });
      span.recordException(err as Error);
      span.setStatus({ code: SpanStatusCode.ERROR, message: errorMessage });
      throw err;
    } finally {
      span.end();
    }
  });
}

export async function checkFunctionStatus(
  functionName: string,
): Promise<FunctionStatus> {
  return tracer.startActiveSpan(
    `checkFunctionStatus ${functionName}`,
    async (span) => {
      try {
        span.setAttribute("function.name", functionName);
        const status = await fetchWithAuth(`/api/v1/status/${functionName}`);
        span.setAttribute("function.status", status.app.composite_status);
        span.setStatus({ code: SpanStatusCode.OK });
        return status;
      } catch (err) {
        const errorMessage =
          err instanceof Error ? err.message : "Unknown error";
        error(`Error checking status for function: ${functionName}`, {
          error: errorMessage,
        });
        span.recordException(err as Error);
        span.setStatus({ code: SpanStatusCode.ERROR, message: errorMessage });
        throw err;
      } finally {
        span.end();
      }
    },
  );
}

export async function checkExecutionStats(
  functionName: string,
): Promise<ExecutionStats> {
  return tracer.startActiveSpan(
    `checkExecutionStats ${functionName}`,
    async (span) => {
      try {
        span.setAttribute("function.name", functionName);
        const stats = await fetchWithAuth(
          `/getExecutionStats?name=${functionName}`,
        );
        span.setAttribute(
          "execution.on_update_success",
          stats.on_update_success,
        );
        span.setAttribute(
          "execution.on_update_failure",
          stats.on_update_failure,
        );
        span.setStatus({ code: SpanStatusCode.OK });
        return stats;
      } catch (err) {
        const errorMessage =
          err instanceof Error ? err.message : "Unknown error";
        error(`Error checking execution stats for function: ${functionName}`, {
          error: errorMessage,
        });
        span.recordException(err as Error);
        span.setStatus({ code: SpanStatusCode.ERROR, message: errorMessage });
        throw err;
      } finally {
        span.end();
      }
    },
  );
}

export async function checkFailureStats(
  functionName: string,
): Promise<FailureStats> {
  return tracer.startActiveSpan(
    `checkFailureStats ${functionName}`,
    async (span) => {
      try {
        span.setAttribute("function.name", functionName);
        const stats = await fetchWithAuth(
          `/getFailureStats?name=${functionName}`,
        );
        span.setAttribute("failure.timeout_count", stats.timeout_count);
        span.setStatus({ code: SpanStatusCode.OK });
        return stats;
      } catch (err) {
        const errorMessage =
          err instanceof Error ? err.message : "Unknown error";
        error(`Error checking failure stats for function: ${functionName}`, {
          error: errorMessage,
        });
        span.recordException(err as Error);
        span.setStatus({ code: SpanStatusCode.ERROR, message: errorMessage });
        throw err;
      } finally {
        span.end();
      }
    },
  );
}

export async function checkDcpBacklogSize(
  functionName: string,
): Promise<DcpBacklogSize> {
  return tracer.startActiveSpan(
    `checkDcpBacklogSize ${functionName}`,
    async (span) => {
      try {
        span.setAttribute("function.name", functionName);
        const backlog = await fetchWithAuth(
          `/getDcpEventsRemaining?name=${functionName}`,
        );
        span.setAttribute("dcp.backlog_size", backlog.dcp_backlog);
        span.setStatus({ code: SpanStatusCode.OK });
        return backlog;
      } catch (err) {
        const errorMessage =
          err instanceof Error ? err.message : "Unknown error";
        error(`Error checking DCP backlog size for function: ${functionName}`, {
          error: errorMessage,
        });
        span.recordException(err as Error);
        span.setStatus({ code: SpanStatusCode.ERROR, message: errorMessage });
        throw err;
      } finally {
        span.end();
      }
    },
  );
}
