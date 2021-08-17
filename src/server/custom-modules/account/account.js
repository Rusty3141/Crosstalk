'use strict';

const log = require('../logging');
const cryptography = require('../cryptography');
const mailer = require('../mailer');
const db = require('../database');

const mysql = require('mysql');
const async = require('async');

require('dotenv').config();

const pool = mysql.createPool({
  connectionLimit: process.env.DB_CONNECTIONLIMIT,
  host: process.env.DB_HOST,
  user: process.env.DB_USER,
  password: process.env.DB_PASS,
  database: process.env.DB_DATABASE
});

module.exports.Register = async (request, response) => {
  let hash = await cryptography.Hash(request.body.password);
  const emailCheckRegex = /^[a-z0-9!#$%&\'*+\/=?^_`{|}~.-]+@[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?(?:\.[a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?)*$/i; // (Regex DB, n.d.)

  // Check that the display name isn't just white-space, the email is valid, the password isn't just white space, the email and email confirmation match and that the password and password confirmation match.
  if (
    !request.body['display-name'].trim() ||
    emailCheckRegex.exec(request.body.email) === null ||
    !request.body.password.trim() ||
    request.body.email != request.body['confirm-email'] ||
    !(await cryptography.CompareHashes(hash, request.body['confirm-password']) ||
      request.body['display-name'].length > 70 ||
      request.body.email.length > 70)
  ) {
    response.send('fail');
  } else {
    pool.getConnection(async (err, connection) => {
      if (err) throw err; // Connection failed.

      // Check if any of the user's desired input is not allowed because it already appears somewhere in the database.
      let getQuery = `
      SELECT *
      FROM   (SELECT Count(*) AS DisplayNameDuplicates
        FROM   User
        WHERE  LOWER(DisplayName) = LOWER(?)) AS FirstDerivedTable
        LEFT JOIN (SELECT Count(*) AS EmailDuplicates
          FROM   User
          WHERE  LOWER(EmailAddress) = LOWER(?)) AS SecondDerivedTable
              ON True;`;

      db.query(connection, getQuery, [request.body['display-name'], request.body.email], (result, fields) => {
        // Send the appropriate response to the client.
        if (result[0].DisplayNameDuplicates > 0) {
          response.send('display');
        } else if (result[0].EmailDuplicates > 0) {
          response.send('email');
        } else if (!isValidPassword(request.body.password)) {
          response.send('password');
        } else {
          // The registration can proceed because the data are all valid.

          GetUserID(connection, (verificationKey) => {
            let sql = 'INSERT INTO User (DisplayName, EmailAddress, PasswordHash, Verified, VerificationKey) VALUES (?, ?, ?, False, ?);';
            let inserts = [request.body['display-name'], request.body.email, hash, verificationKey];

            db.query(connection, sql, inserts, (result, fields) => {
              mailer.SendVerification(request.body.email, verificationKey);
            });
          });

          response.status(201).send('success');
        }
      });

      connection.release();
    });
  }
};

module.exports.Recover = (request, response) => {
  if (!request.body.email) {
    // The user didn't give us an email address to send the verification link to.
    response.status(105).send('Data entered was not valid.');
  } else {
    pool.getConnection(async (err, connection) => {
      if (err) throw err; // Connection failed.

      // Set the recovery key to check again later after we have got a unique one. We will make sure it expires in 24 hours from now (the user can generate another link, if they need to).
      GetRecoveryKey(connection, (recoveryKey) => {
        let sql = 'UPDATE User SET RecoveryKey = ?, RecoveryKeyExpires = ? WHERE EmailAddress = ?;';

        let expiryDate = new Date();
        expiryDate.setHours(expiryDate.getHours() + 24);

        db.query(connection, sql, [recoveryKey, expiryDate.valueOf(), request.body.email], (result, fields) => {
          if (result.affectedRows) {
            mailer.SendRecovery(request.body.email, recoveryKey);
          }
        });

        connection.release();
      });
    });

    response.status(201).send('success');
  }
};

module.exports.ChangePassword = async (request, response) => {
  let newHash = await cryptography.Hash(request.body.formData.newPassword);

  if (!(await cryptography.CompareHashes(newHash, request.body.formData.confirmNewPassword))) {
    response.json(
      JSON.stringify({
        outcome: 'mismatch', // The password and confirmation field did not match.
      })
    );
  } else if (!request.body.formData.newPassword.trim() || !isValidPassword(request.body.formData.newPassword)) {
    response.json(
      JSON.stringify({
        outcome: 'password', // The password isn't valid.
      })
    );
  } else {
    pool.getConnection(async (err, connection) => {
      if (err) throw err; // Connection failed.

      // Check if the user is logged in or has given a valid recovery key.
      let checkValidQuery = 'SELECT COUNT(*) AS NumberOfMatches FROM User WHERE (RecoveryKey = ? AND RecoveryKeyExpires > ?) OR UserID = ?;';

      db.query(connection, checkValidQuery, [request.body.recoveryKey, new Date().getTime(), request.session.UserID], (result, fields) => {
        if (result[0].NumberOfMatches != 1) {
          response.status(422).sendFile(path.join(__dirname + '/../client/hidden/invalid-recovery-key.html'));
        } else {
          async.parallel({
              // Get the display name and email to send the user a nicely-formatted email to notify them that their password was changed.
              nameAndEmail: function(callback) {
                let getDisplayNameAndEmailQuery = 'SELECT DisplayName, EmailAddress FROM User WHERE RecoveryKey = ? OR UserID = ?';

                db.query(connection, getDisplayNameAndEmailQuery, [request.body.recoveryKey, request.session.UserID], (result, fields) => {
                  callback(null, result);
                });
              },
              // Change the password hash so the user can log in with their new one.
              updatePassword: function(callback) {
                let updatePasswordQuery = 'UPDATE User SET PasswordHash = ?, RecoveryKey = NULL, RecoveryKeyExpires = NULL WHERE RecoveryKey = ? OR UserID = ?;';

                db.query(connection, updatePasswordQuery, [newHash, request.body.recoveryKey, request.session.UserID], (result, fields) => {
                  callback(null, result);
                });
              },
            },
            (error, results) => {
              if (error) throw error;

              // Send the change notification email.
              mailer.SendChangeNotification(results.nameAndEmail[0].DisplayName, results.nameAndEmail[0].EmailAddress);

              // Let the client know that the password has been changed successfully.
              response.status(200).json(
                JSON.stringify({
                  outcome: 'change',
                })
              );
            }
          );
        }

        connection.release();
      });
    });
  }
};

module.exports.LogIn = async (request, response) => {
  pool.getConnection(async (err, connection) => {
    if (err) throw err; // Connection failed.

    // Get the user from the database so we can authenticate them.
    var sql = 'SELECT * FROM User WHERE EmailAddress = ?';

    db.query(connection, sql, request.body.email, async (result, fields) => {
      if (result.length > 0 && (await cryptography.CompareHashes(result[0].PasswordHash, request.body.password)) && result[0].Verified) {
        // Authenticated.

        // Set the necessary session information so we can get it again elsewhere.
        request.session.LoggedIn = true;
        request.session.UserID = result[0].UserID;
        request.session.DisplayName = result[0].DisplayName;
        request.session.save((err) => {
          // Let's wait until the session is all set before redirecting.
          // We need to save the session to the database store, this might take a bit of time.
          // If we redirect straight away then we might get sent back here by the chat page if the session isn't initialised.

          response.status(201).send('success');
        });
      } else if (response[0] && !response[0].Verified) {
        response.send('unverified');
      } else {
        // Incorrect credentials.
        response.send('fail');
      }

      connection.release();
    });
  });
};

module.exports.LogOut = async (request, response) => {
  // Delete all of the session data from the store and then send the client back to the main page.
  request.session.destroy((err) => {
    response.redirect('/');
  });
};

function isValidPassword(password) {
  let lengthCondition = password.length >= 8;
  let capsCondition = password.match(/^(?=.*[A-Z])/g); // Contains an upper case character.
  let lowerCondition = password.match(/^(?=.*[a-z])/g); // Contains a lower case character.
  let digitCondition = password.match(/^(?=.*[0-9])/g); // Contains a digit.
  let symbolCondition = password.match(/^(?=.*[\\\|`¬¦\!"£\$%\^&\*\(\)\-\=_\+\[\]\{\};'#\:@~,\.\/\<\>\?])/g); // Contains a special symbol.
  let repeatsCondition = !password.match(/^(?=.*([A-Za-z0-9])\1{2})/g); // Allow a maximum of two repeating characters in a row; disallows things like 'Paaaaaaasssword1!'. This matches iff there are 3 or more repeats, so "not" it.

  return lengthCondition && capsCondition && lowerCondition && digitCondition && symbolCondition && repeatsCondition; // Must meet all conditions.
}

function GetRecoveryKey(connection, callback) {
  // Generate a recovery key of 16 bytes and regenerate it if it already exists (this is very unlikely).

  let duplicates = 0;

  do {
    let recoveryKey = require('crypto').randomBytes(16).toString('hex');

    db.query(connection, 'SELECT COUNT(*) AS NumberOfDuplicates FROM User WHERE RecoveryKey = ?;', recoveryKey, (result, fields) => {
      duplicates = result[0].NumberOfDuplicates;

      if (duplicates == 0) {
        return callback(recoveryKey); // Ensure callback is called after the async activity terminates, to prevent null errors.
      }
    });
  } while (duplicates != 0);
}

function GetUserID(connection, callback) {
  // Generate a user verification key of 16 bytes and regenerate it if it already exists (this is very unlikely).

  let duplicates = 0;
  let candidateID = require('crypto').randomBytes(16).toString('hex');

  do {
    db.query(connection, 'SELECT COUNT(*) AS NumberOfDuplicates FROM User WHERE VerificationKey = ?;', candidateID, (result, fields) => {
      duplicates = result[0].NumberOfDuplicates;

      if (duplicates == 0) {
        return callback(candidateID); // Ensure callback is called after the async activity terminates, to prevent null errors.
      }
    });
  } while (duplicates != 0);
}