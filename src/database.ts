// src/database.ts
import { Database } from "bun:sqlite";
import { log, error } from "./utils/logger";

const db = new Database("health_check.sqlite", { create: true });

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
  const timestamp = Date.now();
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
}

export function getLatestFunctionStatuses() {
  return db
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
}

export function removeOutdatedFunctions(currentFunctions: string[]) {
  const placeholders = currentFunctions.map(() => "?").join(",");
  db.run(
    `
    DELETE FROM function_status
    WHERE function_name NOT IN (${placeholders})
  `,
    currentFunctions,
  );

  log(`Removed outdated functions from database`);
}
