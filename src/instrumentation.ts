/* src/instrumentation.ts */

import {
  diag,
  DiagConsoleLogger,
  DiagLogLevel,
  metrics,
} from "@opentelemetry/api";
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
import {
  MeterProvider,
  PeriodicExportingMetricReader,
  ConsoleMetricExporter,
} from "@opentelemetry/sdk-metrics";
import {
  LoggerProvider,
  BatchLogRecordProcessor,
} from "@opentelemetry/sdk-logs";
import { getNodeAutoInstrumentations } from "@opentelemetry/auto-instrumentations-node";
import { WinstonInstrumentation } from "@opentelemetry/instrumentation-winston";

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

const otlpMetricExporter = new OTLPMetricExporter({
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

// Set up MetricReaders
const consoleMetricReader = new PeriodicExportingMetricReader({
  exporter: new ConsoleMetricExporter(),
  exportIntervalMillis: config.openTelemetry.CONSOLE_METRIC_READER_INTERVAL,
});

const otlpMetricReader = new PeriodicExportingMetricReader({
  exporter: otlpMetricExporter,
  exportIntervalMillis: config.openTelemetry.METRIC_READER_INTERVAL,
});

// Set up MeterProvider
const meterProvider = new MeterProvider({
  resource: resource,
  readers: [consoleMetricReader, otlpMetricReader],
  // readers: [otlpMetricReader],
});

// Set this MeterProvider to be global to the app being instrumented. -> For multiple Metrics Readers
metrics.setGlobalMeterProvider(meterProvider);

// Node SDK for OpenTelemetry without metricReader -> Metric Reader defined outside of this SDK so we can use multiple Metrics Readers
const sdk = new NodeSDK({
  resource: resource,
  traceExporter,
  spanProcessors: [new BatchSpanProcessor(traceExporter)],
  logRecordProcessor: new BatchLogRecordProcessor(logExporter),
  instrumentations: [
    getNodeAutoInstrumentations({
      "@opentelemetry/instrumentation-aws-lambda": { enabled: false },
      "@opentelemetry/instrumentation-fs": { enabled: false },
      "@opentelemetry/instrumentation-winston": { enabled: false },
    }),
    new WinstonInstrumentation({
      enabled: true,
      disableLogSending: false,
    }),
  ],
});

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
export const meter = metrics.getMeter(
  config.openTelemetry.SERVICE_NAME,
  config.openTelemetry.SERVICE_VERSION,
);
