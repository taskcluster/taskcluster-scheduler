module.exports = {
  scheduler: {
    // Azure table names
    requiredTaskTableName:        'TestRequiredTasks',
    dependentTaskTableName:       'TestDependentTasks',

    // Azure account
    azureAccount:                 undefined,

    // Name of pulse queue, if a non-exclusive queue is to be used.
    listenerQueueName:            undefined,

    // Component name in statistics
    statsComponent:               'test-scheduler',

    // Maximum number of messages to process in parallel
    prefetch:                     10,

    // Maximum number of tasks to update at once (per message)
    parallelism:                  1000,

    // Extra key to look for dependencies under, this is mostly configurable
    // so that tests can run against production queue
    extraKey:                     'test-waitFor'
  }
};