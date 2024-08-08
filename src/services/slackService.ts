// src/services/slackService.ts

import {
  IncomingWebhook,
  type IncomingWebhookSendArguments,
} from "@slack/webhook";
import config from "../config/config.ts";

import { AlertSeverity, type AlertOptions } from "../types";

const slackWebhook = new IncomingWebhook(config.SLACK_WEBHOOK_URL);

export async function sendSlackAlert(
  message: string,
  options: AlertOptions = {},
): Promise<void> {
  const {
    severity = AlertSeverity.INFO,
    functionName,
    additionalContext,
  } = options;

  const colorMap = {
    [AlertSeverity.INFO]: "#36a64f", // Green
    [AlertSeverity.WARNING]: "#ffa500", // Orange
    [AlertSeverity.ERROR]: "#ff0000", // Red
  };

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
  } catch (error) {
    console.error("Failed to send Slack alert:", error);
  }
}

export { AlertSeverity };
