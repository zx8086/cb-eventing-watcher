// src/database.ts
import { Database } from "bun:sqlite";
import { log, error } from "$utils/index";
import { trace, context, SpanStatusCode } from "@opentelemetry/api";

const tracer = trace.getTracer("sqlite-database");

const db = new Database("src/db/health_check.sqlite", { create: true });

// Wrap the initial table creation in a span
tracer.startActiveSpan("create_function_status_table", (span) => {
  try {
    db.run(`
      CREATE TABLE IF NOT EXISTS function_status (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        function_name TEXT NOT NULL,
        status TEXT NOT NULL,
        message TEXT,
        timestamp INTEGER NOT NULL
      )
    `);
    span.setStatus({ code: SpanStatusCode.OK });
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

export function updateFunctionStatus(
  functionName: string,
  status: "success" | "error",
  message: string,
) {
  return tracer.startActiveSpan("updateFunctionStatus", (span) => {
    try {
      const timestamp = Date.now();
      span.setAttribute("db.operation", "INSERT OR REPLACE");
      span.setAttribute("db.function_name", functionName);
      span.setAttribute("db.status", status);

      db.run(
        `
        INSERT OR REPLACE INTO function_status (function_name, status, message, timestamp)
        VALUES ($functionName, $status, $message, $timestamp)
      `,
        {
          $functionName: functionName,
          $status: status,
          $message: message,
          $timestamp: timestamp,
        },
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
      span.setAttribute("db.operation", "SELECT");

      const results = db
        .query(
          `
        SELECT function_name, status, message, timestamp
        FROM function_status
        GROUP BY function_name
        HAVING MAX(timestamp)
        ORDER BY timestamp DESC
      `,
        )
        .all();

      span.setAttribute("db.result_count", results.length);
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
      span.setAttribute("db.operation", "DELETE");
      span.setAttribute("db.current_functions_count", currentFunctions.length);

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
