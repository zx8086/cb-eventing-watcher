// src/database.ts
import { Database } from "bun:sqlite";
import { log, error } from "$utils/index";
import { trace, context, SpanStatusCode } from "@opentelemetry/api";

const tracer = trace.getTracer("sqlite-database");

class TracedDatabase {
  private db: Database;

  constructor(filename: string, options?: object) {
    this.db = new Database(filename, options);
  }

  query(sql: string, params?: any): any {
    return tracer.startActiveSpan("db.query", (span) => {
      try {
        span.setAttribute("db.statement", sql);
        if (params) {
          span.setAttribute("db.params", JSON.stringify(params));
        }
        const result = this.db.query(sql).all(params);
        span.setAttribute("db.result_count", result.length);
        span.setStatus({ code: SpanStatusCode.OK });
        return result;
      } catch (err) {
        span.recordException(err as Error);
        span.setStatus({
          code: SpanStatusCode.ERROR,
          message: (err as Error).message,
        });
        throw err;
      } finally {
        span.end();
      }
    });
  }

  run(sql: string, params?: any): any {
    return tracer.startActiveSpan("db.run", (span) => {
      try {
        span.setAttribute("db.statement", sql);
        if (params) {
          span.setAttribute("db.params", JSON.stringify(params));
        }
        let result;
        if (params === undefined) {
          result = this.db.run(sql);
        } else if (Array.isArray(params)) {
          result = this.db.run(sql, ...params);
        } else {
          result = this.db.run(sql, params);
        }
        span.setAttribute("db.changes", result.changes);
        span.setAttribute(
          "db.lastInsertRowid",
          result.lastInsertRowid.toString(),
        );
        span.setStatus({ code: SpanStatusCode.OK });
        return result;
      } catch (err) {
        span.recordException(err as Error);
        span.setStatus({
          code: SpanStatusCode.ERROR,
          message: (err as Error).message,
        });
        throw err;
      } finally {
        span.end();
      }
    });
  }
}

const db = new TracedDatabase("src/db/health_check.sqlite", { create: true });

// Initialize the database
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
  return tracer.startActiveSpan("updateFunctionStatus", (span) => {
    try {
      const timestamp = Date.now();
      db.run(
        `
        INSERT OR REPLACE INTO function_status (function_name, status, message, timestamp)
        VALUES (?, ?, ?, ?)
      `,
        [functionName, status, message, timestamp],
      );

      log(`Function status updated in database: ${functionName} - ${status}`);
      span.setStatus({ code: SpanStatusCode.OK });
    } catch (err) {
      error(`Error updating function status in database: ${functionName}`, {
        error: (err as Error).message,
      });
      span.recordException(err as Error);
      span.setStatus({
        code: SpanStatusCode.ERROR,
        message: (err as Error).message,
      });
      throw err;
    } finally {
      span.end();
    }
  });
}

export function getLatestFunctionStatuses() {
  return tracer.startActiveSpan("getLatestFunctionStatuses", (span) => {
    try {
      const results = db.query(`
        SELECT function_name, status, message, timestamp
        FROM function_status
        GROUP BY function_name
        HAVING MAX(timestamp)
        ORDER BY timestamp DESC
      `);

      span.setStatus({ code: SpanStatusCode.OK });
      return results;
    } catch (err) {
      error(`Error getting latest function statuses`, {
        error: (err as Error).message,
      });
      span.recordException(err as Error);
      span.setStatus({
        code: SpanStatusCode.ERROR,
        message: (err as Error).message,
      });
      throw err;
    } finally {
      span.end();
    }
  });
}

export function removeOutdatedFunctions(currentFunctions: string[]) {
  return tracer.startActiveSpan("removeOutdatedFunctions", (span) => {
    try {
      const placeholders = currentFunctions.map(() => "?").join(",");
      db.run(
        `
        DELETE FROM function_status
        WHERE function_name NOT IN (${placeholders})
      `,
        currentFunctions,
      );

      log(`Removed outdated functions from database`);
      span.setStatus({ code: SpanStatusCode.OK });
    } catch (err) {
      error(`Error removing outdated functions from database`, {
        error: (err as Error).message,
      });
      span.recordException(err as Error);
      span.setStatus({
        code: SpanStatusCode.ERROR,
        message: (err as Error).message,
      });
      throw err;
    } finally {
      span.end();
    }
  });
}
