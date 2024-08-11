/* src/config/config.ts */

export default {
  HEALTH_CHECK_PORT: 8080,
  COUCHBASE_HOST:
    process.env.COUCHBASE_HOST || "http://couchbase.example.com:8096",
  COUCHBASE_USERNAME: process.env.COUCHBASE_USERNAME || "",
  COUCHBASE_PASSWORD: process.env.COUCHBASE_PASSWORD || "",
  SLACK_WEBHOOK_URL: process.env.SLACK_WEBHOOK_URL || "",
  CRON_SCHEDULE: process.env.CRON_SCHEDULE || "0 * * * *",
  DCP_BACKLOG_THRESHOLD: Number(process.env.DCP_BACKLOG_THRESHOLD) || 1000,
  eventing: {
    COUCHBASE_URL: Bun.env.COUCHBASE_HOST,
    COUCHBASE_USERNAME: Bun.env.COUCHBASE_USERNAME,
    COUCHBASE_PASSWORD: Bun.env.COUCHBASE_PASSWORD,
    SERVICE_CHECK_INTERVAL: 5 * 60 * 1000, // 5 minutes
  },
  openTelemetry: {
    SERVICE_NAME: "Couchbase Eventing Service Watcher",
    SERVICE_VERSION: "1.0.0",
    DEPLOYMENT_ENVIRONMENT: "development",
    OTLP_TRACES_ENDPOINT: "http://192.168.0.9:4318/v1/traces",
    OTLP_METRICS_ENDPOINT: "http://192.168.0.9:4318/v1/metrics",
    OTLP_LOGS_ENDPOINT: "http://192.168.0.9:4318/v1/logs",
  },
  app: {
    HEALTH_CHECK_PORT: 8080,
    HEALTH_CHECK_LOG_INTERVAL: 3600000, // 1 hour in milliseconds
    HEALTH_CHECK_INTERVAL: 5 * 60 * 1000, // 5 minutes
    CRON_SCHEDULE: Bun.env.CRON_SCHEDULE || "0 * * * *",
    LOG_LEVEL: "debug",
    LOG_MAX_SIZE: "20m",
    LOG_MAX_FILES: "14d",
  },
  messaging: {
    SLACK_WEBHOOK_URL: Bun.env.SLACK_WEBHOOK_URL,
  },
};
