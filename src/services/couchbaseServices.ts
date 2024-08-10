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

const tracer = trace.getTracer("couchbase-eventing-service");

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

    log(`Fetching from Couchbase: ${url}`, {
      traceId: span.spanContext().traceId,
      spanId: span.spanContext().spanId,
    });
    try {
      const response = await fetch(url, { headers });
      span.setAttribute("http.status_code", response.status);

      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }
      const data = await response.json();
      log(`Successfully fetched data from ${url}`, {
        traceId: span.spanContext().traceId,
        spanId: span.spanContext().spanId,
      });
      span.setStatus({ code: SpanStatusCode.OK });
      return data;
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : "Unknown error";
      const errorType =
        err instanceof TypeError
          ? "Network Error"
          : err instanceof SyntaxError
            ? "Parsing Error"
            : "Unknown Error";
      error(`Error fetching from Couchbase: ${url}`, {
        error: errorMessage,
        errorType: errorType,
        traceId: span.spanContext().traceId,
        spanId: span.spanContext().spanId,
      });
      span.recordException(err as Error);
      span.setAttribute("error.type", errorType);
      span.setStatus({ code: SpanStatusCode.ERROR, message: errorMessage });
      throw err;
    } finally {
      span.end();
    }
  });
}

export async function getFunctionList(): Promise<string[]> {
  return tracer.startActiveSpan("getFunctionList", async (parentSpan) => {
    try {
      const data = await context.with(
        trace.setSpan(context.active(), parentSpan),
        async () => {
          return await fetchWithAuth("/api/v1/list/functions");
        },
      );
      parentSpan.setAttribute("function_count", data.functions.length);
      parentSpan.setStatus({ code: SpanStatusCode.OK });
      log("Successfully retrieved function list", {
        traceId: parentSpan.spanContext().traceId,
        spanId: parentSpan.spanContext().spanId,
      });
      return data.functions;
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : "Unknown error";
      const errorType =
        err instanceof TypeError
          ? "Network Error"
          : err instanceof SyntaxError
            ? "Parsing Error"
            : "Unknown Error";
      error("Error getting function list", {
        error: errorMessage,
        errorType: errorType,
        traceId: parentSpan.spanContext().traceId,
        spanId: parentSpan.spanContext().spanId,
      });
      parentSpan.recordException(err as Error);
      parentSpan.setAttribute("error.type", errorType);
      parentSpan.setStatus({
        code: SpanStatusCode.ERROR,
        message: errorMessage,
      });
      throw err;
    } finally {
      parentSpan.end();
    }
  });
}

export async function checkFunctionStatus(
  functionName: string,
): Promise<FunctionStatus> {
  return tracer.startActiveSpan(
    `checkFunctionStatus ${functionName}`,
    async (parentSpan) => {
      try {
        parentSpan.setAttribute("function.name", functionName);
        const status = await context.with(
          trace.setSpan(context.active(), parentSpan),
          async () => {
            return await fetchWithAuth(`/api/v1/status/${functionName}`);
          },
        );
        parentSpan.setAttribute("function.status", status.app.composite_status);
        parentSpan.setStatus({ code: SpanStatusCode.OK });
        log(`Successfully checked status for function: ${functionName}`, {
          traceId: parentSpan.spanContext().traceId,
          spanId: parentSpan.spanContext().spanId,
        });
        return status;
      } catch (err) {
        const errorMessage =
          err instanceof Error ? err.message : "Unknown error";
        const errorType =
          err instanceof TypeError
            ? "Network Error"
            : err instanceof SyntaxError
              ? "Parsing Error"
              : "Unknown Error";
        error(`Error checking status for function: ${functionName}`, {
          error: errorMessage,
          errorType: errorType,
          traceId: parentSpan.spanContext().traceId,
          spanId: parentSpan.spanContext().spanId,
        });
        parentSpan.recordException(err as Error);
        parentSpan.setAttribute("error.type", errorType);
        parentSpan.setStatus({
          code: SpanStatusCode.ERROR,
          message: errorMessage,
        });
        throw err;
      } finally {
        parentSpan.end();
      }
    },
  );
}

