import axios from "axios";
import config from "../config/config.ts";
import type {
  CouchbaseFunction,
  FunctionStatus,
  ExecutionStats,
  FailureStats,
  DcpBacklogSize,
} from "../types/index.ts";

export async function getFunctionList(): Promise<string[]> {
  const response = await axios.get<{ functions: string[] }>(
    `${config.COUCHBASE_HOST}/api/v1/list/functions`,
  );
  return response.data.functions;
}

export async function checkFunctionStatus(
  functionName: string,
): Promise<FunctionStatus> {
  const response = await axios.get<FunctionStatus>(
    `${config.COUCHBASE_HOST}/api/v1/status/${functionName}`,
  );
  return response.data;
}

export async function checkExecutionStats(
  functionName: string,
): Promise<ExecutionStats> {
  const response = await axios.get<ExecutionStats>(
    `${config.COUCHBASE_HOST}/getExecutionStats?name=${functionName}`,
  );
  return response.data;
}

export async function checkFailureStats(
  functionName: string,
): Promise<FailureStats> {
  const response = await axios.get<FailureStats>(
    `${config.COUCHBASE_HOST}/getFailureStats?name=${functionName}`,
  );
  return response.data;
}

export async function checkDcpBacklogSize(
  functionName: string,
): Promise<DcpBacklogSize> {
  const response = await axios.get<DcpBacklogSize>(
    `${config.COUCHBASE_HOST}/getDcpEventsRemaining?name=${functionName}`,
  );
  return response.data;
}
