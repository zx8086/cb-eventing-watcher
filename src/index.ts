/* src/index.ts */

import cron from "node-cron";
import { config } from "$config";
import { log, error, warn, debug, getUptime, initializeUptime } from "$utils";
import { startHealthCheckServer, setApplicationStatus } from "$lib/index.ts";
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
import type { Server } from "bun";

// Create variables to store the cron job and health check server
let cronJob: cron.ScheduledTask | null = null;
let healthServer: Server | null = null;
let isShuttingDown = false;

// Add a startup timestamp and initialize uptime
const startupTimestamp = Date.now();
initializeUptime();

async function checkEventingService(): Promise<void> {
  log("Running checkEventingService...");
  try {
    const functionList = await getFunctionList();
    log(`Found ${functionList.length} Eventing functions`, {
      functionCount: functionList.length,
    });

    const functionStatuses = [];

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
            `Eventing Function: ${functionName} requires redeployment`,
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

        if (dcpBacklog.dcp_backlog > config.eventing.DCP_BACKLOG_THRESHOLD) {
          functionHealthy = false;
          statusMessage = "DCP backlog size exceeds threshold";
          error(`Function ${functionName} DCP backlog size exceeds threshold`, {
            function: functionName,
            backlogSize: dcpBacklog.dcp_backlog,
            threshold: config.eventing.DCP_BACKLOG_THRESHOLD,
          });
          await sendSlackAlert("DCP backlog size exceeds threshold", {
            severity: AlertSeverity.ERROR,
            functionName: functionName,
            additionalContext: {
              backlogSize: dcpBacklog.dcp_backlog,
              threshold: config.eventing.DCP_BACKLOG_THRESHOLD,
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
          statusMessage = `Eventing Function: ${functionName} has timeouts detected`;
          warn(`Eventing Function: ${functionName} has timeouts detected`, {
            function: functionName,
            timeoutCount: failureStats.timeout_count,
          });

          await sendSlackAlert(
            `Eventing Function: ${functionName} has timeouts detected`,
            {
              severity: AlertSeverity.WARNING,
              functionName: functionName,
              additionalContext: {
                timeoutCount: failureStats.timeout_count,
              },
            },
          );
        }

        // Instead of updating function status, add it to an object
        functionStatuses.push({
          name: functionName,
          status: functionHealthy ? "success" : "error",
          message: statusMessage,
          executionStats,
          failureStats,
          dcpBacklog,
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
        });

        // Add error status to our collection
        functionStatuses.push({
          name: functionName,
          status: "error",
          message: `Error checking function: ${errorMessage}`,
        });

        await sendSlackAlert(
          `Error checking Couchbase function: ${functionName}`,
          {
            severity: AlertSeverity.ERROR,
            functionName: functionName,
            additionalContext: {
              error: errorMessage,
              check: "Eventing Check",
            },
          },
        );
      }
    }

    log("Finished checking all the Eventing Functions");

    // You might want to do something with functionStatuses here,
    // such as storing it for the health check to use later

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

function startScheduler(): void {
  log(
    `Scheduling job with cron expression: ${config.application.CRON_SCHEDULE}`,
  );
  cronJob = cron.schedule(
    config.application.CRON_SCHEDULE,
    checkEventingService,
    {
      scheduled: true,
      // timezone: "CET",
    },
  );
  log("Cron job scheduled successfully");
}

async function gracefulShutdown(signal: string) {
  if (isShuttingDown) {
    log("Shutdown already in progress");
    return;
  }

  isShuttingDown = true;
  log(`Received ${signal}. Starting graceful shutdown...`);

  try {
    // Stop the cron job if it's running
    if (cronJob) {
      cronJob.stop();
      log("Cron job stopped");
    }

    // Stop the health check server
    if (healthServer) {
      healthServer.stop(true); // true for immediate stop
      log("Health check server stopped");
    } else {
      log("No health check server to stop.");
    }

    // Perform any other cleanup tasks here

    log("Graceful shutdown completed");
  } catch (err) {
    const errorMessage = err instanceof Error ? err.message : String(err);
    error(`Error during graceful shutdown: ${errorMessage}`);
  } finally {
    const uptime = getUptime();
    log(`Application ran for ${uptime} before shutdown`);
    log("Exiting process");
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
  });
  // Optionally, you could trigger the shutdown process here
  // gracefulShutdown('UNHANDLED_REJECTION');
});

// Handle uncaught exceptions
process.on("uncaughtException", (err) => {
  error("Uncaught Exception:", { error: err.stack });
  // It's generally considered best practice to crash on uncaught exceptions
  process.exit(1);
});

async function startApplication() {
  log(`Couchbase Eventing Watcher starting... (PID: ${process.pid})`);
  try {
    healthServer = startHealthCheckServer(
      config.application.HEALTH_CHECK_PORT || 8080,
    );

    // Start the Couchbase monitoring
    startCouchbaseMonitoring();
    log("Couchbase monitoring started");

    // Start the scheduler
    startScheduler();

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
        // "Start Time": new Date(startupTimestamp).toISOString(),
      },
    });

    // Run the first check immediately
    await checkEventingService();
    setApplicationStatus(true);

    log("Application startup completed. Running in the foreground...");

    // Main application loop
    while (!isShuttingDown) {
      try {
        // You can add any recurring tasks here if needed
        // For example, you might want to run a health check or log status
        log("Application is still running...");

        // Sleep for a while before the next iteration
        await new Promise((resolve) => setTimeout(resolve, 60000)); // Sleep for 1 minute
      } catch (loopError) {
        error(
          `Error in main application loop: ${
            loopError instanceof Error ? loopError.message : String(loopError)
          }`,
        );
      }
    }
  } catch (err) {
    const errorMessage = err instanceof Error ? err.message : "Unknown error";
    error(`Failed to start or run Couchbase Eventing Watcher`, {
      error: errorMessage,
    });
    await sendSlackAlert("Failed to start or run Couchbase Eventing Watcher", {
      severity: AlertSeverity.ERROR,
      additionalContext: { error: errorMessage, pid: process.pid },
    });
    setApplicationStatus(false);
    throw err;
  }
}

// Run the application
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
  );
});
