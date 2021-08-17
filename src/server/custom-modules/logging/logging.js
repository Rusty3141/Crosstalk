'use strict';

const fs = require('fs');
const path = require('path');

const log4js = require('log4js');
const logger = log4js.getLogger();

// Files don't like slashes in their names, so let's alter their name from the timestamp we use for the console.
const logFile = GetLogTimeStamp().replace(/\//g, '-').replace(/\:/g, '.') + '.log';
fs.writeFile(path.join(__dirname, '../../../../logs', logFile), '', (err) => {
  if (err) throw err;
  logger.info(`Log file created: ${logFile}`);
});

// Use this format for our logs. We will save to a file and also send them to the master console.
log4js.configure({
  appenders: {
    out: {
      type: 'console',
      layout: {
        type: 'pattern',
        pattern: '%d{dd/MM/yyyy hh:mm:ss} [%p] %m',
      },
    },
    app: {
      type: 'file',
      filename: path.join(__dirname, '../../../../logs', logFile),
      layout: {
        type: 'pattern',
        pattern: '%d{dd/MM/yyyy hh:mm:ss} [%p] %m',
      },
    },
  },
  categories: {
    default: {
      appenders: ['out', 'app'],
      level: 'debug',
    },
  },
  replaceConsole: false,
});

module.exports = logger;

// Get the timestamp in the format that we want.
function GetLogTimeStamp() {
  let date = new Date();

  let hour = date.getHours();
  hour = (hour < 10 ? '0' : '') + hour;

  let min = date.getMinutes();
  min = (min < 10 ? '0' : '') + min;

  let sec = date.getSeconds();
  sec = (sec < 10 ? '0' : '') + sec;

  let year = date.getFullYear();

  let month = date.getMonth() + 1;
  month = (month < 10 ? '0' : '') + month;

  let day = date.getDate();
  day = (day < 10 ? '0' : '') + day;

  return day + '/' + month + '/' + year + ' ' + hour + ':' + min + ':' + sec;
}