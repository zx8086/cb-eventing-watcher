// src/services/teamsService.ts

import axios from "axios";
import { config } from "$config";
import { AlertSeverity, type AlertOptions } from "../types";
import { log, error } from "$utils/index";

const teamsWebhookUrl = config.messaging.TEAMS_WEBHOOK_URL;

const colorMap: Record<AlertSeverity, string> = {
  [AlertSeverity.INFO]: "2DC72D", // Green
  [AlertSeverity.WARNING]: "FFA500", // Orange
  [AlertSeverity.ERROR]: "FF0000", // Red
};

export async function sendTeamsAlert(
  message: string,
  options: AlertOptions = {},
): Promise<boolean> {
  const {
    severity = AlertSeverity.INFO,
    functionName,
    additionalContext,
  } = options;

  log(`Preparing to send Teams alert: ${message}`, { severity, functionName });

  const payload = {
    "@type": "MessageCard",
    "@context": "http://schema.org/extensions",
    themeColor: colorMap[severity],
    summary: message,
    sections: [
      {
        activityTitle: `**${severity.toUpperCase()}**: ${message}`,
        facts: [],
        markdown: true,
      },
    ],
  };

  if (functionName) {
    payload.sections[0].facts.push({
      name: "Function",
      value: functionName,
    });
  }

  if (additionalContext && Object.keys(additionalContext).length > 0) {
    Object.entries(additionalContext).forEach(([key, value]) => {
      payload.sections[0].facts.push({
        name: key,
        value: JSON.stringify(value, null, 2),
      });
    });
  }

  try {
    await axios.post(teamsWebhookUrl, payload);
    log(`Successfully sent Teams alert: ${message}`);
    return true;
  } catch (err) {
    const errorMessage = err instanceof Error ? err.message : "Unknown error";
    error(`Failed to send Teams alert: ${message}`, { error: errorMessage });
    return false;
  }
}

export function formatTeamsMessage(
  message: string,
  severity: AlertSeverity,
): string {
  return `**${severity.toUpperCase()}**: ${message}`;
}

export { AlertSeverity };
