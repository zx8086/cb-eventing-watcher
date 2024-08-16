/* src/index.ts */

import cron from "node-cron";
import { config } from "$config";
import { log, error, warn, debug, getUptime, initializeUptime } from "$utils";
import { startHealthCheckServer, setApplicationStatus } from "$lib";
import {
  getFunctionList,
  checkFunctionStatus,
  checkExecutionStats,
  checkFailureStats,
  checkDcpBacklogSize,
  sendSlackAlert,
  AlertSeverity,
} from "$services";
import { getEventingMetrics } from "./monitoring/couchbaseMonitor";
import type { Server } from "bun";
import {
  updateFunctionStatus,
  removeOutdatedFunctions,
  getLatestFunctionStatus,
} from "$lib/database";

let cronJob: cron.ScheduledTask | null = null;
let healthServer: Server | null = null;
let isShuttingDown = false;

const startupTimestamp = Date.now();
initializeUptime();

async function checkEventingService(): Promise<void> {
  log("Running checkEventingService...", {
    timestamp: new Date().toISOString(),
  });
  try {
    const functionList = await getFunctionList();
    log(`Found ${functionList.length} Eventing functions`, {
      functionCount: functionList.length,
      timestamp: new Date().toISOString(),
    });

    const functionStatuses = [];

    for (const functionName of functionList) {
      try {
        log(`Checking Eventing Function: ${functionName}`, {
          function: functionName,
          timestamp: new Date().toISOString(),
        });
        const status = await checkFunctionStatus(functionName);
        const executionStats = await checkExecutionStats(functionName);
        const failureStats = await checkFailureStats(functionName);
        const dcpBacklog = await checkDcpBacklogSize(functionName);

        let functionStatus = status.app.composite_status;
        let statusMessage = `Eventing Function: ${functionName} ${functionStatus}`;

        // Detailed logging of Eventing function state
        log(`Detailed state for ${functionName}:`, {
          functionName,
          status: functionStatus,
          compositeStatus: status.app.composite_status,
          deploymentStatus: status.app.deployment_status,
          processingStatus: status.app.processing_status,
          redeployRequired: status.app.redeploy_required,
          executionStats: JSON.stringify(executionStats),
          failureStats: JSON.stringify(failureStats),
          dcpBacklog: dcpBacklog.dcp_backlog,
          timestamp: new Date().toISOString(),
        });

        // Check for redeployment requirement
        if (status.app.redeploy_required) {
          statusMessage = `Eventing Function: ${functionName} requires redeployment`;
          warn(statusMessage, {
            function: functionName,
            status: status.app.composite_status,
            deploymentStatus: status.app.deployment_status,
            processingStatus: status.app.processing_status,
          });
        }

        // Check DCP backlog
        if (dcpBacklog.dcp_backlog > config.eventing.DCP_BACKLOG_THRESHOLD) {
          statusMessage = "DCP backlog size exceeds threshold";
          error(`Function ${functionName} DCP backlog size exceeds threshold`, {
            function: functionName,
            backlogSize: dcpBacklog.dcp_backlog,
            threshold: config.eventing.DCP_BACKLOG_THRESHOLD,
          });
        }

        // Check for execution failures
        if (
          executionStats.on_update_failure > 0 ||
          executionStats.on_delete_failure > 0
        ) {
          statusMessage = "Function execution failures detected";
          warn(`Function ${functionName} execution failures detected`, {
            function: functionName,
            onUpdateFailures: executionStats.on_update_failure,
            onDeleteFailures: executionStats.on_delete_failure,
          });
        }

        // Check for timeouts
        if (failureStats.timeout_count > 0) {
          statusMessage = `Eventing Function: ${functionName} has timeouts detected`;
          warn(statusMessage, {
            function: functionName,
            timeoutCount: failureStats.timeout_count,
          });
        }

        log(`Function ${functionName} current status:`, {
          functionName,
          status: functionStatus,
          message: statusMessage,
          timestamp: new Date().toISOString(),
        });

        // Get the most recent deployment status from the database
        const latestStatus = await getLatestFunctionStatus(functionName);
        const previousStatus = latestStatus ? latestStatus.status : null;

        log(`Status comparison for ${functionName}:`, {
          functionName,
          currentStatus: functionStatus,
          previousStatus,
          latestDbStatus: latestStatus
            ? latestStatus.status
            : "No previous status",
          timestamp: new Date().toISOString(),
        });

        // Update Eventing function status in the database
        await updateFunctionStatus(
          functionName,
          functionStatus as "deployed" | "undeployed" | "paused" | "error",
          statusMessage,
          previousStatus,
        );

        // Add current status to functionStatuses array
        functionStatuses.push({
          name: functionName,
          status: functionStatus,
          message: statusMessage,
          executionStats,
          failureStats,
          dcpBacklog,
          compositeStatus: status.app.composite_status,
          deploymentStatus: status.app.deployment_status,
          processingStatus: status.app.processing_status,
        });

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
          timestamp: new Date().toISOString(),
        });

        // Get the most recent status from the database for error case
        const latestStatus = await getLatestFunctionStatus(functionName);
        const previousStatus = latestStatus ? latestStatus.status : null;

        // Update function status in the database for errors
        await updateFunctionStatus(
          functionName,
          "error",
          `Error checking function: ${errorMessage}`,
          previousStatus,
        );

        // Add error status to functionStatuses array
        functionStatuses.push({
          name: functionName,
          status: "error",
          message: `Error checking function: ${errorMessage}`,
          compositeStatus: "unknown",
          deploymentStatus: "unknown",
          processingStatus: "unknown",
        });
      }
    }

    // Remove outdated functions from the database
    await removeOutdatedFunctions(functionList);

    log("Finished checking all the Eventing Functions", {
      timestamp: new Date().toISOString(),
    });

    setApplicationStatus(true);
  } catch (err) {
    const errorMessage = err instanceof Error ? err.message : "Unknown error";
    error(`Error in checkEventingService`, {
      error: errorMessage,
      timestamp: new Date().toISOString(),
    });
    setApplicationStatus(false);
    await sendSlackAlert("Error checking Couchbase Eventing Functions", {
      severity: AlertSeverity.ERROR,
      additionalContext: {
        error: errorMessage,
        stage: "Initial Eventing Function list fetch or overall process",
        timestamp: new Date().toISOString(),
      },
    });
  }
}

