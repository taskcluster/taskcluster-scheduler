var assert      = require('assert');
var taskcluster = require('taskcluster-client');
var Promise     = require('promise');
var debug       = require('debug')('scheduler:handlers');
var _           = require('lodash');
var base        = require('taskcluster-base');

/** Class that handles messages from the queue and schedules tasks */
class Handler {
  /**
   * Create handler object,
   *
   * options: {
   *   extraKey:            // Key under task.extra to read dependencies from
   *   RequiredTask:        // data.RequiredTask
   *   DependentTask:       // data.DependentTask
   *   queue:               // taskcluster.Queue
   *   queueEvents:         // taskcluster.QueueEvents
   *   credentials:         // pulse credentials
   *   queueName:           // pulse queue name, if any
   *   prefetch:            // Number of messages to handle in parallel
   *   parallelism:         // Number to entities operations to do in parallel
   *   drain:               // Statistics drains
   *   component:           // Statistics components
   * }
   */
  constructor(options) {
    // Validate options
    assert(options,               "options is required");
    assert(options.extraKey,      "Expected 'extraKey' to be defined")
    assert(options.RequiredTask,  "Expected 'RequiredTask' to be defined");
    assert(options.DependentTask, "Expected 'DependentTask' to be defined");
    assert(options.queue,         "Expected 'queue' to be defined");
    assert(options.queueEvents,   "Expected 'queueEvents' to be defined");
    assert(options.credentials,   "Expected 'credentials' to be defined");
    assert(options.prefetch,      "Expected 'prefetch' to be defined");
    assert(options.parallelism,   "Expected 'parallelism' to be defined");
    assert(options.drain,         "Expected 'drain' to be defined");
    assert(options.component,     "Expected 'component' to be defined");
    // Store options on this
    this.extraKey       = options.extraKey;
    this.RequiredTask   = options.RequiredTask;
    this.DependentTask  = options.DependentTask;
    this.queue          = options.queue;
    this.queueEvents    = options.queueEvents;
    this.credentials    = options.credentials;
    this.queueName      = options.queueName;
    this.prefetch       = options.prefetch;
    this.parallelism    = options.parallelism;
    this.drain          = options.drain;
    this.component      = options.component;
    this.listener       = null;
  }

  async setup() {
    assert(this.listener === null, "Cannot setup twice!");

    // Create listener
    this.listener = new taskcluster.PulseListener({
      credentials:          this.credentials,
      queueName:            this.queueName,
      prefetch:             this.prefetch
    });

    // Binding for messages
    var definedBinding = this.queueEvents.taskDefined();
    var completedBinding = this.queueEvents.taskCompleted();
    this.listener.bind(definedBinding);
    this.listener.bind(completedBinding);

    // Create timed handler for statistics
    var timedHandler = base.stats.createHandlerTimer((message) => {
      if (message.exchange === definedBinding.exchange) {
        return this.onTaskDefined(message);
      }
      if (message.exchange === completedBinding.exchange) {
        return this.onTaskCompleted(message);
      }
      debug("[alert-operator]: received message from unexpected " +
            "exchange: %s, message: %j", message.exchange, message);
      throw new Error("Got message from unexpected exchange: " +
                      message.exchange);
    }, {
      drain:      this.drain,
      component:  this.component
    });

    // Listen for messages and handle them
    this.listener.on('message', timedHandler);

    // Start listening
    await this.listener.connect();
    await this.listener.resume();
    debug("started listening for tasks");
  }

  terminate() {
    return this.listener.close();
  }

