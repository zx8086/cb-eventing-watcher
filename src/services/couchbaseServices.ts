/* src/services/couchbaseServices.ts */

import config from "../config/config.ts";
import { log, error } from "$utils";
import type {
  CouchbaseFunction,
  FunctionStatus,
  ExecutionStats,
  FailureStats,
  DcpBacklogSize,
} from "../types/index.ts";
import {
  trace,
  context,
  SpanStatusCode,
  SpanKind,
  propagation,
} from "@opentelemetry/api";
import {
  SEMRESATTRS_SERVICE_NAME,
  SEMRESATTRS_SERVICE_VERSION,
  SEMRESATTRS_DEPLOYMENT_ENVIRONMENT,
} from "@opentelemetry/semantic-conventions";

const tracer = trace.getTracer("couchbase-eventing-watcher");

const baseURL = config.eventing.COUCHBASE_URL;
const headers = new Headers({
  Authorization:
    "Basic " +
    btoa(
      `${config.eventing.COUCHBASE_USERNAME}:${config.eventing.COUCHBASE_PASSWORD}`,
    ),
  "Content-Type": "application/json",
});

// Fetching data from Couchbase
async function fetchWithAuth<T>(
  endpoint: string,
  spanName: string,
): Promise<T> {
  return tracer.startActiveSpan(
    spanName,
    {
      kind: SpanKind.CLIENT,
      attributes: {
        "http.method": "GET",
        "http.url": `${baseURL}${endpoint}`,
      },
    },
    async (span) => {
      const url = `${baseURL}${endpoint}`;
      span.setAttribute("http.url", url);
      span.setAttribute("http.method", "GET");

      log(`Fetching from Couchbase Eventing Service: ${url}`);

      try {
        const carrier = {};
        propagation.inject(context.active(), carrier);
        const fetchHeaders = new Headers(headers);
        Object.entries(carrier).forEach(([key, value]) => {
          fetchHeaders.append(key, value as string);
        });

        const response = await fetch(url, { headers: fetchHeaders });
        span.setAttribute("http.status_code", response.status);

        if (!response.ok) {
          throw new Error(`HTTP error! status: ${response.status}`);
        }

        const data = await response.json();

        log(`Successfully fetched from ${url}`);

        span.setStatus({ code: SpanStatusCode.OK });
        return data;
      } catch (err) {
        handleError(err, url, span);
        throw err;
      } finally {
        span.end();
      }
    },
  );
}

// Wrapping operations with trace and logging
async function tracedOperation<T>(
  operationName: string,
  operation: () => Promise<T>,
  attributes: Record<string, string | number> = {},
): Promise<T> {
  return tracer.startActiveSpan(
    operationName,
    {
      kind: SpanKind.INTERNAL,
      attributes: {
        [SEMRESATTRS_SERVICE_NAME]: config.openTelemetry.SERVICE_NAME,
        ...attributes,
      },
    },
    async (parentSpan) => {
      try {
        const result = await context.with(
          trace.setSpan(context.active(), parentSpan),
          operation,
        );
        log(`Successfully completed ${operationName}`);
        parentSpan.setStatus({ code: SpanStatusCode.OK });
        return result;
      } catch (err) {
        handleError(err, operationName, parentSpan);
        throw err;
      } finally {
        parentSpan.end();
      }
    },
  );
}

// Error handling
function handleError(err: unknown, operationName: string, span: any) {
  const errorMessage = err instanceof Error ? err.message : "Unknown error";
  const errorType =
    err instanceof TypeError
      ? "Network Error"
      : err instanceof SyntaxError
        ? "Parsing Error"
        : "Unknown Error";

  error(`Error in operation: ${operationName}`, {
    error: errorMessage,
    errorType: errorType,
  });

  span.recordException(err as Error);
  span.setAttribute("error.type", errorType);
  span.setAttribute("error.message", errorMessage);
  span.setStatus({ code: SpanStatusCode.ERROR, message: errorMessage });
}

// Example usage in service functions
export async function getFunctionList(): Promise<string[]> {
  return tracedOperation(
    "getFunctionList",
    async () => {
      const data = await fetchWithAuth<{ functions: string[] }>(
        "/api/v1/list/functions",
        "fetchFunctionList",
      );
      return data.functions;
    },
    { "code.namespace": "couchbase.functions" },
  );
}

export async function checkFunctionStatus(
  functionName: string,
): Promise<FunctionStatus> {
  return tracedOperation(
    "checkFunctionStatus",
    async () => {
      return await fetchWithAuth<FunctionStatus>(
        `/api/v1/status/${functionName}`,
        `fetchFunctionStatus ${functionName}`,
      );
    },
    {
      "code.namespace": "couchbase.functions",
      "code.function": "checkFunctionStatus",
      "function.name": functionName,
    },
  );
}

export async function checkExecutionStats(
  functionName: string,
): Promise<ExecutionStats> {
  return tracedOperation(
    "checkExecutionStats",
    async () => {
      return await fetchWithAuth<ExecutionStats>(
        `/getExecutionStats?name=${functionName}`,
        `fetchExecutionStats ${functionName}`,
      );
    },
    {
      "code.namespace": "couchbase.functions",
      "code.function": "checkExecutionStats",
      "function.name": functionName,
    },
  );
}

export async function checkFailureStats(
  functionName: string,
): Promise<FailureStats> {
  return tracedOperation(
    "checkFailureStats",
    async () => {
      return await fetchWithAuth<FailureStats>(
        `/getFailureStats?name=${functionName}`,
        `fetchFailureStats ${functionName}`,
      );
    },
    {
      "code.namespace": "couchbase.functions",
      "code.function": "checkFailureStats",
      "function.name": functionName,
    },
  );
}

export async function checkDcpBacklogSize(
  functionName: string,
): Promise<DcpBacklogSize> {
  return tracedOperation(
    "checkDcpBacklogSize",
    async () => {
      return await fetchWithAuth<DcpBacklogSize>(
        `/getDcpEventsRemaining?name=${functionName}`,
        `fetchDcpBacklogSize ${functionName}`,
      );
    },
    {
      "code.namespace": "couchbase.functions",
      "code.function": "checkDcpBacklogSize",
      "function.name": functionName,
    },
  );
}
