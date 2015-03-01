var base    = require('taskcluster-base');
var debug   = require('debug')('scheduler:data');
var assert  = require('assert');
var Promise = require('promise');
var _       = require('lodash');

/**
 * Existence of an entity implies that requiredTask is required for taskId to
 * be scheduled.
 */
var RequiredTask = base.Entity.configure({
  version:          1,
  partitionKey:     base.Entity.keys.StringKey('taskId'),
  rowKey:           base.Entity.keys.StringKey('requiredTask'),
  properties: {
    taskId:         base.Entity.types.SlugId,
    requiredTask:   base.Entity.types.SlugId,
    expires:        base.Entity.types.Date
  }
});

// Export RequiredTask
exports.RequiredTask = RequiredTask;

/**
 * Check if there is any requiredTasks for taskId. This is operation basically
 * checks for set-emptiness.
 */
RequiredTask.hasRequiredTasks = async function(taskId) {
  // Query the partition with limit 1 to see if the partition is empty
  var result = await base.Entity.query.call(this, {
    taskId:         taskId
  }, {
    limit:          1
  });

  // Since we're not filtering it sane to assume that azure table storage always
  // returns results if there is any. However, the documentation says that the
  // query operation may return a continuationToken without results. It probably
  // can't do that in this case, but the docs aren't clear on the subject.
  if (result.entries.length === 0 && result.continuation) {
    debug("[alert-operator] Received continuationToken when checking " +
          "partition emptiness for taskId: %s got result: %j",
          taskId, result);
  }

  // We have entries if there is any in the result
  return result.entries.length > 0;
};

/**
 * Existence of an entity implies that dependentTasks is waiting for taskId to
 * be completed.
 */
var DependentTask = base.Entity.configure({
  version:          1,
  partitionKey:     base.Entity.keys.StringKey('taskId'),
  rowKey:           base.Entity.keys.StringKey('dependentTask'),
  properties: {
    taskId:         base.Entity.types.SlugId,
    dependentTask:  base.Entity.types.SlugId,
    expires:        base.Entity.types.Date
  }
});

// Export DependentTask
exports.DependentTask = DependentTask;