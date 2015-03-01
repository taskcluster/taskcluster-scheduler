TaskCluster Task Scheduler (Prototype)
======================================

This is a simple scheduler that schedules dependent tasks. This is done by
listening for all task-defined messages, load tasks and read the
`task.extra.waitFor` property. If the property is a list of taskIds, the task
will be scheduled when the tasks referenced have been _completed_.

Tasks are created on the queue using the `queue.defineTask` method. Notice, that
if `task.extra.waitFor` is an empty list it will be scheduled immediately by
taskcluster-scheduler; task that doesn't specify the `task.extra.waitFor`
property will be ignored.

Example below how for to create two dependent tasks:

```js
var queue = new taskcluster.Queue(...);

// Create two taskIds
var taskIdA = slugid.v4();
var taskIdB = slugid.v4();

// Define taskA (which is scheduled by taskcluster-scheduler)
queue.defineTask(taskIdA, {
  provisionerId:    '...',
  workerType:       '...',
  created:          taskcluster.fromNowJSON(),
  deadline:         taskcluster.fromNowJSON('12 hours'),
  payload:          {...},
  metadata:         {...},
  extra: {
    waitFor:        []  // empty-set means it'll be scheduled immediately
  }
});

// Define taskB (which is scheduled by taskcluster-scheduler) after taskA
queue.defineTask(taskIdB, {
  provisionerId:    '...',
  workerType:       '...',
  created:          taskcluster.fromNowJSON(),
  deadline:         taskcluster.fromNowJSON('12 hours'),
  payload:          {...},
  metadata:         {...},
  extra: {
    waitFor:        [taskIdA]  // schedule when taskA is completed
  }
});
```

The order in which you define the tasks on the queue is not important to the
scheduler. If you create taskB referencing taskA, before you create taskA,
someone else can technically listen for the task-defined messages, get the
taskId for taskA and define this before you do so. For this reason it is
strongly encouraged that the task graph is constructed in a top-down manner.

If your tasks download artifacts from dependent tasks, failing to construct the
graph in a top-down manner may be a security issue.
