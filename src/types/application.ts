/* src/types/application.ts */

export interface ApplicationConfig {
  HEALTH_CHECK_PORT: number;
  HEALTH_CHECK_LOG_INTERVAL: number;
  HEALTH_CHECK_INTERVAL: number;
  CRON_SCHEDULE: string;
  LOG_LEVEL: string;
  LOG_MAX_SIZE: string;
  LOG_MAX_FILES: string;
  ALERT_LEVEL: string;
}

export interface EventingConfig {
  COUCHBASE_HOST: string;
  COUCHBASE_USERNAME: string;
  COUCHBASE_PASSWORD: string;
  SERVICE_CHECK_INTERVAL: number;
  DCP_BACKLOG_THRESHOLD: number;
  CRON_SCHEDULE: string;
}

export interface OpenTelemetryConfig {
  SERVICE_NAME: string;
  SERVICE_VERSION: string;
  DEPLOYMENT_ENVIRONMENT: string;
  TRACES_ENDPOINT: string;
  METRICS_ENDPOINT: string;
  LOGS_ENDPOINT: string;
  METRIC_READER_INTERVAL: number;
  CONSOLE_METRIC_READER_INTERVAL?: number;
}

export interface MessagingConfig {
  SLACK_WEBHOOK_URL?: string;
  TEAMS_WEBHOOK_URL?: string;
}

export interface Config {
  application: ApplicationConfig;
  eventing: EventingConfig;
  openTelemetry: OpenTelemetryConfig;
  messaging: MessagingConfig;
}
