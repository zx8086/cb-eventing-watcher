// src/services/couchbaseService.ts

import config from "../config/config.ts";
import { log, error } from "../utils/logger.ts";
import type {
  CouchbaseFunction,
  FunctionStatus,
  ExecutionStats,
  FailureStats,
  DcpBacklogSize,
} from "../types/index.ts";

const baseURL = config.COUCHBASE_HOST;
const headers = new Headers({
  Authorization:
    "Basic " +
    btoa(`${config.COUCHBASE_USERNAME}:${config.COUCHBASE_PASSWORD}`),
  "Content-Type": "application/json",
});

async function fetchWithAuth(endpoint: string): Promise<any> {
  const url = `${baseURL}${endpoint}`;
  log(`Fetching from Couchbase: ${url}`);
  try {
    const response = await fetch(url, { headers });
    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`);
    }
    const data = await response.json();
    log(`Successfully fetched data from ${url}`);
    return data;
  } catch (err) {
    const errorMessage = err instanceof Error ? err.message : "Unknown error";
    error(`Error fetching from Couchbase: ${url}`, { error: errorMessage });
    throw err; // Re-throw the error to be handled by the caller
  }
}

export async function getFunctionList(): Promise<string[]> {
  try {
    const data = await fetchWithAuth("/api/v1/list/functions");
    return data.functions;
  } catch (err) {
    error("Error getting function list", {
      error: err instanceof Error ? err.message : "Unknown error",
    });
    throw err;
  }
}

export async function checkFunctionStatus(
  functionName: string,
): Promise<FunctionStatus> {
  try {
    return await fetchWithAuth(`/api/v1/status/${functionName}`);
  } catch (err) {
    error(`Error checking status for function: ${functionName}`, {
      error: err instanceof Error ? err.message : "Unknown error",
    });
    throw err;
  }
}

export async function checkExecutionStats(
  functionName: string,
): Promise<ExecutionStats> {
  try {
    return await fetchWithAuth(`/getExecutionStats?name=${functionName}`);
  } catch (err) {
    error(`Error checking execution stats for function: ${functionName}`, {
      error: err instanceof Error ? err.message : "Unknown error",
    });
    throw err;
  }
}

export async function checkFailureStats(
  functionName: string,
): Promise<FailureStats> {
  try {
    return await fetchWithAuth(`/getFailureStats?name=${functionName}`);
  } catch (err) {
    error(`Error checking failure stats for function: ${functionName}`, {
      error: err instanceof Error ? err.message : "Unknown error",
    });
    throw err;
  }
}

export async function checkDcpBacklogSize(
  functionName: string,
): Promise<DcpBacklogSize> {
  try {
    return await fetchWithAuth(`/getDcpEventsRemaining?name=${functionName}`);
  } catch (err) {
    error(`Error checking DCP backlog size for function: ${functionName}`, {
      error: err instanceof Error ? err.message : "Unknown error",
    });
    throw err;
  }
}
