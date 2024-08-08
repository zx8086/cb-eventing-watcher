// src/services/couchbaseService.ts

import axios, { type AxiosInstance } from "axios";
import config from "../config/config.ts";
import type {
  CouchbaseFunction,
  FunctionStatus,
  ExecutionStats,
  FailureStats,
  DcpBacklogSize,
} from "../types/index.ts";

// Create an Axios instance with Basic Auth
const axiosInstance: AxiosInstance = axios.create({
  baseURL: config.COUCHBASE_HOST,
  auth: {
    username: config.COUCHBASE_USERNAME,
    password: config.COUCHBASE_PASSWORD,
  },
});

export async function getFunctionList(): Promise<string[]> {
  const response = await axiosInstance.get<{ functions: string[] }>(
    "/api/v1/list/functions",
  );
  return response.data.functions;
}

export async function checkFunctionStatus(
  functionName: string,
): Promise<FunctionStatus> {
  const response = await axiosInstance.get<FunctionStatus>(
    `/api/v1/status/${functionName}`,
  );
  return response.data;
}

export async function checkExecutionStats(
  functionName: string,
): Promise<ExecutionStats> {
  const response = await axiosInstance.get<ExecutionStats>(
    `/getExecutionStats?name=${functionName}`,
  );
  return response.data;
}

export async function checkFailureStats(
  functionName: string,
): Promise<FailureStats> {
  const response = await axiosInstance.get<FailureStats>(
    `/getFailureStats?name=${functionName}`,
  );
  return response.data;
}

export async function checkDcpBacklogSize(
  functionName: string,
): Promise<DcpBacklogSize> {
  const response = await axiosInstance.get<DcpBacklogSize>(
    `/getDcpEventsRemaining?name=${functionName}`,
  );
  return response.data;
}
