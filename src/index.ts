// src/index.ts

import cron from "node-cron";
import config from "./config/config.js";
import * as couchbaseService from "./services/couchbaseServices.ts";
import { sendSlackAlert, AlertSeverity } from "./services/slackService.ts";
import { log, error } from "./utils/logger.ts";

async function checkStats(): Promise<void> {
  log("Running checkStats...");
  try {
    const functionList = await couchbaseService.getFunctionList();
    log(`Found ${functionList.length} functions`);

    for (const functionName of functionList) {
      try {
        log(`Checking function: ${functionName}`);
        const status = await couchbaseService.checkFunctionStatus(functionName);
        const executionStats =
          await couchbaseService.checkExecutionStats(functionName);
        const failureStats =
          await couchbaseService.checkFailureStats(functionName);
        const dcpBacklog =
          await couchbaseService.checkDcpBacklogSize(functionName);

        if (status.app.redeploy_required) {
          await sendSlackAlert("Function requires redeployment", {
            severity: AlertSeverity.WARNING,
            functionName: functionName,
            additionalContext: {
              status: status.app.composite_status,
              deploymentStatus: status.app.deployment_status,
              processingStatus: status.app.processing_status,
            },
          });
        }

        if (dcpBacklog.dcp_backlog > config.DCP_BACKLOG_THRESHOLD) {
          await sendSlackAlert("DCP backlog size exceeds threshold", {
            severity: AlertSeverity.ERROR,
            functionName: functionName,
            additionalContext: {
              backlogSize: dcpBacklog.dcp_backlog,
              threshold: config.DCP_BACKLOG_THRESHOLD,
            },
          });
        }
      } catch (funcError) {
        const errorMessage =
          funcError instanceof Error ? funcError.message : "Unknown error";
        error(`Error checking function ${functionName}: ${errorMessage}`);
        await sendSlackAlert(
          `Error checking Couchbase function: ${functionName}`,
          {
            severity: AlertSeverity.ERROR,
            functionName: functionName,
            additionalContext: {
              error: errorMessage,
              stage: "individual function check",
            },
          },
        );
      }
    }
    log("Finished checking all functions");
  } catch (err) {
    const errorMessage = err instanceof Error ? err.message : "Unknown error";
    error(`Error in checkStats: ${errorMessage}`);
    await sendSlackAlert("Error checking Couchbase function stats", {
      severity: AlertSeverity.ERROR,
      additionalContext: {
        error: errorMessage,
        stage: "initial function list fetch or overall process",
      },
    });
  }
}

async function startScheduler(): Promise<boolean> {
  log(
    `Attempting to schedule job with cron expression: ${config.CRON_SCHEDULE}`,
  );
  try {
    cron.schedule(config.CRON_SCHEDULE, checkStats);
    log("Cron job scheduled successfully");
    return true;
  } catch (err) {
    const errorMessage = err instanceof Error ? err.message : "Unknown error";
    error(`Failed to schedule cron job: ${errorMessage}`);
    await sendSlackAlert("Failed to schedule Couchbase monitoring job", {
      severity: AlertSeverity.ERROR,
      additionalContext: {
        error: errorMessage,
        cronSchedule: config.CRON_SCHEDULE,
      },
    });
    return false;
  }
}

function simpleScheduler(): void {
  const intervalMs = 5 * 60 * 1000; // 5 minutes in milliseconds
  async function runCheckStats() {
    try {
      await checkStats();
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : "Unknown error";
      error(`Error in simple scheduler: ${errorMessage}`);
      await sendSlackAlert("Error in Couchbase monitoring simple scheduler", {
        severity: AlertSeverity.ERROR,
        additionalContext: { error: errorMessage },
      });
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
      await sendSlackAlert(
        "Couchbase Eventing Watcher started with cron scheduler",
        {
          severity: AlertSeverity.INFO,
          additionalContext: { cronSchedule: config.CRON_SCHEDULE },
        },
      );
    } else {
      log("Falling back to simple scheduler");
      simpleScheduler();
      await sendSlackAlert(
        "Couchbase Eventing Watcher started with simple scheduler",
        {
          severity: AlertSeverity.INFO,
          additionalContext: { interval: "5 minutes" },
        },
      );
    }
    // Run an initial check immediately
    await checkStats();
  } catch (err) {
    const errorMessage = err instanceof Error ? err.message : "Unknown error";
    error(`Failed to start Couchbase Eventing Watcher: ${errorMessage}`);
    await sendSlackAlert("Failed to start Couchbase Eventing Watcher", {
      severity: AlertSeverity.ERROR,
      additionalContext: { error: errorMessage },
    });
  }
})();
