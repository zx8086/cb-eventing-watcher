/* src/lib/database.ts */

import { Database } from "bun:sqlite";
import { log, error } from "$utils/index";
import { trace, SpanStatusCode, SpanKind } from "@opentelemetry/api";
import { sendSlackAlert, AlertSeverity } from "$services/slackService";

const tracer = trace.getTracer("sqlite-database");

class TracedDatabase {
  private db: Database;

  constructor(filename: string, options?: object) {
    this.db = new Database(filename, options);
  }

  private async tracedOperation<T>(
    operationName: string,
    operation: () => T,
    attributes: Record<string, string | number | undefined>,
  ): Promise<T> {
    return tracer.startActiveSpan(
      operationName,
      {
        kind: SpanKind.CLIENT,
        attributes: {
          "transaction.type": "db",
          ...Object.fromEntries(
            Object.entries(attributes).filter(([_, v]) => v !== undefined),
          ),
        },
      },
      async (span) => {
        try {
          const result = await operation();
          span.setStatus({ code: SpanStatusCode.OK });
          span.setAttribute("event.outcome", "success");
          return result;
        } catch (err) {
          span.recordException(err as Error);
          span.setStatus({
            code: SpanStatusCode.ERROR,
            message: (err as Error).message,
          });
          span.setAttribute("event.outcome", "failure");
          throw err;
        } finally {
          span.end();
        }
      },
    );
  }

  query(sql: string, params?: any): any {
    return this.tracedOperation(
      "db.query",
      () => {
        const result = this.db.query(sql).all(params);
        return result;
      },
      {
        "db.statement": sql,
        "db.params": params ? JSON.stringify(params) : undefined,
      },
    );
  }

  run(sql: string, params?: any): any {
    return this.tracedOperation(
      "db.run",
      () => {
        let result;
        if (params === undefined) {
          result = this.db.run(sql);
        } else if (Array.isArray(params)) {
          result = this.db.run(sql, ...params);
        } else {
          result = this.db.run(sql, params);
        }
        return result;
      },
      {
        "db.statement": sql,
        "db.params": params ? JSON.stringify(params) : undefined,
      },
    );
  }
}

const db = new TracedDatabase("src/db/health_check.sqlite", { create: true });

db.run(`
  CREATE TABLE IF NOT EXISTS function_status (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    function_name TEXT NOT NULL,
    status TEXT NOT NULL,
    message TEXT,
    timestamp INTEGER NOT NULL
  )
`);

export async function updateFunctionStatus(
  functionName: string,
  status: "deployed" | "undeployed" | "paused" | "error",
  message: string,
  previousStatus: string | null,
) {
  return tracer.startActiveSpan(
    "updateFunctionStatus",
    {
      kind: SpanKind.INTERNAL,
      attributes: {
        "transaction.type": "db",
        "function.name": functionName,
        "function.status": status,
      },
    },
    async (span) => {
      try {
        const timestamp = Date.now();

        log(`Updating status for ${functionName}:`, {
          functionName,
          previousStatus,
          newStatus: status,
          message,
          timestamp: new Date(timestamp).toISOString(),
        });

        // Get the most recent status from the database
        const latestStatus = await getLatestFunctionStatus(functionName);
        log(`Latest status from DB for ${functionName}:`, {
          functionName,
          latestStatus: JSON.stringify(latestStatus),
          timestamp: new Date().toISOString(),
        });

        // Insert the new status
        await db.run(
          `
          INSERT INTO function_status (function_name, status, message, timestamp)
          VALUES (?, ?, ?, ?)
        `,
          [functionName, status, message, timestamp],
        );

        log(`Function status updated in database: ${functionName}`, {
          functionName,
          status,
          timestamp: new Date(timestamp).toISOString(),
        });

        // Check for status changes
        if (latestStatus && latestStatus.status !== status) {
          let alertMessage = `Function ${functionName} status changed from ${latestStatus.status} to ${status}`;
          let severity = AlertSeverity.INFO;

          if (status === "error" || status === "paused") {
            severity = AlertSeverity.WARNING;
          } else if (
            status === "deployed" &&
            (latestStatus.status === "error" ||
              latestStatus.status === "paused")
          ) {
            alertMessage = `Function ${functionName} has recovered and is now operating normally`;
          }

          log(`Sending alert for ${functionName}:`, {
            functionName,
            alertMessage,
            severity,
            previousStatus: latestStatus.status,
            newStatus: status,
            timestamp: new Date(timestamp).toISOString(),
          });
          await sendSlackAlert(alertMessage, {
            severity: severity,
            functionName: functionName,
            additionalContext: {
              previousStatus: latestStatus.status,
              currentStatus: status,
              message: message,
              timestamp: new Date(timestamp).toISOString(),
            },
          });
        } else {
          log(`No status change for ${functionName}`, {
            functionName,
            status,
            timestamp: new Date(timestamp).toISOString(),
          });
        }

        span.setStatus({ code: SpanStatusCode.OK });
        span.setAttribute("event.outcome", "success");
      } catch (err) {
        error(`Error updating function status in database: ${functionName}`, {
          error: (err as Error).message,
          timestamp: new Date().toISOString(),
        });
        span.recordException(err as Error);
        span.setStatus({
          code: SpanStatusCode.ERROR,
          message: (err as Error).message,
        });
        span.setAttribute("event.outcome", "failure");
        throw err;
      } finally {
        span.end();
      }
    },
  );
}

