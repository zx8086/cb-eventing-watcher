/* src/metrics/couchbaseMetrics.ts */

import { meter } from "../instrumentation";

import {
  ExecutionStats,
  FailureStats,
  FunctionStats,
} from "../types/eventingMetrics";

import { log } from "$utils"; // Assuming you have a logging utility

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
    log(
      `Observed rates for ${functionName}: success=${values.success}, failure=${values.failure}, timeout=${values.timeout}`,
    );
  }
});

export function recordFunctionMetrics(
  functionName: string,
  stats: FunctionStats,
) {
  const statusValue = stats.status === "deployed" ? 1 : 0;
  functionStatusGauge.add(statusValue, { functionName });
  log(`Recorded status for ${functionName}: ${statusValue}`);

  functionInvocationsCounter.add(stats.success, {
    functionName,
    type: "success",
  });
  log(`Recorded successful invocations for ${functionName}: ${stats.success}`);

  functionFailuresCounter.add(stats.failure, { functionName });
  log(`Recorded failures for ${functionName}: ${stats.failure}`);

  functionBacklogGauge.add(stats.backlog, { functionName });
  log(`Recorded backlog for ${functionName}: ${stats.backlog}`);

  functionTimeoutCounter.add(stats.timeout, { functionName });
  log(`Recorded timeouts for ${functionName}: ${stats.timeout}`);

  // Update latest values for rate calculations
  latestValues.set(functionName, {
    success: stats.success,
    failure: stats.failure,
    timeout: stats.timeout,
  });
  log(
    `Updated latest values for ${functionName}: success=${stats.success}, failure=${stats.failure}, timeout=${stats.timeout}`,
  );
}

export function recordAllMetrics(functionName: string, stats: FunctionStats) {
  log(`Recording all metrics for ${functionName}`);
  recordFunctionMetrics(functionName, stats);
  log(`Finished recording all metrics for ${functionName}`);
}
