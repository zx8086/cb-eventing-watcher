/* src/types/eventingMetrics.ts */

export interface ExecutionStats {
  agg_queue_memory: number;
  agg_queue_size: number;
  curl: {
    delete: number;
    get: number;
    head: number;
    post: number;
    put: number;
  };
  curl_success_count: number;
  dcp_delete_checkpoint_cas_mismatch: number;
  dcp_delete_msg_counter: number;
  dcp_delete_parse_failure: number;
  dcp_mutation_checkpoint_cas_mismatch: number;
  dcp_mutation_msg_counter: number;
  dcp_mutation_parse_failure: number;
  enqueued_dcp_delete_msg_counter: number;
  enqueued_dcp_mutation_msg_counter: number;
  enqueued_timer_msg_counter: number;
  feedback_queue_size: number;
  filtered_dcp_delete_counter: number;
  filtered_dcp_mutation_counter: number;
  lcb_retry_failure: number;
  messages_parsed: number;
  no_op_counter: number;
  num_processed_events: number;
  on_delete_failure: number;
  on_delete_success: number;
  on_update_failure: number;
  on_update_success: number;
  processed_events_size: number;
  timer_callback_failure: number;
  timer_callback_success: number;
  timer_cancel_counter: number;
  timer_create_counter: number;
  timer_create_failure: number;
  timer_msg_counter: number;
  timer_responses_sent: number;
  timestamp: {
    [key: string]: string;
  };
  uv_msg_parse_failure: number;
  uv_try_write_failure_counter: number;
}

export interface FailureStats {
  analytics_op_exception_count: number;
  app_worker_setting_events_lost: number;
  bkt_ops_cas_mismatch_count: number;
  bucket_cache_overflow_count: number;
  bucket_op_cache_miss_count: number;
  bucket_op_exception_count: number;
  checkpoint_failure_count: number;
  curl_failure_count: number;
  curl_max_resp_size_exceeded: number;
  curl_non_200_response: number;
  curl_timeout_count: number;
  dcp_delete_checkpoint_failure: number;
  dcp_events_lost: number;
  dcp_mutation_checkpoint_failure: number;
  debugger_events_lost: number;
  delete_events_lost: number;
  mutation_events_lost: number;
  n1ql_op_exception_count: number;
  timeout_count: number;
  timer_callback_missing_counter: number;
  timer_context_size_exceeded_counter: number;
  timer_events_lost: number;
  timestamp: {
    [key: string]: string;
  };
  v8worker_events_lost: number;
}

export interface FunctionStats {
  status: "deployed" | "undeployed" | "paused" | "deploying" | "undeploying";
  success: number;
  failure: number;
  backlog: number;
  timeout: number;
  curl: {
    get: number;
    post: number;
    head: number;
    put: number;
    delete: number;
  };
  dcp_backlog: number;
  execution_stats: ExecutionStats;
  failure_stats: FailureStats;
}
