export default {
  COUCHBASE_HOST:
    process.env.COUCHBASE_HOST || "http://couchbase.example.com:8096",
  SLACK_WEBHOOK_URL: process.env.SLACK_WEBHOOK_URL || "",
  CRON_SCHEDULE: process.env.CRON_SCHEDULE || "0 * * * *",
  DCP_BACKLOG_THRESHOLD: Number(process.env.DCP_BACKLOG_THRESHOLD) || 1000,
};
