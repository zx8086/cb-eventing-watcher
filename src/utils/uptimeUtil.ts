/* src/utils/uptimeUtil.ts */

let APPLICATION_START_TIME: number;

export function initializeUptime(): void {
  APPLICATION_START_TIME = Bun.nanoseconds();
}

export function getUptime(): string {
  if (APPLICATION_START_TIME === undefined) {
    throw new Error("Uptime not initialized. Call initializeUptime() first.");
  }

  const uptimeNs = Bun.nanoseconds() - APPLICATION_START_TIME;
  const uptimeMs = uptimeNs / 1_000_000; // Convert to milliseconds
  const days = Math.floor(uptimeMs / (24 * 60 * 60 * 1000));
  const hours = Math.floor(
    (uptimeMs % (24 * 60 * 60 * 1000)) / (60 * 60 * 1000),
  );
  const minutes = Math.floor((uptimeMs % (60 * 60 * 1000)) / (60 * 1000));
  const seconds = Math.floor((uptimeMs % (60 * 1000)) / 1000);

  return `${days}d ${hours}h ${minutes}m ${seconds}s`;
}
