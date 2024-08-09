// src/services/slackService.ts

import {
  IncomingWebhook,
  type IncomingWebhookSendArguments,
} from "@slack/webhook";
import config from "../config/config.ts";
import { AlertSeverity, type AlertOptions } from "../types";
import { log, error } from "$utils/index";

const slackWebhook = new IncomingWebhook(config.SLACK_WEBHOOK_URL);

const colorMap = {
  [AlertSeverity.INFO]: "#36a64f", // Green
  [AlertSeverity.WARNING]: "#ffa500", // Orange
  [AlertSeverity.ERROR]: "#ff0000", // Red
};

export async function sendSlackAlert(
  message: string,
  options: AlertOptions = {},
): Promise<boolean> {
  const {
    severity = AlertSeverity.INFO,
    functionName,
    additionalContext,
  } = options;

  log(`Preparing to send Slack alert: ${message}`, { severity, functionName });

  const payload: IncomingWebhookSendArguments = {
    attachments: [
      {
        color: colorMap[severity],
        blocks: [
          {
            type: "section",
            text: {
              type: "mrkdwn",
              text: `*${severity.toUpperCase()}*: ${message}`,
            },
          },
        ],
      },
    ],
  };

  if (functionName) {
    payload.attachments[0].blocks.push({
      type: "section",
      fields: [
        {
          type: "mrkdwn",
          text: `*Function:*\n${functionName}`,
        },
      ],
    });
  }

  if (additionalContext && Object.keys(additionalContext).length > 0) {
    const contextBlock = {
      type: "section",
      fields: Object.entries(additionalContext).map(([key, value]) => ({
        type: "mrkdwn",
        text: `*${key}:*\n${JSON.stringify(value, null, 2)}`,
      })),
    };
    payload.attachments[0].blocks.push(contextBlock);
  }

  try {
    await slackWebhook.send(payload);
    log(`Successfully sent Slack alert: ${message}`);
    return true;
  } catch (err) {
    const errorMessage = err instanceof Error ? err.message : "Unknown error";
    error(`Failed to send Slack alert: ${message}`, { error: errorMessage });
    return false;
  }
}

export function formatSlackMessage(
  message: string,
  severity: AlertSeverity,
): string {
  return `*${severity.toUpperCase()}*: ${message}`;
}

export { AlertSeverity };
