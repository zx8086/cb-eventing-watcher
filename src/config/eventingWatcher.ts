/* src/config/eventingWatcher.ts */

import type { Config } from "$types";

function getOrThrow(envVariable: any, name: string): string {
  if (!envVariable) {
    throw new Error(`Required environment variable ${name} is not set`);
  }
  return envVariable;
}

export const config: Config = {
  eventing: {
    COUCHBASE_URL: getOrThrow(Bun.env.COUCHBASE_HOST, "COUCHBASE_HOST"),
    COUCHBASE_USERNAME: getOrThrow(
      Bun.env.COUCHBASE_USERNAME,
      "COUCHBASE_USERNAME",
    ),
    COUCHBASE_PASSWORD: getOrThrow(
      Bun.env.COUCHBASE_PASSWORD,
      "COUCHBASE_PASSWORD",
    ),
    SERVICE_CHECK_INTERVAL: 5 * 60 * 1000, // 5 minutes
    DCP_BACKLOG_THRESHOLD: Number(process.env.DCP_BACKLOG_THRESHOLD) || 1000,
  },
  openTelemetry: {
    SERVICE_NAME: "Couchbase Eventing Service Watcher",
    SERVICE_VERSION: "1.0.0",
    DEPLOYMENT_ENVIRONMENT: "development",
    TRACES_ENDPOINT: "http://192.168.0.9:4318/v1/traces",
    METRICS_ENDPOINT: "http://192.168.0.9:4318/v1/metrics",
    LOGS_ENDPOINT: "http://192.168.0.9:4318/v1/logs",
    METRIC_READER_INTERVAL: 1800000, // Export to OTLP every 30 minutes
    CONSOLE_METRIC_READER_INTERVAL: 600000, // Export to OTLP every 10 minutes
  },
  app: {
    HEALTH_CHECK_PORT: 8080,
    HEALTH_CHECK_LOG_INTERVAL: 3600000, // 1 hour in milliseconds
    HEALTH_CHECK_INTERVAL: 5 * 60 * 1000, // 5 minutes
    CRON_SCHEDULE:
      getOrThrow(Bun.env.CRON_SCHEDULE, "CRON_SCHEDULE") || "30 * * * *",
    LOG_LEVEL: "debug",
    LOG_MAX_SIZE: "20m",
    LOG_MAX_FILES: "14d",
  },
  messaging: {
    SLACK_WEBHOOK_URL: getOrThrow(
      Bun.env.SLACK_WEBHOOK_URL,
      "SLACK_WEBHOOK_URL",
    ),
  },
};
