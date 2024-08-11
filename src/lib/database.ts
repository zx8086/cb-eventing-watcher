/* src/lib/database.ts */

import { Database } from "bun:sqlite";
import { log, error } from "$utils/index";
import { trace, SpanStatusCode, SpanKind } from "@opentelemetry/api";

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

export function updateFunctionStatus(
  functionName: string,
  status: "success" | "error",
  message: string,
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
        await db.run(
          `
        INSERT OR REPLACE INTO function_status (function_name, status, message, timestamp)
        VALUES (?, ?, ?, ?)
      `,
          [functionName, status, message, timestamp],
        );

        log(`Function status updated in database: ${functionName} - ${status}`);
        span.setStatus({ code: SpanStatusCode.OK });
        span.setAttribute("event.outcome", "success");
      } catch (err) {
        error(`Error updating function status in database: ${functionName}`, {
          error: (err as Error).message,
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
        FROM function_status
        GROUP BY function_name
        HAVING MAX(timestamp)
        ORDER BY timestamp DESC
      `);

        span.setStatus({ code: SpanStatusCode.OK });
        span.setAttribute("event.outcome", "success");
        return results;
      } catch (err) {
        error("Error getting latest function statuses", {
          error: (err as Error).message,
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

        log("Removed outdated functions from database");
        span.setStatus({ code: SpanStatusCode.OK });
        span.setAttribute("event.outcome", "success");
      } catch (err) {
        error("Error removing outdated functions from database", {
          error: (err as Error).message,
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
