process.env.NODE_TLS_REJECT_UNAUTHORIZED = "0";

import { NodeSDK } from "@opentelemetry/sdk-node";
import { Resource } from "@opentelemetry/resources";
import {
  SEMRESATTRS_SERVICE_NAME,
  SEMRESATTRS_SERVICE_VERSION,
  SEMRESATTRS_DEPLOYMENT_ENVIRONMENT,
} from "@opentelemetry/semantic-conventions";
import { OTLPTraceExporter } from "@opentelemetry/exporter-trace-otlp-http";
import { OTLPMetricExporter } from "@opentelemetry/exporter-metrics-otlp-http";
import { OTLPLogExporter } from "@opentelemetry/exporter-logs-otlp-http";
import { BatchSpanProcessor } from "@opentelemetry/sdk-trace-base";
import { PeriodicExportingMetricReader } from "@opentelemetry/sdk-metrics";
import {
  diag,
  DiagConsoleLogger,
  DiagLogLevel,
  metrics,
} from "@opentelemetry/api";
import { WinstonInstrumentation } from "@opentelemetry/instrumentation-winston";
import { getNodeAutoInstrumentations } from "@opentelemetry/auto-instrumentations-node";
import {
  BatchLogRecordProcessor,
  LoggerProvider,
} from "@opentelemetry/sdk-logs";
import * as api from "@opentelemetry/api-logs";
import { config } from "$config";

// Set up diagnostics logging
diag.setLogger(new DiagConsoleLogger(), DiagLogLevel.INFO);

// Create a shared resource
const resource = new Resource({
  [SEMRESATTRS_SERVICE_NAME]: config.openTelemetry.SERVICE_NAME,
  [SEMRESATTRS_SERVICE_VERSION]: config.openTelemetry.SERVICE_VERSION,
  [SEMRESATTRS_DEPLOYMENT_ENVIRONMENT]:
    config.openTelemetry.DEPLOYMENT_ENVIRONMENT,
});

// Create OTLP exporters
const traceExporter = new OTLPTraceExporter({
  url: config.openTelemetry.TRACES_ENDPOINT,
  headers: { "Content-Type": "application/json" },
});
const metricExporter = new OTLPMetricExporter({
  url: config.openTelemetry.METRICS_ENDPOINT,
  headers: { "Content-Type": "application/json" },
});
const logExporter = new OTLPLogExporter({
  url: config.openTelemetry.LOGS_ENDPOINT,
  headers: { "Content-Type": "application/json" },
});

// Set up LoggerProvider
const loggerProvider = new LoggerProvider({ resource });
loggerProvider.addLogRecordProcessor(new BatchLogRecordProcessor(logExporter));
api.logs.setGlobalLoggerProvider(loggerProvider);

// Set up MetricReader
const metricReader = new PeriodicExportingMetricReader({
  exporter: metricExporter,
  exportIntervalMillis: 60000, // Export metrics every 60 seconds
});

// Node SDK for OpenTelemetry
const sdk = new NodeSDK({
  resource: resource,
  traceExporter,
  spanProcessors: [new BatchSpanProcessor(traceExporter)],
  metricReader,
  logRecordProcessor: new BatchLogRecordProcessor(logExporter),
  instrumentations: [
    getNodeAutoInstrumentations({
      "@opentelemetry/instrumentation-aws-lambda": { enabled: false },
      "@opentelemetry/instrumentation-fs": { enabled: false },
      "@opentelemetry/instrumentation-http": { enabled: true },
      "@opentelemetry/instrumentation-winston": { enabled: true },
    }),
    new WinstonInstrumentation({ enabled: true }),
  ],
});

export const meter = metrics.getMeter("couchbase-eventing");

// Start the SDK
try {
  sdk.start();
  console.log("OpenTelemetry SDK started with auto-instrumentation");
} catch (error) {
  console.error("Error starting OpenTelemetry SDK:", error);
}

// Graceful shutdown
process.on("SIGTERM", () => {
  sdk
    .shutdown()
    .then(() => console.log("SDK shut down successfully"))
    .catch((error) => console.log("Error shutting down SDK", error))
    .finally(() => process.exit(0));
});

export const otelSDK = sdk;
