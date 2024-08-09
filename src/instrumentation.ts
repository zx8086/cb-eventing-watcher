// src/instrumentation.ts

process.env.NODE_TLS_REJECT_UNAUTHORIZED = "0";

import { NodeTracerProvider } from "@opentelemetry/sdk-trace-node";
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
  PeriodicExportingMetricReader,
  MeterProvider,
} from "@opentelemetry/sdk-metrics";
import { diag, DiagConsoleLogger, DiagLogLevel } from "@opentelemetry/api";
import { WinstonInstrumentation } from "@opentelemetry/instrumentation-winston";
import { registerInstrumentations } from "@opentelemetry/instrumentation";
import { getNodeAutoInstrumentations } from "@opentelemetry/auto-instrumentations-node";
import {
  LoggerProvider,
  BatchLogRecordProcessor,
} from "@opentelemetry/sdk-logs";
import * as logsAPI from "@opentelemetry/api-logs";

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

// Set up the trace provider
const tracerProvider = new NodeTracerProvider({
  resource: resource,
});
tracerProvider.addSpanProcessor(new BatchSpanProcessor(otlpTraceExporter));
tracerProvider.register();

// Set up the logger provider
const loggerProvider = new LoggerProvider({
  resource: resource,
});
loggerProvider.addLogRecordProcessor(
  new BatchLogRecordProcessor(otlpLogExporter),
);
logsAPI.logs.setGlobalLoggerProvider(loggerProvider);

// Set up metrics
const meterProvider = new MeterProvider({
  resource: resource,
});

meterProvider.addMetricReader(
  new PeriodicExportingMetricReader({
    exporter: otlpMetricExporter,
    exportIntervalMillis: 60000,
  }),
);

// Register instrumentations
registerInstrumentations({
  instrumentations: [
    new WinstonInstrumentation({
      disableLogSending: true,
      logHook: (_span, record) => {
        record["resource.service.name"] = config.openTelemetry.SERVICE_NAME;
      },
    }),
    getNodeAutoInstrumentations({
      "@opentelemetry/instrumentation-http": { enabled: false },
      "@opentelemetry/instrumentation-fs": { enabled: false },
    }),
  ],
});

// Shutdown handler
const shutdownHandler = () => {
  tracerProvider
    .shutdown()
    .then(() => loggerProvider.shutdown())
    .then(() => meterProvider.shutdown())
    .then(() => console.log("OpenTelemetry SDK shut down"))
    .catch((error) =>
      console.log("Error shutting down OpenTelemetry SDK", error),
    )
    .finally(() => process.exit(0));
};

process.on("SIGTERM", shutdownHandler);
process.on("SIGINT", shutdownHandler);

console.log("OpenTelemetry SDK started with auto-instrumentation");

export { tracerProvider, loggerProvider, meterProvider };
