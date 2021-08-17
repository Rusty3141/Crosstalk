'use strict';

const mysql = require('mysql');

// Apply this query to our database. Handle any errors that come up and send back the result and the fields that we edited.
module.exports.query = (connection, query, inserts, callback) => {
  connection.query(mysql.format(query, inserts), (error, result, fields) => {
    if (error) throw error;

    return callback(result, fields);
  });
};