/* src/utils/logger.ts */

import winston from "winston";
import { ecsFormat } from "@elastic/ecs-winston-format";
import { OpenTelemetryTransportV3 } from "@opentelemetry/winston-transport";
import DailyRotateFile from "winston-daily-rotate-file";
import path from "path";
import config from "$config/config";
import * as opentelemetry from "@opentelemetry/api";

const rootDir = path.join(__dirname, "..", "..");
const logsDir = path.join(rootDir, "logs");

const traceIdFormat = winston.format((info) => {
  const span = opentelemetry.trace.getActiveSpan();
  if (span) {
    const spanContext = span.spanContext();
    info.trace_id = spanContext.traceId;
    info.span_id = spanContext.spanId;
  }
  return info;
});

const logger = winston.createLogger({
  level: config.app.LOG_LEVEL,
  format: ecsFormat({ convertReqRes: true }),
  transports: [
    new winston.transports.Console(),
    new OpenTelemetryTransportV3({
      level: config.app.LOG_LEVEL,
    }),
    new DailyRotateFile({
      filename: path.join(logsDir, "couchbase-eventing-watcher-%DATE%.log"),
      datePattern: "YYYY-MM-DD",
      zippedArchive: true,
      maxSize: "20m",
      maxFiles: "14d",
    }),
  ],
});

// const logger = winston.createLogger({
//   level: config.app.LOG_LEVEL,
//   format: winston.format.combine(
//     traceIdFormat(),
//     ecsFormat({ convertReqRes: true }),
//   ),
//   transports: [
//     new winston.transports.Console(),
//     new OpenTelemetryTransportV3({
//       level: config.app.LOG_LEVEL,
//       resourceAttributes: {
//         "service.name": config.openTelemetry.SERVICE_NAME,
//         "service.version": config.openTelemetry.SERVICE_VERSION,
//       },
//       onError: (error) => {
//         console.error("Error in OpenTelemetry transport", error);
//       },
//     }),
//     new DailyRotateFile({
//       filename: path.join(logsDir, "couchbase-eventing-watcher-%DATE%.log"),
//       datePattern: "YYYY-MM-DD",
//       zippedArchive: true,
//       maxSize: "20m",
//       maxFiles: "14d",
//     }),
//   ],
// });

export function log(message: string, meta?: any): void {
  logger.info(message, meta);
}

export function error(message: string, meta?: any): void {
  logger.error(message, meta);
}

export function warn(message: string, meta?: any): void {
  logger.warn(message, meta);
}

export function debug(message: string, meta?: any): void {
  logger.debug(message, meta);
}

export default logger;
