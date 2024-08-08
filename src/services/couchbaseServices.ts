// src/services/couchbaseService.ts

import config from "../config/config.ts";
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
  const response = await fetch(`${baseURL}${endpoint}`, { headers });
  if (!response.ok) {
    throw new Error(`HTTP error! status: ${response.status}`);
  }
  return response.json();
}

export async function getFunctionList(): Promise<string[]> {
  const data = await fetchWithAuth("/api/v1/list/functions");
  return data.functions;
}

export async function checkFunctionStatus(
  functionName: string,
): Promise<FunctionStatus> {
  return fetchWithAuth(`/api/v1/status/${functionName}`);
}

export async function checkExecutionStats(
  functionName: string,
): Promise<ExecutionStats> {
  return fetchWithAuth(`/getExecutionStats?name=${functionName}`);
}

export async function checkFailureStats(
  functionName: string,
): Promise<FailureStats> {
  return fetchWithAuth(`/getFailureStats?name=${functionName}`);
}

export async function checkDcpBacklogSize(
  functionName: string,
): Promise<DcpBacklogSize> {
  return fetchWithAuth(`/getDcpEventsRemaining?name=${functionName}`);
}
