/* src/monitoring/couchbaseMonitor.ts */

import {
  getFunctionList,
  getFunctionStats,
} from "../services/couchbaseServices";
import { recordAllMetrics } from "../metrics/couchbaseMetrics";
import { log, warn } from "$utils";

export async function monitorCouchbaseFunctions() {
  try {
    const functionList = await getFunctionList();
    log(`Retrieved ${functionList.length} functions to monitor`);

    for (const functionName of functionList) {
      try {
        log(`Fetching stats for function: ${functionName}`);
        const stats = await getFunctionStats(functionName);
        recordAllMetrics(functionName, stats);
        log(`Successfully recorded metrics for function: ${functionName}`);
      } catch (err) {
        const errorMessage = err instanceof Error ? err.message : String(err);
        warn(`Error monitoring function ${functionName}: ${errorMessage}`, {
          functionName,
          error: errorMessage,
        });
      }
    }
  } catch (err) {
    const errorMessage = err instanceof Error ? err.message : String(err);
    warn("Error in Couchbase function monitoring:", {
      error: errorMessage,
    });
  }
}

export function startCouchbaseMonitoring(intervalMs: number = 60000) {
  log("Starting Couchbase function monitoring...");
  setInterval(monitorCouchbaseFunctions, intervalMs);
}
