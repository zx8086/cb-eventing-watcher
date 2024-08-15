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
} from "@opentelemetry/sdk-metrics";
import {
  LoggerProvider,
  BatchLogRecordProcessor,
} from "@opentelemetry/sdk-logs";
import { getNodeAutoInstrumentations } from "@opentelemetry/auto-instrumentations-node";
import { WinstonInstrumentation } from "@opentelemetry/instrumentation-winston";
import {
  envDetector,
  hostDetector,
  osDetector,
  processDetector,
} from "@opentelemetry/resources";

import * as api from "@opentelemetry/api-logs";
import { config } from "$config";

// Set up diagnostics logging
diag.setLogger(new DiagConsoleLogger(), DiagLogLevel.DEBUG);

async function setupTelemetry() {
  // Create a shared resource
  const resource = new Resource({
    [SEMRESATTRS_SERVICE_NAME]: config.openTelemetry.SERVICE_NAME,
    [SEMRESATTRS_SERVICE_VERSION]: config.openTelemetry.SERVICE_VERSION,
    [SEMRESATTRS_DEPLOYMENT_ENVIRONMENT]:
      config.openTelemetry.DEPLOYMENT_ENVIRONMENT,
  });

  // Detect and merge additional resources
  const detectors = [envDetector, hostDetector, osDetector, processDetector];

  for (const detector of detectors) {
    const detectedResource = await detector.detect();
    resource.merge(detectedResource);
  }

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
  loggerProvider.addLogRecordProcessor(
    new BatchLogRecordProcessor(logExporter),
  );
  api.logs.setGlobalLoggerProvider(loggerProvider);

  // Set up MetricReaders
  const otlpMetricReader = new PeriodicExportingMetricReader({
    exporter: otlpMetricExporter,
    exportIntervalMillis: config.openTelemetry.METRIC_READER_INTERVAL,
  });

  // Set up MeterProvider
  const meterProvider = new MeterProvider({
    resource: resource,
    readers: [otlpMetricReader],
  });

  // Set this MeterProvider to be global to the app being instrumented.
  metrics.setGlobalMeterProvider(meterProvider);

  // Node SDK for OpenTelemetry
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
        disableLogSending: true,
      }),
    ],
  });

  // Start the SDK
  try {
    await sdk.start();
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

  return {
    sdk,
    meter: metrics.getMeter(
      config.openTelemetry.SERVICE_NAME,
      config.openTelemetry.SERVICE_VERSION,
    ),
  };
}

export let otelSDK: NodeSDK;
export let meter: ReturnType<typeof metrics.getMeter>;

setupTelemetry().then(({ sdk, meter: setupMeter }) => {
  otelSDK = sdk;
  meter = setupMeter;
});

export function isOtelReady(): boolean {
  return !!otelSDK && !!meter;
}
