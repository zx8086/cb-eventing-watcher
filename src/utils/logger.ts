// src/utils/logger.ts
//
import winston from "winston";
import { ecsFormat } from "@elastic/ecs-winston-format";
import { OpenTelemetryTransportV3 } from "@opentelemetry/winston-transport";
import DailyRotateFile from "winston-daily-rotate-file";
import path from "path";
import { loggerProvider } from "../instrumentation";

const rootDir = path.join(__dirname, "..", "..");
const logsDir = path.join(rootDir, "logs");

const logger = winston.createLogger({
  level: "info",
  format: ecsFormat({ convertReqRes: true }),
  transports: [
    new winston.transports.Console(),
    new OpenTelemetryTransportV3(),
    new DailyRotateFile({
      filename: path.join(logsDir, "couchbase-eventing-watcher-%DATE%.log"),
      datePattern: "YYYY-MM-DD",
      zippedArchive: true,
      maxSize: "20m",
      maxFiles: "14d",
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

export default logger;
