// src/utils/logger.ts

export function log(message: string): void {
  console.log(`[${new Date().toISOString()}] ${message}`);
}

export function error(message: string): void {
  console.error(`[${new Date().toISOString()}] ERROR: ${message}`);
}