  async onTaskDefined(message) {
    var taskId  = message.payload.status.taskId;
    var task    = await this.queue.getTask(taskId);

    // Check if there is any dependencies to play with
    if (!(task.extra[this.extraKey] instanceof Array)) {
      return debug("task: %s doesn't have any dependencies", taskId);
    }
    debug("task: %s has %s dependences",
          taskId, task.extra[this.extraKey].length);

    // Check that task.extra[this.extraKey] contains valid slug-ids
    var isValid = task.extra[this.extraKey].every((id) => {
      return typeof(id) === 'string' && /^[A-Za-z0-9_-]{8}[Q-T][A-Za-z0-9_-][CGKOSWaeimquy26-][A-Za-z0-9_-]{10}[AQgw]$/.test(id);
    });
    if (!isValid) {
      return debug("task: %s has invalid task.extra.%s: %j",
                   taskId, this.extraKey, task.extra[this.extraKey]);
    }

    // Let the relations expire at task deadline, we don't need them when we
    // can't schedule the task anymore.
    var expires = new Date(task.deadline);

    // Ensure that the RequiredTask relation is updated (entities created)
    await Promise.all(task.extra[this.extraKey].map((requiredTaskId) => {
      // We up-sert (overwrite-if-exists) so this shouldn't fail
      return this.RequiredTask.create({
        taskId:         taskId,
        requiredTask:   requiredTaskId,
        expires:        expires
      }, true);
    }));

    // Ensure that the DependentTask relation is updated (entities created)
    await Promise.all(task.extra[this.extraKey].map((requiredTaskId) => {
      // We up-sert (overwrite-if-exists) so this shouldn't fail
      return this.DependentTask.create({
        taskId:         requiredTaskId,
        dependentTask:  taskId,
        expires:        expires
      }, true);
    }));

    // Load task status for required tasks, and ensure that the RequiredTask
    // relation is up to date.
    var checkIfReady = false;
    await Promise.all(task.extra[this.extraKey].map(async (requiredTaskId) => {
      // Fetch status of required task
      var {status} = await this.queue.status(requiredTaskId);

      // We schedule, if there is just one run that has been completed
      var completed = status.runs.some((run) => {
        return run.state === 'completed';
      });

      // If completed, the we remove the requiredTask entry
      if (completed) {
        debug("removing %s as required for %s", requiredTaskId, taskId);

        var deleted = await RequiredTask.remove({
          taskId:         taskId,
          requiredTask:   requiredTaskId,
        }, true);
        // if we deleted anything we should check if we're read to schedule
        if (deleted) {
          checkIfReady = true;
        }
      }
    }));

    // If there is no dependencies, or some tasks completed we must check if
    // any dependencies remain (they could be resolved while we sync'ed up)
    if (checkIfReady || task.extra[this.extraKey].length === 0) {
      await this.scheduleIfReady(taskId);
    }
  }

  /**
   * Handle a task-completed message by listing dependent tasks and removing
   * entries from the the RequiredTask relation.
   */
  onTaskCompleted(message) {
    var taskId  = message.payload.status.taskId;
    debug("task: %s is completed", taskId);
    return this.DependentTask.query({
      taskId:       taskId
    }, {
      limit:        Math.min(this.parallelism, 1000),
      handler:      async (entry) => {
        debug("removing %s as required for %s", taskId, entry.dependentTask);

        // Ensure that the required task relation is updated
        await this.RequiredTask.remove({
          taskId:         entry.dependentTask,
          requiredTask:   taskId
        }, true);

        // Schedule if ready
        await this.scheduleIfReady(entry.dependentTask);

        // Remove the entry from the relation, we don't really need it anymore
        await entry.remove(true, true);
      }
    });
  }

  /** Schedule a task if all required tasks are completed */
  async scheduleIfReady(taskId) {
    // If taskId doesn't have any required tasks that it is waiting for then
    // we schedule the task.
    if (!await this.RequiredTask.hasRequiredTasks(taskId)) {
      debug("scheduling: %s", taskId);
      try {
        await this.queue.scheduleTask(taskId);
      }
      catch (err) {
        if (400 <= err.statusCode && err.statusCode < 600) {
          // This shouldn't happen too often, but it's expected to happen every
          // once in a while
          debug("[expected] Failed to schedule, task perhaps it was already " +
                "scheduled, err: %s, %j", err, err);
        } else {
          throw err;
        }
      }
    }
  }

};


// Export Handler
module.exports = Handler;

