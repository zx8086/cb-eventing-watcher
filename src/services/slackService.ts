// src/services/slackService.ts

import { IncomingWebhook } from "@slack/webhook";
import config from "../config/config.ts";

const slackWebhook = new IncomingWebhook(config.SLACK_WEBHOOK_URL);

export async function sendSlackAlert(message: string): Promise<void> {
  await slackWebhook.send({
    text: message,
  });
}
