/* src/utils/logger.ts */

import winston from "winston";
import { ecsFormat } from "@elastic/ecs-winston-format";
import { OpenTelemetryTransportV3 } from "@opentelemetry/winston-transport";
import DailyRotateFile from "winston-daily-rotate-file";
import path from "path";
import { config } from "$config";

const rootDir = path.join(__dirname, "..", "..");
const logsDir = path.join(rootDir, "logs");

export const logger = winston.createLogger({
  level: config.application.LOG_LEVEL,
  format: ecsFormat({
    convertReqRes: true,
    apmIntegration: true,
  }),
  transports: [
    new winston.transports.Console(),
    new OpenTelemetryTransportV3({
      level: config.application.LOG_LEVEL,
    }),
    new DailyRotateFile({
      filename: path.join(logsDir, "couchbase-eventing-watcher-%DATE%.log"),
      datePattern: "YYYY-MM-DD",
      zippedArchive: true,
      maxSize: config.application.LOG_MAX_SIZE,
      maxFiles: config.application.LOG_MAX_FILES,
    }),
  ],
});

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
