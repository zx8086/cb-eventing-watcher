// src/index.ts

import cron from "node-cron";
import config from "./config/config.js";
import * as couchbaseService from "./services/couchbaseServices.ts";
import { sendSlackAlert } from "./services/slackService.ts";
import { log, error } from "./utils/logger.ts";

async function checkStats(): Promise<void> {
  log("Running checkStats...");
  try {
    const functionList = await couchbaseService.getFunctionList();
    log(`Found ${functionList.length} functions`);

    for (const functionName of functionList) {
      log(`Checking function: ${functionName}`);
      const status = await couchbaseService.checkFunctionStatus(functionName);
      const executionStats =
        await couchbaseService.checkExecutionStats(functionName);
      const failureStats =
        await couchbaseService.checkFailureStats(functionName);
      const dcpBacklog =
        await couchbaseService.checkDcpBacklogSize(functionName);

      if (status.redeploy_required) {
        await sendSlackAlert(`Function ${functionName} requires redeployment.`);
      }

      if (dcpBacklog.dcp_backlog > config.DCP_BACKLOG_THRESHOLD) {
        await sendSlackAlert(
          `Function ${functionName} DCP backlog size exceeds threshold: ${dcpBacklog.dcp_backlog}`,
        );
      }

      // You can add more checks here based on executionStats and failureStats
      console.log("status", status);
      console.log("executionStats", executionStats);
      console.log("failureStats", failureStats);
      console.log("dcpBacklog", dcpBacklog);
    }

    log("Finished checking all functions");
  } catch (err) {
    let errorMessage: string;
    if (err instanceof Error) {
      errorMessage = `Error checking stats: ${err.message}`;
    } else {
      errorMessage = "Error checking stats: Unknown error";
    }
    error(errorMessage);
    await sendSlackAlert(errorMessage);
  }
}

async function startScheduler(): Promise<boolean> {
  log(
    `Attempting to schedule job with cron expression: ${config.CRON_SCHEDULE}`,
  );
  try {
    const job = cron.schedule(config.CRON_SCHEDULE, checkStats);
    log("Cron job scheduled successfully");
    return true;
  } catch (err) {
    const errorMessage = `Failed to schedule cron job: ${err instanceof Error ? err.message : "Unknown error"}`;
    error(errorMessage);
    await sendSlackAlert(errorMessage);
    return false;
  }
}

function simpleScheduler(): void {
  const intervalMs = 5 * 60 * 1000; // 5 minutes in milliseconds

  async function runCheckStats() {
    try {
      await checkStats();
    } catch (err) {
      const errorMessage = `Error in simple scheduler: ${err instanceof Error ? err.message : "Unknown error"}`;
      error(errorMessage);
      await sendSlackAlert(errorMessage);
    } finally {
      log(`Scheduling next check in ${intervalMs / 1000} seconds`);
      setTimeout(runCheckStats, intervalMs);
    }
  }

  log(`Starting simple scheduler with ${intervalMs / 1000} second interval`);
  runCheckStats();
}

// Start the application
log("Couchbase Eventing Watcher starting...");
(async () => {
  try {
    if (await startScheduler()) {
      log("Using cron scheduler");
    } else {
      log("Falling back to simple scheduler");
      simpleScheduler();
    }
    // Run an initial check immediately
    await checkStats();
  } catch (err) {
    const errorMessage = `Failed to start Couchbase Eventing Watcher: ${err instanceof Error ? err.message : "Unknown error"}`;
    error(errorMessage);
    await sendSlackAlert(errorMessage);
  }
})();
