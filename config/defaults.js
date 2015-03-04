module.exports = {
  scheduler: {
    // Azure table names
    requiredTaskTableName:        'RequiredTasks',
    dependentTaskTableName:       'DependentTasks',

    // Azure account
    azureAccount:                 undefined,

    // Name of pulse queue, if a non-exclusive queue is to be used.
    listenerQueueName:            undefined,

    // Component name in statistics
    statsComponent:               'scheduler',

    // Maximum number of messages to process in parallel
    prefetch:                     50,

    // Maximum number of tasks to update at once (per message)
    parallelism:                  200,

    // Extra key to look for dependencies under, this is mostly configurable
    // so that tests can run against production queue
    extraKey:                     'waitFor'
  },

  // TaskCluster configuration
  taskcluster: {
    // BaseUrl for components
    queueBaseUrl:                 undefined,

    // TaskCluster credentials for this server, these must have scopes:
    //   - queue:schedule-task,
    //   - assume:scheduler-id:*, and
    //   - auth:azure-table-access:<account>/<table>
    // (typically configured using environment variables)
    credentials: {
      clientId:                   undefined,
      accessToken:                undefined
    }
  },

  // Pulse credentials
  pulse: {
    username:                       undefined,
    password:                       undefined
  },

  // InfluxDB configuration
  influx: {
    // Usually provided as environment variables, must be on the form:
    // https://<user>:<pwd>@<host>:<port>/db/<database>
    connectionString:               undefined,

    // Maximum delay before submitting pending points
    maxDelay:                       5 * 60,

    // Maximum pending points in memory
    maxPendingPoints:               250
  }
};