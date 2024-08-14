/* src/services/alertRoutingService.ts */

import { config } from "$config";
import { sendSlackAlert } from "$services";
import { sendTeamsAlert } from "$services";
import { AlertSeverity, type AlertOptions } from "../types";
import { log } from "$utils";

export async function sendAlert(
  message: string,
  options: AlertOptions = {},
): Promise<boolean> {
  const alertLevel = parseInt(config.application.ALERT_LEVEL, 10);

  log(`Sending alert with level ${alertLevel}: ${message}`, {
    alertLevel,
    severity: options.severity,
    functionName: options.functionName,
  });

  switch (alertLevel) {
    case 0:
      log("Alerts disabled. Not sending any alert.");
      return true;
    case 1:
      return sendSlackAlert(message, options);
    case 2:
      return sendTeamsAlert(message, options);
    default:
      log(`Invalid alert level: ${alertLevel}. Not sending any alert.`);
      return false;
  }
}

export { AlertSeverity };
