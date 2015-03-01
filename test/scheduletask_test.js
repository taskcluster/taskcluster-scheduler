suite('Schedule dependent tasks', function() {
  var debug       = require('debug')('test:scheduleTask');
  var assert      = require('assert');
  var slugid      = require('slugid');
  var _           = require('lodash');
  var Promise     = require('promise');
  var taskcluster = require('taskcluster-client');
  var base        = require('taskcluster-base');
  var expect      = require('expect.js');
  var helper      = require('./helper');

  // Use the same task definition for everything
  var taskDefinition = {
    provisionerId:    'no-provisioner',
    workerType:       'test-scheduler-worker',
    created:          taskcluster.fromNowJSON(),
    deadline:         taskcluster.fromNowJSON('3 min'),
    payload:          {},
    metadata: {
      name:           "Unit testing task",
      description:    "Task created during unit tests",
      owner:          'jonsafj@mozilla.com',
      source:         'https://github.com/taskcluster/taskcluster-queue'
    },
    extra:            {}
  };

  test("taskC depends on taskA and taskB", async () => {
    // Generate taskIds
    var taskIdA = slugid.v4();
    var taskIdB = slugid.v4();
    var taskIdC = slugid.v4();
    debug("taskId for taskA: %s", taskIdA);
    debug("taskId for taskB: %s", taskIdB);
    debug("taskId for taskC: %s", taskIdC);

    // Definition of taskA and taskB
    var taskAB = _.cloneDeep(taskDefinition);
    // schedule immediately as we no dependencies
    taskAB.extra[helper.extraKey] = [];

    // Definition of taskC
    var taskC = _.cloneDeep(taskDefinition);
    // schedule when taskA and taskB is completed
    taskC.extra[helper.extraKey] = [taskIdA, taskIdB];

    // Define tasks
    debug("### Defining tasks");
    await Promise.all([
      helper.queue.defineTask(taskIdA, taskAB),
      helper.queue.defineTask(taskIdB, taskAB),
      helper.queue.defineTask(taskIdC, taskC)
    ]);

    debug("### Wait for taskA to be scheduled");
    await base.testing.poll(async () => {
      var {status} = await helper.queue.status(taskIdA);
      debug(" - taskA is: %s", status.state);
      assert(status.state === 'pending', "Expected taskA to be scheduled");
    }, 120, 1000);

    debug("### Waiting for taskB to be scheduled");
    await base.testing.poll(async () => {
      var {status} = await helper.queue.status(taskIdB);
      debug(" - taskB is: %s", status.state);
      assert(status.state === 'pending', "Expected taskB to be scheduled");
    }, 30, 1000);

    debug("### Checking taskC status");
    var s1 = await helper.queue.status(taskIdC);
    expect(s1.status.state).to.be('unscheduled');

    debug("### Claim and complete taskA");
    await helper.queue.claimTask(taskIdA, 0, {
      workerGroup:    'my-worker-group',
      workerId:       'my-worker'
    });
    await helper.queue.reportCompleted(taskIdA, 0, {});

    debug("### Sleep for 1s");
    await base.testing.sleep(1000);

    debug("### Checking taskC status");
    var s2 = await helper.queue.status(taskIdC);
    expect(s2.status.state).to.be('unscheduled');

    debug("### Claim and complete taskB");
    await helper.queue.claimTask(taskIdB, 0, {
      workerGroup:    'my-worker-group',
      workerId:       'my-worker'
    });
    await helper.queue.reportCompleted(taskIdB, 0, {});

    debug("### Waiting for taskC to be scheduled");
    await base.testing.poll(async () => {
      var {status} = await helper.queue.status(taskIdC);
      debug(" - taskC is: %s", status.state);
      assert(status.state === 'pending', "Expected taskC to be scheduled");
    }, 120, 1000);
  });
});

