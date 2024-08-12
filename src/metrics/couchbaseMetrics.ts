/* src/metrics/couchbaseMetrics.ts */

import { meter } from "../instrumentation";
import type {
  ExecutionStats,
  FailureStats,
  DcpBacklogSize,
  FunctionStatus,
} from "$types/eventing";
import { log, error } from "$utils";

// Manually define the keys for ExecutionStats that we want to measure
const executionStatsKeys = [
  "agg_queue_memory",
  "agg_queue_size",
  "dcp_delete_msg_counter",
  "dcp_mutation_msg_counter",
  "messages_parsed",
  "on_delete_failure",
  "on_delete_success",
  "on_update_failure",
  "on_update_success",
  // Add other keys as needed
] as const;

// Create a metric for each field in ExecutionStats
const executionStatsMetrics = executionStatsKeys.reduce(
  (acc, key) => {
    acc[key] = meter.createObservableGauge(
      `couchbase.function.execution_stats.${key}`,
      {
        description: `Execution stat: ${key}`,
        unit: "1",
      },
    );
    return acc;
  },
  {} as Record<(typeof executionStatsKeys)[number], any>,
);

// Manually define the keys for FailureStats that we want to measure
const failureStatsKeys = [
  "analytics_op_exception_count",
  "bucket_op_exception_count",
  "checkpoint_failure_count",
  "n1ql_op_exception_count",
  "timeout_count",
  // Add other keys as needed
] as const;

// Create a metric for each field in FailureStats
const failureStatsMetrics = failureStatsKeys.reduce(
  (acc, key) => {
    acc[key] = meter.createObservableGauge(
      `couchbase.function.failure_stats.${key}`,
      {
        description: `Failure stat: ${key}`,
        unit: "1",
      },
    );
    return acc;
  },
  {} as Record<(typeof failureStatsKeys)[number], any>,
);

// Function status metric
const functionStatusGauge = meter.createObservableGauge(
  "couchbase.function.status",
  {
    description: "Status of Couchbase function",
    unit: "1",
  },
);

// DCP backlog metric
const dcpBacklogGauge = meter.createObservableGauge(
  "couchbase.function.dcp_backlog",
  {
    description: "DCP backlog size",
    unit: "1",
  },
);

export function recordExecutionStats(
  functionName: string,
  stats: ExecutionStats,
) {
  log(`Recording execution stats for ${functionName}`);
  executionStatsKeys.forEach((key) => {
    try {
      const value = stats[key];
      if (typeof value === "number") {
        executionStatsMetrics[key].addCallback((observer) => {
          observer.observe(value, { functionName });
        });
        log(`Recorded execution stat ${key} for ${functionName}: ${value}`);
      }
    } catch (err) {
      error(`Error recording execution stat ${key} for ${functionName}:`, err);
    }
  });

  // Handle curl stats separately
  if (stats.curl) {
    Object.entries(stats.curl).forEach(([curlMethod, curlCount]) => {
      try {
        meter
          .createObservableGauge(
            `couchbase.function.execution_stats.curl.${curlMethod}`,
            {
              description: `CURL ${curlMethod} count`,
              unit: "1",
            },
          )
          .addCallback((observer) => {
            observer.observe(curlCount, { functionName });
          });
        log(
          `Recorded curl stat ${curlMethod} for ${functionName}: ${curlCount}`,
        );
      } catch (err) {
        error(
          `Error recording curl stat ${curlMethod} for ${functionName}:`,
          err,
        );
      }
    });
  }
}

export function recordFailureStats(functionName: string, stats: FailureStats) {
  log(`Recording failure stats for ${functionName}`);
  failureStatsKeys.forEach((key) => {
    try {
      const value = stats[key];
      if (typeof value === "number") {
        failureStatsMetrics[key].addCallback((observer) => {
          observer.observe(value, { functionName });
        });
        log(`Recorded failure stat ${key} for ${functionName}: ${value}`);
      }
    } catch (err) {
      error(`Error recording failure stat ${key} for ${functionName}:`, err);
    }
  });
}

export function recordDcpBacklog(
  functionName: string,
  backlog: DcpBacklogSize,
) {
  try {
    log(`Recording DCP backlog for ${functionName}`);
    dcpBacklogGauge.addCallback((observer) => {
      observer.observe(backlog.dcp_backlog, { functionName });
    });
    log(`Recorded DCP backlog for ${functionName}: ${backlog.dcp_backlog}`);
  } catch (err) {
    error(`Error recording DCP backlog for ${functionName}:`, err);
  }
}

export function recordFunctionStatus(
  functionName: string,
  status: FunctionStatus,
) {
  try {
    log(`Recording function status for ${functionName}`);
    const statusValue =
      status.app.deployment_status && status.app.processing_status ? 1 : 0;
    functionStatusGauge.addCallback((observer) => {
      observer.observe(statusValue, { functionName });
    });
    log(`Recorded function status for ${functionName}: ${statusValue}`);
  } catch (err) {
    error(`Error recording function status for ${functionName}:`, err);
  }
}

export function recordAllMetrics(
  functionName: string,
  status: FunctionStatus,
  executionStats: ExecutionStats,
  failureStats: FailureStats,
  dcpBacklog: DcpBacklogSize,
) {
  try {
    recordFunctionStatus(functionName, status);
    recordExecutionStats(functionName, executionStats);
    recordFailureStats(functionName, failureStats);
    recordDcpBacklog(functionName, dcpBacklog);
  } catch (err) {
    error(`Error recording metrics for ${functionName}:`, err);
  }
}
