var assert          = require('assert');
var Promise         = require('promise');
var path            = require('path');
var _               = require('lodash');
var debug           = require('debug')('test:helper');
var base            = require('taskcluster-base');
var taskcluster     = require('taskcluster-client');
var mocha           = require('mocha');
var bin = {
  handler:            require('../bin/handler'),
  expireRelations:    null //require('../bin/expire-relations')
};

var testProfile = 'test';

// Create and export helper object
var helper = module.exports = {};

// Load configuration
var cfg = helper.cfg = base.config({
  defaults:     require('../config/defaults'),
  profile:      require('../config/' + testProfile),
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

// Set extraKey for tests to use
helper.extraKey = cfg.get('scheduler:extraKey');

// Skip tests if no credentials is configured
if (!cfg.get('taskcluster:credentials') ||
    !cfg.get('pulse:password')) {
  console.log("Skip tests due to missing credentials!");
}

// Allow tests to run expire-relations
helper.expireRelations = () => {
  return bin.expireRelations(testProfile);
};

// Hold reference to handler
var handler = null;

// Setup before tests
mocha.before(async () => {
  debug("Creating handler");
  handler = await bin.handler(testProfile);

  helper.queue = new taskcluster.Queue({
    baseUrl:      cfg.get('taskcluster:queueBaseUrl'),
    credentials:  cfg.get('taskcluster:credentials')
  });
});

// Cleanup after tests
mocha.after(async () => {
  // Kill handler
  await handler.terminate();
});
