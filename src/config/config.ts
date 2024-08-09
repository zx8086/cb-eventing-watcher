// src/config/config.ts

export default {
  HEALTH_CHECK_PORT: 8080,
  COUCHBASE_HOST:
    process.env.COUCHBASE_HOST || "http://couchbase.example.com:8096",
  COUCHBASE_USERNAME: process.env.COUCHBASE_USERNAME || "",
  COUCHBASE_PASSWORD: process.env.COUCHBASE_PASSWORD || "",
  SLACK_WEBHOOK_URL: process.env.SLACK_WEBHOOK_URL || "",
  CRON_SCHEDULE: process.env.CRON_SCHEDULE || "0 * * * *",
  DCP_BACKLOG_THRESHOLD: Number(process.env.DCP_BACKLOG_THRESHOLD) || 1000,
  openTelemetry: {
    SERVICE_NAME: "Couchbase Eventing Service Watcher",
    SERVICE_VERSION: "1.0.0",
    DEPLOYMENT_ENVIRONMENT: "development",
    OTLP_TRACES_ENDPOINT: "http://192.168.0.9:4318/v1/traces",
    OTLP_METRICS_ENDPOINT: "http://192.168.0.9:4318/v1/metrics",
    OTLP_LOGS_ENDPOINT: "http://192.168.0.9:4318/v1/logs",
  },
};

//     OTLP_LOGS_ENDPOINT: "https://otel-http-logs.siobytes.com",