export async function getLatestFunctionStatus(functionName: string) {
  return tracer.startActiveSpan(
    "getLatestFunctionStatus",
    {
      kind: SpanKind.INTERNAL,
      attributes: {
        "transaction.type": "db",
        "function.name": functionName,
      },
    },
    async (span) => {
      try {
        const result = await db.query(
          `
          SELECT status, message, timestamp
          FROM function_status
          WHERE function_name = ?
          ORDER BY timestamp DESC
          LIMIT 1
        `,
          [functionName],
        );

        log(`Retrieved latest status for ${functionName}:`, {
          functionName,
          result: JSON.stringify(result),
          timestamp: new Date().toISOString(),
        });

        span.setStatus({ code: SpanStatusCode.OK });
        span.setAttribute("event.outcome", "success");
        return result[0] || null;
      } catch (err) {
        error(`Error getting latest function status for ${functionName}`, {
          error: (err as Error).message,
          timestamp: new Date().toISOString(),
        });
        span.recordException(err as Error);
        span.setStatus({
          code: SpanStatusCode.ERROR,
          message: (err as Error).message,
        });
        span.setAttribute("event.outcome", "failure");
        throw err;
      } finally {
        span.end();
      }
    },
  );
}

export function getLatestFunctionStatuses() {
  return tracer.startActiveSpan(
    "getLatestFunctionStatuses",
    {
      kind: SpanKind.INTERNAL,
      attributes: {
        "transaction.type": "db",
      },
    },
    async (span) => {
      try {
        const results = await db.query(`
          SELECT function_name, status, message, timestamp
          FROM function_status fs1
          WHERE timestamp = (
            SELECT MAX(timestamp)
            FROM function_status fs2
            WHERE fs2.function_name = fs1.function_name
          )
          ORDER BY function_name, timestamp DESC
        `);

        log("Retrieved latest function statuses:", {
          results: JSON.stringify(results),
          timestamp: new Date().toISOString(),
        });

        span.setStatus({ code: SpanStatusCode.OK });
        span.setAttribute("event.outcome", "success");
        return results;
      } catch (err) {
        error("Error getting latest function statuses", {
          error: (err as Error).message,
          timestamp: new Date().toISOString(),
        });
        span.recordException(err as Error);
        span.setStatus({
          code: SpanStatusCode.ERROR,
          message: (err as Error).message,
        });
        span.setAttribute("event.outcome", "failure");
        throw err;
      } finally {
        span.end();
      }
    },
  );
}

export function removeOutdatedFunctions(currentFunctions: string[]) {
  return tracer.startActiveSpan(
    "removeOutdatedFunctions",
    {
      kind: SpanKind.INTERNAL,
      attributes: {
        "transaction.type": "db",
        "functions.count": currentFunctions.length,
      },
    },
    async (span) => {
      try {
        const placeholders = currentFunctions.map(() => "?").join(",");
        await db.run(
          `
        DELETE FROM function_status
        WHERE function_name NOT IN (${placeholders})
      `,
          currentFunctions,
        );

        log("Removed outdated functions from database", {
          currentFunctions,
          timestamp: new Date().toISOString(),
        });
        span.setStatus({ code: SpanStatusCode.OK });
        span.setAttribute("event.outcome", "success");
      } catch (err) {
        error("Error removing outdated functions from database", {
          error: (err as Error).message,
          timestamp: new Date().toISOString(),
        });
        span.recordException(err as Error);
        span.setStatus({
          code: SpanStatusCode.ERROR,
          message: (err as Error).message,
        });
        span.setAttribute("event.outcome", "failure");
        throw err;
      } finally {
        span.end();
      }
    },
  );
}