function startScheduler(): void {
  log(
    `Scheduling job with cron expression: ${config.application.CRON_SCHEDULE}`,
    { timestamp: new Date().toISOString() },
  );
  cronJob = cron.schedule(
    config.application.CRON_SCHEDULE,
    async () => {
      log("RUNNING SCHEDULED CHECK...", {
        timestamp: new Date().toISOString(),
      });
      await checkEventingService();
      await getEventingMetrics();
    },
    {
      scheduled: true,
    },
  );
  log("Cron job scheduled successfully", {
    timestamp: new Date().toISOString(),
  });
}

async function gracefulShutdown(signal: string) {
  if (isShuttingDown) {
    log("Shutdown already in progress", {
      timestamp: new Date().toISOString(),
    });
    return;
  }

  isShuttingDown = true;
  log(`Received ${signal}. Starting graceful shutdown...`, {
    timestamp: new Date().toISOString(),
  });

  try {
    if (cronJob) {
      cronJob.stop();
      log("Cron job stopped", { timestamp: new Date().toISOString() });
    }

    if (healthServer) {
      healthServer.stop(true); // true for immediate stop
      log("Health check server stopped", {
        timestamp: new Date().toISOString(),
      });
    } else {
      log("No health check server to stop.", {
        timestamp: new Date().toISOString(),
      });
    }

    log("Graceful shutdown completed", { timestamp: new Date().toISOString() });
  } catch (err) {
    const errorMessage = err instanceof Error ? err.message : String(err);
    error(`Error during graceful shutdown: ${errorMessage}`, {
      timestamp: new Date().toISOString(),
    });
  } finally {
    const uptime = getUptime();
    log(`Application ran for ${uptime} before shutdown`, {
      timestamp: new Date().toISOString(),
    });
    log("Exiting process", { timestamp: new Date().toISOString() });
    process.exit(0);
  }
}

