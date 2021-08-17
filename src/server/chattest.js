'use strict';

const express = require('express');
const app = express();
const defaultPort = process.env.PORT || 80;

const http = require('http').createServer(app); // Running as localhost, we could implement SSL later.
//const https = require('https');

const path = require('path');

// CUSTOM MODULES
const log = require('./custom-modules/logging');
const chat = require('./custom-modules/chat');
const AvailableGroup = require('./custom-modules/AvailableGroup.js');
// END CUSTOM MODULES

var demoServers = [
  new AvailableGroup('d58366', 'Physics Group', 'Hi guys.'),
  new AvailableGroup('1b233c', 'Maths Gang', 'Cya later.'),
  new AvailableGroup('0b51e7', 'Computer Science Chat', 'Here is my NEA chat app!'),
  new AvailableGroup('TEST0', 'Test Chat 0', 'This is to check the overflow behaviour of the container.'),
  new AvailableGroup('TEST1', 'Test Chat 1', 'This is to check the overflow behaviour of the container.'),
  new AvailableGroup('TEST2', 'Test Chat 2', 'This is to check the overflow behaviour of the container.'),
  new AvailableGroup('TEST3', 'Test Chat 3', 'This is to check the overflow behaviour of the container.'),
  new AvailableGroup('TEST4', 'Test Chat 4', 'This is to check the overflow behaviour of the container.'),
  new AvailableGroup('TEST5', 'Test Chat 5', 'This is to check the overflow behaviour of the container.'),
  new AvailableGroup('TEST6', 'Test Chat 6', 'This is to check the overflow behaviour of the container.'),
  new AvailableGroup('TEST7', 'Test Chat 7', 'This is to check the overflow behaviour of the container.'),
  new AvailableGroup('TEST8', 'Test Chat 8', 'This is to check the overflow behaviour of the container.'),
  new AvailableGroup('TEST9', 'Test Chat 9', 'This is to check the overflow behaviour of the container.'),
  new AvailableGroup('TEST10', 'Test Chat 10', 'This is to check the overflow behaviour of the container.'),
];

app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname + '/../client/chat.html'));
});

app.get('/api/GetMyGroups', (req, res) => {
  res.json(JSON.stringify(demoServers));
});

app.use(
  express.static('../client', {
    extensions: ['html', 'htm'],
  })
);

const httpServer = app.listen(defaultPort, () => {
  log.info('Node.js HTTP web server started on port ' + httpServer.address().port);
  chat.initialise(httpServer);
});