// src/instrumentation.ts

process.env.NODE_TLS_REJECT_UNAUTHORIZED = "0";

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
import { OTLPLogExporter } from "@opentelemetry/exporter-logs-otlp-http";

import { BatchSpanProcessor } from "@opentelemetry/sdk-trace-base";
import { PeriodicExportingMetricReader } from "@opentelemetry/sdk-metrics";
import { diag, DiagConsoleLogger, DiagLogLevel } from "@opentelemetry/api";

import { WinstonInstrumentation } from "@opentelemetry/instrumentation-winston";
import {
  LoggerProvider,
  SimpleLogRecordProcessor,
  BatchLogRecordProcessor,
  ConsoleLogRecordExporter,
} from "@opentelemetry/sdk-logs";

import { OpenTelemetryTransportV3 } from "@opentelemetry/winston-transport";
import * as winston from "winston";
import * as api from "@opentelemetry/api-logs";

import config from "$config/config";

// Set up diagnostics logging
diag.setLogger(new DiagConsoleLogger(), DiagLogLevel.INFO);

const resource = new Resource({
  [SEMRESATTRS_SERVICE_NAME]: config.openTelemetry.SERVICE_NAME,
  [SEMRESATTRS_SERVICE_VERSION]: config.openTelemetry.SERVICE_VERSION,
  [SEMRESATTRS_DEPLOYMENT_ENVIRONMENT]:
    config.openTelemetry.DEPLOYMENT_ENVIRONMENT,
});

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

// Create and configure LoggerProvider
export const loggerProvider = new LoggerProvider({
  resource: resource,
});

loggerProvider.addLogRecordProcessor(
  new BatchLogRecordProcessor(otlpLogExporter),
);

// This is for the console logging

// loggerProvider.addLogRecordProcessor(
//   new SimpleLogRecordProcessor(new ConsoleLogRecordExporter()),
// );

api.logs.setGlobalLoggerProvider(loggerProvider);

const sdk = new NodeSDK({
  resource: resource,
  traceExporter: otlpTraceExporter,
  spanProcessors: [new BatchSpanProcessor(otlpTraceExporter)],
  metricReader: new PeriodicExportingMetricReader({
    exporter: otlpMetricExporter,
    exportIntervalMillis: 60000, // Export metrics every 60 seconds
  }),
  instrumentations: [
    getNodeAutoInstrumentations({
      "@opentelemetry/instrumentation-fs": { enabled: false },
      "@opentelemetry/instrumentation-http": { enabled: false },
      "@opentelemetry/instrumentation-winston": { enabled: true },
    }),
    new WinstonInstrumentation({
      logHook: (_span, record) => {
        record["resource.service.name"] = config.openTelemetry.SERVICE_NAME;
      },
    }),
  ],
});

// Start the SDK synchronously
sdk.start();

console.log("OpenTelemetry SDK started");
// You can create and use loggers after the SDK has started
// const logger = loggerProvider.getLogger("example-logger");

const logger = winston.createLogger({
  level: "info",
  transports: [
    new winston.transports.Console(),
    new OpenTelemetryTransportV3(),
  ],
});

// logger.emit({
//   severityNumber: 9, // INFO
//   severityText: "INFO",
//   body: "OpenTelemetry SDK initialized and logger is working",
// });

process.on("SIGTERM", () => {
  sdk
    .shutdown()
    .then(() => console.log("OpenTelemetry SDK shut down"))
    .catch((error) =>
      console.log("Error shutting down OpenTelemetry SDK", error),
    )
    .finally(() => process.exit(0));
});
