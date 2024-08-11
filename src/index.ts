/* src/index.ts */

import cron from "node-cron";
import { config } from "$config";
import { log, error, warn, debug } from "$utils";
import {
  startHealthCheckServer,
  setApplicationStatus,
  updateFunctionStatus,
  removeOutdatedFunctions,
} from "$lib/index.ts";

import {
  getFunctionList,
  checkFunctionStatus,
  checkExecutionStats,
  checkFailureStats,
  checkDcpBacklogSize,
  sendSlackAlert,
  AlertSeverity,
} from "$services/index.ts";

import { startCouchbaseMonitoring } from "./monitoring/couchbaseMonitor";

async function checkEventingService(): Promise<void> {
  log("Running checkEventingService...");
  try {
    const functionList = await getFunctionList();
    log(`Found ${functionList.length} functions`, {
      functionCount: functionList.length,
    });

    removeOutdatedFunctions(functionList);

    for (const functionName of functionList) {
      try {
        log(`Checking Eventing Function: ${functionName}`, {
          function: functionName,
        });
        const status = await checkFunctionStatus(functionName);
        const executionStats = await checkExecutionStats(functionName);
        const failureStats = await checkFailureStats(functionName);
        const dcpBacklog = await checkDcpBacklogSize(functionName);

        let functionHealthy = true;
        let statusMessage = `Eventing Function: ${functionName} operating normally`;

        if (status.app.redeploy_required) {
          functionHealthy = false;
          statusMessage = `Eventing Function: ${functionName} requires redeployment`;
          warn(`Eventing Function: ${functionName} requires redeployment`, {
            function: functionName,
            status: status.app.composite_status,
            deploymentStatus: status.app.deployment_status,
            processingStatus: status.app.processing_status,
          });
          await sendSlackAlert(
            "Eventing Function: ${functionName} requires redeployment",
            {
              severity: AlertSeverity.WARNING,
              functionName: functionName,
              additionalContext: {
                status: status.app.composite_status,
                deploymentStatus: status.app.deployment_status,
                processingStatus: status.app.processing_status,
              },
            },
          );
        }

        if (dcpBacklog.dcp_backlog > config.DCP_BACKLOG_THRESHOLD) {
          functionHealthy = false;
          statusMessage = "DCP backlog size exceeds threshold";
          error(`Function ${functionName} DCP backlog size exceeds threshold`, {
            function: functionName,
            backlogSize: dcpBacklog.dcp_backlog,
            threshold: config.DCP_BACKLOG_THRESHOLD,
          });
          await sendSlackAlert("DCP backlog size exceeds threshold", {
            severity: AlertSeverity.ERROR,
            functionName: functionName,
            additionalContext: {
              backlogSize: dcpBacklog.dcp_backlog,
              threshold: config.DCP_BACKLOG_THRESHOLD,
            },
          });
        }

        if (
          executionStats.on_update_failure > 0 ||
          executionStats.on_delete_failure > 0
        ) {
          functionHealthy = false;
          statusMessage = "Function execution failures detected";
          warn(`Function ${functionName} execution failures detected`, {
            function: functionName,
            onUpdateFailures: executionStats.on_update_failure,
            onDeleteFailures: executionStats.on_delete_failure,
          });
          await sendSlackAlert("Function execution failures detected", {
            severity: AlertSeverity.WARNING,
            functionName: functionName,
            additionalContext: {
              onUpdateFailures: executionStats.on_update_failure,
              onDeleteFailures: executionStats.on_delete_failure,
            },
          });
        }

        if (failureStats.timeout_count > 0) {
          functionHealthy = false;
          statusMessage = `Eventing Function: ${functionName} has a timeouts detected`;
          warn(`Eventing Function: ${functionName} has  atimeouts detected`, {
            function: functionName,
            timeoutCount: failureStats.timeout_count,
          });
          await sendSlackAlert(
            `Eventing Function: ${functionName} has  atimeouts detected`,
            {
              severity: AlertSeverity.WARNING,
              functionName: functionName,
              additionalContext: {
                timeoutCount: failureStats.timeout_count,
              },
            },
          );
        }

        updateFunctionStatus(
          functionName,
          functionHealthy ? "success" : "error",
          statusMessage,
        );

        debug(`Eventing Function: ${functionName} check completed`, {
          function: functionName,
          status: status.app.composite_status,
          executionStats,
          failureStats,
          dcpBacklog,
        });
      } catch (funcError) {
        const errorMessage =
          funcError instanceof Error ? funcError.message : "Unknown error";
        error(`Error checking Eventing Function ${functionName}`, {
          function: functionName,
          error: errorMessage,
        });
        updateFunctionStatus(
          functionName,
          "error",
          `Error checking function: ${errorMessage}`,
        );
        await sendSlackAlert(
          `Error checking Couchbase function: ${functionName}`,
          {
            severity: AlertSeverity.ERROR,
            functionName: functionName,
            additionalContext: {
              error: errorMessage,
              stage: "Eventing Function Check",
            },
          },
        );
      }
    }
    log("Finished checking all the Eventing Functions");
    setApplicationStatus(true);
  } catch (err) {
    const errorMessage = err instanceof Error ? err.message : "Unknown error";
    error(`Error in checkEventingService`, { error: errorMessage });
    setApplicationStatus(false);
    await sendSlackAlert("Error checking Couchbase Eventing Functions", {
      severity: AlertSeverity.ERROR,
      additionalContext: {
        error: errorMessage,
        stage: "Initial Eventing Function list fetch or overall process",
      },
    });
  }
}

