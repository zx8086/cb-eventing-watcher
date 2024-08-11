/* src/metrics/couchbaseMetrics.ts */

import { meter } from "../instrumentation";
import type { FunctionStats } from "../types/eventing";

// Metric Instruments
const functionStatusGauge = meter.createUpDownCounter(
  "couchbase.function.status",
  {
    description:
      "Status of Couchbase functions (1 for deployed, 0 for undeployed)",
    unit: "1",
  },
);

const functionInvocationsCounter = meter.createCounter(
  "couchbase.function.invocations",
  {
    description: "Number of function invocations",
    unit: "1",
  },
);

const functionFailuresCounter = meter.createCounter(
  "couchbase.function.failures",
  {
    description: "Number of function failures",
    unit: "1",
  },
);

const functionBacklogGauge = meter.createUpDownCounter(
  "couchbase.function.backlog",
  {
    description: "Current function backlog",
    unit: "1",
  },
);

const functionTimeoutCounter = meter.createCounter(
  "couchbase.function.timeouts",
  {
    description: "Number of function timeouts",
    unit: "1",
  },
);

// We'll use this object to store the latest values for rate calculations
const latestValues = new Map<
  string,
  { success: number; failure: number; timeout: number }
>();

const functionRatesGauge = meter.createObservableGauge(
  "couchbase.function.rates",
  {
    description: "Rates of function invocations, failures, and timeouts",
    unit: "1/s",
  },
);

functionRatesGauge.addCallback((observer) => {
  for (const [functionName, values] of latestValues.entries()) {
    observer.observe(values.success, { functionName, type: "success_rate" });
    observer.observe(values.failure, { functionName, type: "failure_rate" });
    observer.observe(values.timeout, { functionName, type: "timeout_rate" });
  }
});

export function recordFunctionMetrics(
  functionName: string,
  stats: FunctionStats,
) {
  functionStatusGauge.add(stats.status === "deployed" ? 1 : 0, {
    functionName,
  });
  functionInvocationsCounter.add(stats.success, {
    functionName,
    type: "success",
  });
  functionFailuresCounter.add(stats.failure, { functionName });
  functionBacklogGauge.add(stats.backlog, { functionName });
  functionTimeoutCounter.add(stats.timeout, { functionName });

  // Update latest values for rate calculations
  latestValues.set(functionName, {
    success: stats.success,
    failure: stats.failure,
    timeout: stats.timeout,
  });
}

export function recordAllMetrics(functionName: string, stats: FunctionStats) {
  recordFunctionMetrics(functionName, stats);
}
