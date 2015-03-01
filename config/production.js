module.exports = {
  scheduler: {
    // Azure table names
    requiredTaskTableName:        'RequiredTasks',
    dependentTaskTableName:       'DependentTasks',

    // Name of pulse queue, if a non-exclusive queue is to be used.
    listenerQueueName:            'schedulerQueue',

    // Extra key to look for dependencies under, this is mostly configurable
    // so that tests can run against production queue
    extraKey:                     'waitFor'
  }
};