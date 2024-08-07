import cron from "node-cron";
import config from "./config/config.ts";
import * as couchbaseService from "./services/couchbaseServices.ts";
import { sendSlackAlert } from "./services/slackService.ts";
import { log, error } from "./utils/logger.ts";

async function checkStats(): Promise<void> {
  try {
    const functionList = await couchbaseService.getFunctionList();

    for (const functionName of functionList) {
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
    }
  } catch (err) {
    if (err instanceof Error) {
      error(`Error checking stats: ${err.message}`);
    } else {
      error(`Error checking stats: Unknown error`);
    }
  }
}

cron.schedule(config.CRON_SCHEDULE, checkStats);

log("Couchbase Eventing Watcher started");
