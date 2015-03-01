#!/usr/bin/env node
var path        = require('path');
var Promise     = require('promise');
var debug       = require('debug')('scheduler:bin:handler');
var base        = require('taskcluster-base');
var taskcluster = require('taskcluster-client');
var data        = require('../scheduler/data');
var Handler     = require('../scheduler/handler');

/** Launch handlers */
var launch = function(profile) {
  // Load configuration
  var cfg = base.config({
    defaults:     require('../config/defaults'),
    profile:      require('../config/' + profile),
    envs: [
      'taskcluster_queueBaseUrl',
      'taskcluster_credentials_clientId',
      'taskcluster_credentials_accessToken',
      'scheduler_azureAccount',
      'pulse_username',
      'pulse_password',
      'influx_connectionString'
    ],
    filename:     'taskcluster-scheduler'
  });

  // Create InfluxDB connection for submitting statistics
  var influx = new base.stats.Influx({
    connectionString:   cfg.get('influx:connectionString'),
    maxDelay:           cfg.get('influx:maxDelay'),
    maxPendingPoints:   cfg.get('influx:maxPendingPoints')
  });

  // Start monitoring the process
  base.stats.startProcessUsageReporting({
    drain:              influx,
    component:          cfg.get('scheduler:statsComponent'),
    process:            'handlers'
  });

  // Configure RequiredTask
  var RequiredTask = data.RequiredTask.setup({
    account:          cfg.get('scheduler:azureAccount'),
    table:            cfg.get('scheduler:requiredTaskTableName'),
    credentials:      cfg.get('taskcluster:credentials'),
    authBaseUrl:      cfg.get('taskcluster:authBaseUrl')
  });
  // Configure DependentTask
  var DependentTask = data.DependentTask.setup({
    account:          cfg.get('scheduler:azureAccount'),
    table:            cfg.get('scheduler:dependentTaskTableName'),
    credentials:      cfg.get('taskcluster:credentials'),
    authBaseUrl:      cfg.get('taskcluster:authBaseUrl')
  });

  // Configure queue and queueEvents
  var queue = new taskcluster.Queue({
    baseUrl:          cfg.get('taskcluster:queueBaseUrl'),
    credentials:      cfg.get('taskcluster:credentials')
  });
  var queueEvents = new taskcluster.QueueEvents({
    exchangePrefix: cfg.get('taskcluster:queueExchangePrefix')
  });

  debug("Creating handler");
  var handler = new Handler({
    extraKey:         cfg.get('scheduler:extraKey'),
    RequiredTask:     RequiredTask,
    DependentTask:    DependentTask,
    queue:            queue,
    queueEvents:      queueEvents,
    credentials:      cfg.get('pulse'),
    queueName:        cfg.get('scheduler:listenerQueueName'),
    prefetch:         cfg.get('scheduler:prefetch'),
    parallelism:      cfg.get('scheduler:parallelism'),
    drain:            influx,
    component:        cfg.get('scheduler:statsComponent')
  });

  return handler.setup().then(function() {
    debug('Handlers are now listening for events');

    // Notify parent process, so that this worker can run using LocalApp
    base.app.notifyLocalAppInParentProcess();

    return handler;
  });
};

// If handlers.js is executed start the handlers
if (!module.parent) {
  // Find configuration profile
  var profile = process.argv[2];
  if (!profile) {
    console.log("Usage: handlers.js [profile]")
    console.error("ERROR: No configuration profile is provided");
  }
  // Launch with given profile
  launch(profile).then(function() {
    debug("Launched handlers successfully");
  }).catch(function(err) {
    debug("Failed to start handlers, err: %s, as JSON: %j", err, err, err.stack);
    // If we didn't launch the handlers we should crash
    process.exit(1);
  });
}

// Export launch in-case anybody cares
module.exports = launch;