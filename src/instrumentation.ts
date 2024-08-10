// src/instrumentation.ts

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
import { diag, DiagConsoleLogger, DiagLogLevel } from "@opentelemetry/api";
import { WinstonInstrumentation } from "@opentelemetry/instrumentation-winston";
import { getNodeAutoInstrumentations } from "@opentelemetry/auto-instrumentations-node";
import { BatchLogRecordProcessor } from "@opentelemetry/sdk-logs";
import * as logsAPI from "@opentelemetry/api-logs";

import config from "$config/config";

// Set up diagnostics logging
diag.setLogger(new DiagConsoleLogger(), DiagLogLevel.INFO);

// Create OTLP exporters
const traceExporter = new OTLPTraceExporter({
  url: config.openTelemetry.OTLP_TRACES_ENDPOINT,
  headers: { "Content-Type": "application/json" },
});

const metricExporter = new OTLPMetricExporter({
  url: config.openTelemetry.OTLP_METRICS_ENDPOINT,
  headers: { "Content-Type": "application/json" },
});

const logExporter = new OTLPLogExporter({
  url: config.openTelemetry.OTLP_LOGS_ENDPOINT,
  headers: { "Content-Type": "application/json" },
});

const sdk = new NodeSDK({
  resource: new Resource({
    [SEMRESATTRS_SERVICE_NAME]: config.openTelemetry.SERVICE_NAME,
    [SEMRESATTRS_SERVICE_VERSION]: config.openTelemetry.SERVICE_VERSION,
    [SEMRESATTRS_DEPLOYMENT_ENVIRONMENT]:
      config.openTelemetry.DEPLOYMENT_ENVIRONMENT,
  }),
  traceExporter,
  spanProcessors: [new BatchSpanProcessor(traceExporter)],
  metricReader: new PeriodicExportingMetricReader({
    exporter: metricExporter,
    exportIntervalMillis: 60000,
  }),
  logRecordProcessor: new BatchLogRecordProcessor(logExporter),
  instrumentations: [
    getNodeAutoInstrumentations({
      "@opentelemetry/instrumentation-fs": { enabled: false },
      "@opentelemetry/instrumentation-http": { enabled: true },
      "@opentelemetry/instrumentation-winston": { enabled: false },
    }),
    new WinstonInstrumentation({
      disableLogSending: true,
      logHook: (_span, record) => {
        record["resource.service.name"] = config.openTelemetry.SERVICE_NAME;
      },
    }),
  ],
});

// Start the SDK
sdk.start();

console.log("OpenTelemetry SDK started with auto-instrumentation");

// Graceful shutdown
process.on("SIGTERM", () => {
  sdk
    .shutdown()
    .then(() => console.log("SDK shut down successfully"))
    .catch((error) => console.log("Error shutting down SDK", error))
    .finally(() => process.exit(0));
});

// Export for use in other parts of your application if needed
export const otelSDK = sdk;
