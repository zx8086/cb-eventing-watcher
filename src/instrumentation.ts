// src/instrumentation.ts

import { NodeSDK } from "@opentelemetry/sdk-node";
import { getNodeAutoInstrumentations } from "@opentelemetry/auto-instrumentations-node";
import { Resource } from "@opentelemetry/resources";
import {
  SEMRESATTRS_SERVICE_NAME,
  SEMRESATTRS_SERVICE_VERSION,
  SEMRESATTRS_DEPLOYMENT_ENVIRONMENT,
} from "@opentelemetry/semantic-conventions";
import { OTLPTraceExporter } from "@opentelemetry/exporter-trace-otlp-http";
import { OTLPMetricExporter } from "@opentelemetry/exporter-metrics-otlp-http";
import { BatchSpanProcessor } from "@opentelemetry/sdk-trace-base";
import { PeriodicExportingMetricReader } from "@opentelemetry/sdk-metrics";
import { HttpInstrumentation } from "@opentelemetry/instrumentation-http";
import { GraphQLInstrumentation } from "@opentelemetry/instrumentation-graphql";
import { diag, DiagConsoleLogger, DiagLogLevel } from "@opentelemetry/api";
import { OTLPLogExporter } from "@opentelemetry/exporter-logs-otlp-http";
import {
  LoggerProvider,
  SimpleLogRecordProcessor,
} from "@opentelemetry/sdk-logs";

// Import your config file
import config from "$config/config";

// Set up diagnostics logging
diag.setLogger(new DiagConsoleLogger(), DiagLogLevel.INFO);

const resourceAttributes = {
  [SEMRESATTRS_SERVICE_NAME]: config.openTelemetry.SERVICE_NAME,
  [SEMRESATTRS_SERVICE_VERSION]: config.openTelemetry.SERVICE_VERSION,
  [SEMRESATTRS_DEPLOYMENT_ENVIRONMENT]:
    config.openTelemetry.DEPLOYMENT_ENVIRONMENT,
};

// Create OTLP exporters
const otlpTraceExporter = new OTLPTraceExporter({
  url: config.openTelemetry.OTLP_TRACES_ENDPOINT,
  headers: { "Content-Type": "application/json" },
});

const otlpMetricExporter = new OTLPMetricExporter({
  url: config.openTelemetry.OTLP_METRICS_ENDPOINT,
  headers: { "Content-Type": "application/json" },
});

const otlpLogExporter = new OTLPLogExporter({
  url: config.openTelemetry.OTLP_LOGS_ENDPOINT,
  headers: { "Content-Type": "application/json" },
});

// Create and register LoggerProvider
const loggerProvider = new LoggerProvider({
  resource: new Resource(resourceAttributes),
});
loggerProvider.addLogRecordProcessor(
  new SimpleLogRecordProcessor(otlpLogExporter),
);

const sdk = new NodeSDK({
  resource: new Resource(resourceAttributes),
  traceExporter: otlpTraceExporter,
  spanProcessor: new BatchSpanProcessor(otlpTraceExporter),
  metricReader: new PeriodicExportingMetricReader({
    exporter: otlpMetricExporter,
    exportIntervalMillis: 60000, // Export metrics every 60 seconds
  }),
  instrumentations: [
    getNodeAutoInstrumentations(),
    new HttpInstrumentation(),
    new GraphQLInstrumentation({
      allowValues: true,
      depth: -1,
    }),
  ],
});

sdk.start();

process.on("SIGTERM", () => {
  sdk
    .shutdown()
    .then(() => console.log("OpenTelemetry SDK shut down"))
    .catch((error) =>
      console.log("Error shutting down OpenTelemetry SDK", error),
    )
    .finally(() => process.exit(0));
});

// Example of creating a logger and logging a message
const logger = loggerProvider.getLogger("example-logger");
// logger.info('This is an example log message');

export { loggerProvider };
