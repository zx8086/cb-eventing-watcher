/* src/config/eventingWatcher.ts */

import type { Config } from "$types";

function getEnvOrThrow(key: string): any {
  const value = Bun.env[key];
  if (value === undefined) {
    throw new Error(`Required environment variable ${key} is not set`);
  }
  return value;
}

function getEnvNumberOrThrow(key: string): number {
  const value = getEnvOrThrow(key);
  const numberValue = Number(value);
  if (isNaN(numberValue)) {
    throw new Error(`Environment variable ${key} must be a valid number`);
  }
  return numberValue;
}

export const config: Config = {
  application: {
    HEALTH_CHECK_PORT: getEnvNumberOrThrow("HEALTH_CHECK_PORT"),
    HEALTH_CHECK_LOG_INTERVAL: getEnvNumberOrThrow("HEALTH_CHECK_LOG_INTERVAL"),
    HEALTH_CHECK_INTERVAL: getEnvNumberOrThrow("HEALTH_CHECK_INTERVAL"),
    IDLE_TIMEOUT: getEnvNumberOrThrow("IDLE_TIMEOUT"),
    CRON_SCHEDULE: getEnvOrThrow("CRON_SCHEDULE"),
    LOG_LEVEL: getEnvOrThrow("LOG_LEVEL"),
    LOG_MAX_SIZE: getEnvOrThrow("LOG_MAX_SIZE"),
    LOG_MAX_FILES: getEnvOrThrow("LOG_MAX_FILES"),
  },
  eventing: {
    COUCHBASE_HOST: getEnvOrThrow("COUCHBASE_HOST"),
    COUCHBASE_USERNAME: getEnvOrThrow("COUCHBASE_USERNAME"),
    COUCHBASE_PASSWORD: getEnvOrThrow("COUCHBASE_PASSWORD"),
    SERVICE_CHECK_INTERVAL: getEnvNumberOrThrow("SERVICE_CHECK_INTERVAL"),
    DCP_BACKLOG_THRESHOLD: getEnvNumberOrThrow("DCP_BACKLOG_THRESHOLD"),
    CRON_SCHEDULE: getEnvOrThrow("CRON_SCHEDULE"),
  },
  openTelemetry: {
    SERVICE_NAME: getEnvOrThrow("SERVICE_NAME"),
    SERVICE_VERSION: getEnvOrThrow("SERVICE_VERSION"),
    DEPLOYMENT_ENVIRONMENT: getEnvOrThrow("DEPLOYMENT_ENVIRONMENT"),
    TRACES_ENDPOINT: getEnvOrThrow("TRACES_ENDPOINT"),
    METRICS_ENDPOINT: getEnvOrThrow("METRICS_ENDPOINT"),
    LOGS_ENDPOINT: getEnvOrThrow("LOGS_ENDPOINT"),
    METRIC_READER_INTERVAL: getEnvNumberOrThrow("METRIC_READER_INTERVAL"),
    CONSOLE_METRIC_READER_INTERVAL: getEnvNumberOrThrow(
      "CONSOLE_METRIC_READER_INTERVAL",
    ),
  },
  messaging: {
    ALERT_TYPE: getEnvOrThrow("ALERT_TYPE"),
    SLACK_WEBHOOK_URL: getEnvOrThrow("SLACK_WEBHOOK_URL"),
    TEAMS_WEBHOOK_URL: getEnvOrThrow("TEAMS_WEBHOOK_URL"),
  },
};