async function startScheduler(): Promise<boolean> {
  log(
    `Attempting to schedule job with cron expression: ${config.CRON_SCHEDULE}`,
  );
  try {
    cron.schedule(config.CRON_SCHEDULE, checkEventingService);
    log("Cron job scheduled successfully");
    return true;
  } catch (err) {
    const errorMessage = err instanceof Error ? err.message : "Unknown error";
    error(`Failed to schedule cron job`, {
      error: errorMessage,
      cronSchedule: config.CRON_SCHEDULE,
    });
    await sendSlackAlert(
      "Failed to schedule Couchbase Eventing monitoring job",
      {
        severity: AlertSeverity.ERROR,
        additionalContext: {
          error: errorMessage,
          cronSchedule: config.CRON_SCHEDULE,
        },
      },
    );
    return false;
  }
}

function simpleScheduler(): void {
  // const intervalMs = 5 * 60 * 1000; // 5 minutes in milliseconds
  const intervalMs = 10 * 60 * 1000; // 10 minutes in milliseconds

  async function runcheckEventingService() {
    try {
      await checkEventingService();
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : "Unknown error";
      error(`Error in simple scheduler`, { error: errorMessage });
      await sendSlackAlert("Error in Couchbase monitoring simple scheduler", {
        severity: AlertSeverity.ERROR,
        additionalContext: { error: errorMessage },
      });
    } finally {
      log(`Scheduling next check in ${intervalMs / 1000} seconds`);
      setTimeout(runcheckEventingService, intervalMs);
    }
  }
  log(`Starting simple scheduler with ${intervalMs / 1000} second interval`);
  runcheckEventingService();
}

// Start the application
log("Couchbase Eventing Watcher starting...");
(async () => {
  try {
    const healthServer = startHealthCheckServer(
      config.app.HEALTH_CHECK_PORT || 8080,
    );

    // Start the Couchbase monitoring
    startCouchbaseMonitoring();
    log("Couchbase monitoring started");

    if (await startScheduler()) {
      log("Using cron scheduler", { cronSchedule: config.CRON_SCHEDULE });
      await sendSlackAlert(
        "Couchbase Eventing Watcher started with cron scheduler",
        {
          severity: AlertSeverity.INFO,
          additionalContext: { cronSchedule: config.CRON_SCHEDULE },
        },
      );
    } else {
      log("Falling back to simple scheduler", { interval: "5 minutes" });
      simpleScheduler();
      await sendSlackAlert(
        "Couchbase Eventing Watcher started with simple scheduler",
        {
          severity: AlertSeverity.INFO,
          additionalContext: { interval: "5 minutes" },
        },
      );
    }

    await checkEventingService();
    setApplicationStatus(true);
  } catch (err) {
    const errorMessage = err instanceof Error ? err.message : "Unknown error";
    error(`Failed to start Couchbase Eventing Watcher`, {
      error: errorMessage,
    });
    await sendSlackAlert("Failed to start Couchbase Eventing Watcher", {
      severity: AlertSeverity.ERROR,
      additionalContext: { error: errorMessage },
    });
    setApplicationStatus(false);
  }
})();

// Update health status periodically
setInterval(checkEventingService, config.eventing.SERVICE_CHECK_INTERVAL); // Check every minute