export async function checkExecutionStats(
  functionName: string,
): Promise<ExecutionStats> {
  return tracer.startActiveSpan(
    `checkExecutionStats ${functionName}`,
    async (parentSpan) => {
      try {
        parentSpan.setAttribute("function.name", functionName);
        const stats = await context.with(
          trace.setSpan(context.active(), parentSpan),
          async () => {
            return await fetchWithAuth(
              `/getExecutionStats?name=${functionName}`,
            );
          },
        );
        parentSpan.setAttribute(
          "execution.on_update_success",
          stats.on_update_success,
        );
        parentSpan.setAttribute(
          "execution.on_update_failure",
          stats.on_update_failure,
        );
        parentSpan.setStatus({ code: SpanStatusCode.OK });
        log(
          `Successfully checked execution stats for function: ${functionName}`,
          {
            traceId: parentSpan.spanContext().traceId,
            spanId: parentSpan.spanContext().spanId,
          },
        );
        return stats;
      } catch (err) {
        const errorMessage =
          err instanceof Error ? err.message : "Unknown error";
        const errorType =
          err instanceof TypeError
            ? "Network Error"
            : err instanceof SyntaxError
              ? "Parsing Error"
              : "Unknown Error";
        error(`Error checking execution stats for function: ${functionName}`, {
          error: errorMessage,
          errorType: errorType,
          traceId: parentSpan.spanContext().traceId,
          spanId: parentSpan.spanContext().spanId,
        });
        parentSpan.recordException(err as Error);
        parentSpan.setAttribute("error.type", errorType);
        parentSpan.setStatus({
          code: SpanStatusCode.ERROR,
          message: errorMessage,
        });
        throw err;
      } finally {
        parentSpan.end();
      }
    },
  );
}

export async function checkFailureStats(
  functionName: string,
): Promise<FailureStats> {
  return tracer.startActiveSpan(
    `checkFailureStats ${functionName}`,
    async (parentSpan) => {
      try {
        parentSpan.setAttribute("function.name", functionName);
        const stats = await context.with(
          trace.setSpan(context.active(), parentSpan),
          async () => {
            return await fetchWithAuth(`/getFailureStats?name=${functionName}`);
          },
        );
        parentSpan.setAttribute("failure.timeout_count", stats.timeout_count);
        parentSpan.setStatus({ code: SpanStatusCode.OK });
        log(
          `Successfully checked failure stats for function: ${functionName}`,
          {
            traceId: parentSpan.spanContext().traceId,
            spanId: parentSpan.spanContext().spanId,
          },
        );
        return stats;
      } catch (err) {
        const errorMessage =
          err instanceof Error ? err.message : "Unknown error";
        const errorType =
          err instanceof TypeError
            ? "Network Error"
            : err instanceof SyntaxError
              ? "Parsing Error"
              : "Unknown Error";
        error(`Error checking failure stats for function: ${functionName}`, {
          error: errorMessage,
          errorType: errorType,
          traceId: parentSpan.spanContext().traceId,
          spanId: parentSpan.spanContext().spanId,
        });
        parentSpan.recordException(err as Error);
        parentSpan.setAttribute("error.type", errorType);
        parentSpan.setStatus({
          code: SpanStatusCode.ERROR,
          message: errorMessage,
        });
        throw err;
      } finally {
        parentSpan.end();
      }
    },
  );
}

export async function checkDcpBacklogSize(
  functionName: string,
): Promise<DcpBacklogSize> {
  return tracer.startActiveSpan(
    `checkDcpBacklogSize ${functionName}`,
    async (parentSpan) => {
      try {
        parentSpan.setAttribute("function.name", functionName);
        const backlog = await context.with(
          trace.setSpan(context.active(), parentSpan),
          async () => {
            return await fetchWithAuth(
              `/getDcpEventsRemaining?name=${functionName}`,
            );
          },
        );
        parentSpan.setAttribute("dcp.backlog_size", backlog.dcp_backlog);
        parentSpan.setStatus({ code: SpanStatusCode.OK });
        log(
          `Successfully checked DCP backlog size for function: ${functionName}`,
          {
            traceId: parentSpan.spanContext().traceId,
            spanId: parentSpan.spanContext().spanId,
          },
        );
        return backlog;
      } catch (err) {
        const errorMessage =
          err instanceof Error ? err.message : "Unknown error";
        const errorType =
          err instanceof TypeError
            ? "Network Error"
            : err instanceof SyntaxError
              ? "Parsing Error"
              : "Unknown Error";
        error(`Error checking DCP backlog size for function: ${functionName}`, {
          error: errorMessage,
          errorType: errorType,
          traceId: parentSpan.spanContext().traceId,
          spanId: parentSpan.spanContext().spanId,
        });
        parentSpan.recordException(err as Error);
        parentSpan.setAttribute("error.type", errorType);
        parentSpan.setStatus({
          code: SpanStatusCode.ERROR,
          message: errorMessage,
        });
        throw err;
      } finally {
        parentSpan.end();
      }
    },
  );
}
