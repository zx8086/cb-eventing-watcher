// src/types/index.ts

export interface CouchbaseFunction {
  name: string;
}

export interface FunctionStatus {
  redeploy_required: boolean;
}

export interface ExecutionStats {}

export interface FailureStats {}

export interface DcpBacklogSize {
  dcp_backlog: number;
}
