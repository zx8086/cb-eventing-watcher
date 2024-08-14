/* src/monitoring/couchbaseMonitor.ts */

import {
  getFunctionList,
  checkFunctionStatus,
  checkExecutionStats,
  checkFailureStats,
  checkDcpBacklogSize,
} from "$services";
import {
  recordFunctionStatus,
  recordExecutionStats,
  recordFailureStats,
  recordDcpBacklog,
} from "$metrics";
import { log, warn } from "$utils";

export async function getEventingMetrics() {
  try {
    const functionList = await getFunctionList();
    log(`Retrieved ${functionList.length} functions for Metrics monitoring`);

    for (const functionName of functionList) {
      try {
        log(`Fetching Metrics for Eventing function: ${functionName}`);

        const [status, executionStats, failureStats, dcpBacklog] =
          await Promise.all([
            checkFunctionStatus(functionName),
            checkExecutionStats(functionName),
            checkFailureStats(functionName),
            checkDcpBacklogSize(functionName),
          ]);

        log(`Received Metrics for ${functionName}`);

        // Record metrics individually
        recordFunctionStatus(functionName, status);
        recordExecutionStats(functionName, executionStats);
        recordFailureStats(functionName, failureStats);
        recordDcpBacklog(functionName, dcpBacklog);

        log(
          `Successfully recorded Metrics for Eventing function: ${functionName}`,
        );
      } catch (err) {
        const errorMessage = err instanceof Error ? err.message : String(err);
        warn(
          `Error in Eventing Metrics monitoring for function ${functionName}: ${errorMessage}`,
          {
            functionName,
            error: errorMessage,
          },
        );
      }
    }
  } catch (err) {
    const errorMessage = err instanceof Error ? err.message : String(err);
    warn("Error in Eventing Metrics monitoring:", {
      error: errorMessage,
    });
  }
}

// export function startCouchbaseMonitoring(intervalMs: number = 60000) {
//   log("Starting Eventing Metrics monitoring...");
//   setInterval(monitorCouchbaseFunctions, intervalMs);
// }