// Register the graceful shutdown handler for different signals
["SIGINT", "SIGTERM", "SIGQUIT"].forEach((signal) => {
  process.on(signal, () => gracefulShutdown(signal));
});

// Handle unhandled rejections
process.on("unhandledRejection", (reason, promise) => {
  error("Unhandled Rejection:", {
    reason: reason instanceof Error ? reason.stack : String(reason),
    promise: String(promise),
    timestamp: new Date().toISOString(),
  });
});

// Handle uncaught exceptions
process.on("uncaughtException", (err) => {
  error("Uncaught Exception:", {
    error: err.stack,
    timestamp: new Date().toISOString(),
  });
  process.exit(1);
});

async function startApplication() {
  log(`Couchbase Eventing Watcher starting... (PID: ${process.pid})`, {
    timestamp: new Date().toISOString(),
  });
  try {
    healthServer = startHealthCheckServer(
      config.application.HEALTH_CHECK_PORT || 8080,
    );

    startScheduler();
    log("Scheduler started", { timestamp: new Date().toISOString() });

    // Slightly different way to see if i can align the time with local time vs ecs log format
    const startupTimestamp = Date.now();
    const date = new Date(startupTimestamp);
    // Offset by 2 hours (2 hours * 60 minutes * 60 seconds * 1000 milliseconds)
    date.setTime(date.getTime() + 2 * 60 * 60 * 1000);
    const isoString = date.toISOString();

    console.log(isoString);

    await sendSlackAlert("Couchbase Eventing Watcher started", {
      severity: AlertSeverity.INFO,
      additionalContext: {
        "Cron Schedule": config.application.CRON_SCHEDULE,
        pid: process.pid,
        "Start Time": isoString,
      },
    });

    // Run the first check immediately after starting
    await checkEventingService();
    await getEventingMetrics();
    setApplicationStatus(true);

    log("Application startup completed. Running in the foreground...", {
      timestamp: new Date().toISOString(),
    });

    // Main application loop
    while (!isShuttingDown) {
      try {
        log("Application is still running...", {
          timestamp: new Date().toISOString(),
        });

        await new Promise((resolve) => setTimeout(resolve, 60000)); // Sleep for 1 minute
      } catch (loopError) {
        error(
          `Error in main application loop: ${
            loopError instanceof Error ? loopError.message : String(loopError)
          }`,
          { timestamp: new Date().toISOString() },
        );
      }
    }
  } catch (err) {
    const errorMessage = err instanceof Error ? err.message : "Unknown error";
    error(`Failed to start or run Couchbase Eventing Watcher`, {
      error: errorMessage,
      timestamp: new Date().toISOString(),
    });
    await sendSlackAlert("Failed to start or run Couchbase Eventing Watcher", {
      severity: AlertSeverity.ERROR,
      additionalContext: { error: errorMessage, pid: process.pid },
    });
    setApplicationStatus(false);
    throw err;
  }
}

// Start the Watcher Service
startApplication().catch((err) => {
  console.error("Unhandled error in startApplication:", err);
  process.exit(1);
});

process.on("exit", (code) => {
  const runDuration = Date.now() - startupTimestamp;
  console.log(
    `Process ${process.pid} is about to exit with code: ${code}. Ran for ${
      runDuration / 1000
    } seconds.`,
    { timestamp: new Date().toISOString() },
  );
});
