/* src/types/application.ts */

export interface EventingConfig {
  COUCHBASE_URL: string;
  COUCHBASE_USERNAME: string;
  COUCHBASE_PASSWORD: string;
  SERVICE_CHECK_INTERVAL: number;
  DCP_BACKLOG_THRESHOLD: number;
}

export interface OpenTelemetryConfig {
  SERVICE_NAME: string;
  SERVICE_VERSION: string;
  DEPLOYMENT_ENVIRONMENT: string;
  TRACES_ENDPOINT: string;
  METRICS_ENDPOINT: string;
  LOGS_ENDPOINT: string;
}

export interface AppConfig {
  HEALTH_CHECK_PORT: number;
  HEALTH_CHECK_LOG_INTERVAL: number;
  HEALTH_CHECK_INTERVAL: number;
  CRON_SCHEDULE: string;
  LOG_LEVEL: string;
  LOG_MAX_SIZE: string;
  LOG_MAX_FILES: string;
}

export interface MessagingConfig {
  SLACK_WEBHOOK_URL: string;
}

export interface Config {
  eventing: EventingConfig;
  openTelemetry: OpenTelemetryConfig;
  app: AppConfig;
  messaging: MessagingConfig;
}
