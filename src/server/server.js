'use strict';

const express = require('express');
const app = (module.exports = express());
const defaultPort = process.env.PORT || 80; // Using HTTP.
const bodyParser = require('body-parser');

require('dotenv').config();
const mysql = require('mysql');

const async = require('async');

const pool = mysql.createPool({
  connectionLimit: process.env.DB_CONNECTIONLIMIT,
  host: process.env.DB_HOST,
  user: process.env.DB_USER,
  password: process.env.DB_PASS,
  database: process.env.DB_DATABASE
});

const session = require('express-session');
const MySQLStore = require('express-mysql-session')(session); // Persist user sessions between restarts if the cookie hasn't expired.

const sessionStore = new MySQLStore({
    clearExpired: true,
    createDatabaseTable: true,
    expiration: 172800000, // Expire after 48 hours.
    endConnectionOnClose: true,
    schema: {
      tableName: 'UserSession',
      columnNames: {
        session_id: 'SessionID',
        expires: 'Expires',
        data: 'Data',
      },
    },
  },
  pool
);

let sessionMiddleware = session({
  name: 'crosstalk.user.sid',
  secret: process.env.SESSION_SECRET,
  store: sessionStore,
  resave: false,
  saveUninitialized: false,
  cookie: {
    maxAge: 172800000, // 48 hours.
  },
});

app.use(sessionMiddleware); // Allow sessions to be saved to clients.

const http = require('http');

const fs = require('fs');
const path = require('path');

// CUSTOM MODULES
const account = require('./custom-modules/account');
const cryptography = require('./custom-modules/cryptography');
const log = require('./custom-modules/logging');
const chat = require('./custom-modules/chat');
const db = require('./custom-modules/database');
// END CUSTOM MODULES

app.use(
  bodyParser.urlencoded({
    extended: true,
  })
);
app.use(bodyParser.json());

app.get('(/login(.html)?)?', (request, response) => {
  if (request.session.LoggedIn) {
    response.redirect('/chat'); // Only allow users that are not logged in.
  } else {
    response.sendFile(path.join(__dirname + '/../client/servable/login.html'));
  }
});

app.get('/recover(.html)?', (request, response) => {
  if (request.session.LoggedIn) {
    response.redirect('/chat'); // Only allow users that are not logged in.
  } else {
    response.sendFile(path.join(__dirname + '/../client/servable/recover.html'));
  }
});

app.get('/register(.html)?', (request, response) => {
  if (request.session.LoggedIn) {
    response.redirect('/chat'); // Only allow users that are not logged in.
  } else {
    response.sendFile(path.join(__dirname + '/../client/servable/register.html'));
  }
});

app.get('/verify', (request, response) => {
  if (request.session.LoggedIn || !request.query.verificationKey) {
    // Only allow users that are not logged in and have provided some key for us to check.
    response.redirect('/chat');
  } else {
    pool.getConnection(async (err, connection) => {
      if (err) throw err; // Connection failed.

      let sql = 'UPDATE USER SET Verified = 1, VerificationKey = NULL WHERE VerificationKey = ?'; // Set the user as verified.

      db.query(connection, sql, request.query.verificationKey, (result, fields) => {
        if (result.affectedRows > 0) {
          response.status(201).sendFile(path.join(__dirname + '/../client/hidden/verified.html'));
        } else {
          response.status(422).send(path.join(__dirname + '/../client/hidden/invalid-verification-key.html'));
        }

        connection.release();
      });
    });
  }
});

app.post('/authenticate-login', async (request, response) => {
  account.LogIn(request, response);
});

app.get('/logout', async (request, response) => {
  account.LogOut(request, response);
});

app.post('/JoinGroup', (request, response) => {
  if (!request.session.LoggedIn || !request.body.code || !(request.body.code.length == 12)) {
    response.json(JSON.stringify({
      status: 'invalid'
    }));
  } else {
    pool.getConnection(async (err, connection) => {
      if (err) throw err; // Connection failed.

      let checkValid = `
      SELECT *
      FROM (SELECT \`Group\`.GroupID AS JoinID
        FROM \`Group\`
        WHERE  InviteCode = ?)
        AS FirstDerivedTable
      LEFT JOIN (SELECT GroupMembership.GroupID AS MembershipJoinID
        FROM GroupMembership
        INNER JOIN \`Group\`
          ON GroupMembership.GroupID = \`Group\`.GroupID
        WHERE  UserID = ?
        AND \`Group\`.InviteCode = ?) AS SecondDerivedTable
      ON TRUE;`;

      db.query(connection, checkValid, [request.body.code, request.session.UserID, request.body.code], (firstResult, fields) => {
        if (firstResult[0] && firstResult[0].JoinID && !firstResult[0].MembershipJoinID) {
          let joinGroup = `INSERT INTO GroupMembership (UserID, GroupID) VALUES (?, ?);`; // Add the user to the group.

          db.query(connection, joinGroup, [request.session.UserID, firstResult[0].JoinID], (secondResult, fields) => {
            response.json(
              JSON.stringify({
                status: 'success',
                groupID: firstResult[0].JoinID, // Return the group ID so the client can add it.
              })
            );
          });
        } else if (firstResult[0] && firstResult[0].MembershipJoinID) {
          response.json(
            JSON.stringify({
              status: 'existing',
              groupID: firstResult[0].JoinID, // Return the group ID so the client can jump to it.
            })
          );
        } else {
          response.json(JSON.stringify({
            status: 'invalid'
          }));
        }
      });

      connection.release();
    });
  }
});

app.post('/register-account', async (request, response) => {
  account.Register(request, response);
});

app.post('/recover-account', async (request, response) => {
  account.Recover(request, response);
});

app.get('/account/change-password(.html)?', (request, response) => {
  pool.getConnection(async (err, connection) => {
    if (err) throw err; // Connection failed.

    let sql = 'SELECT COUNT(*) AS NumberOfMatches FROM User WHERE RecoveryKey = ? AND RecoveryKeyExpires > ?;'; // Is the recovery key correct and not-expired?

    if (!(request.query.recoveryKey || request.session.LoggedIn)) {
      // Only allow users that are not logged in and have provided us with a verification key to check.
      response.status(422).sendFile(path.join(__dirname + '/../client/hidden/invalid-recovery-key.html'));
    } else {
      db.query(connection, sql, [request.query.recoveryKey, new Date().getTime()], (result, fields) => {
        if (result[0].NumberOfMatches != 1 && !request.session.LoggedIn) {
          response.status(422).sendFile(path.join(__dirname + '/../client/hidden/invalid-recovery-key.html'));
        } else {
          response.status(200).sendFile(path.join(__dirname + '/../client/servable/account/change-password.html'));
        }
      });
    }

    connection.release();
  });
});

app.post('/account/change-password', async (request, response) => {
  account.ChangePassword(request, response);
});

app.post('/CreateGroup', (request, response) => {
  if (request.body.group.length <= 70) {
    log.info('Creating a new group called ' + request.body.group);

    pool.getConnection(async (err, connection) => {
      if (err) throw err; // Connection failed.

      async.waterfall(
        [
          function GetID(callback) {
            // Get a unique invite code.
            GetNewGroupID(connection, (inviteCode) => {
              callback(null, inviteCode);
            });
          },
          function InsertID(inviteCode, callback) {
            // Create the group.
            let idInsertionQuery = 'INSERT INTO `Group` (GroupName, InviteCode) VALUES (?, ?);';

            db.query(connection, idInsertionQuery, [request.body.group, inviteCode], (result, fields) => {
              callback(null, inviteCode, result);
            });
          },
          function AddMembership(inviteCode, firstResult, callback) {
            // Add the user to the group using the primary key from the record we just inserted.
            let membershipInsertionQuery = 'INSERT INTO GroupMembership (UserID, GroupID, Role) VALUES (?, ?, 2);';

            db.query(connection, membershipInsertionQuery, [request.session.UserID, firstResult.insertId], (result, fields) => {
              callback(null, inviteCode, firstResult, result);
            });
          },
        ],
        (error, inviteCode, firstResult, secondResult) => {
          response.status(200).json(
            JSON.stringify([{
              GroupID: firstResult.insertId,
            }, ])
          );

          connection.release();
        }
      );
    });
  }
});

app.get('/chat(.html)?', (request, response) => {
  if (request.session.LoggedIn) {
    // Only allow access to the chat page for logged-in users.
    response.sendFile(path.join(__dirname + '/../client/servable/chat.html'));
  } else {
    response.redirect('/');
  }
});

app.post('/api/GetMyGroups', (request, response, next) => {
  if (request.session.LoggedIn) {
    let servers = [];

    pool.getConnection(async (err, connection) => {
      if (err) throw err; // Connection failed.

      let sql = `
      SELECT GroupInfo.GroupID,
        GroupInfo.GroupName,
        MessageInfo.LatestMessageString,
        GroupInfo.Tag,
        GroupInfo.CustomColour
      FROM (SELECT \`Group\`.GroupID,
            \`Group\`.GroupName,
            GroupMembership.Tag,
            GroupMembership.CustomColour
            FROM \`Group\`
            INNER JOIN GroupMembership
            ON \`Group\`.GroupID = GroupMembership.GroupID
            WHERE  GroupMembership.UserID = ?) AS GroupInfo
      LEFT JOIN (SELECT Message.MessageString AS LatestMessageString,
                        LatestMessage.GroupID,
                        LatestMessage.Timestamp
                 FROM Message
                 INNER JOIN (SELECT GroupID, MAX(Timestamp) AS Timestamp
                      FROM Message
                      GROUP BY GroupID) AS LatestMessage
                      ON Message.GroupID = LatestMessage.GroupID
                      AND Message.Timestamp = LatestMessage.Timestamp
                      ORDER BY LatestMessage.Timestamp DESC) AS MessageInfo
      ON GroupInfo.GroupID = MessageInfo.GroupID
      ORDER BY MessageInfo.Timestamp DESC, GroupInfo.GroupName;
      `;

      db.query(connection, sql, request.session.UserID, (result, fields) => {
        response.json(JSON.stringify(result));

        connection.release();
      });
    });
  } else {
    next(); // Continue along routes, will serve a 404.
  }
});

app.post('/api/GetMyDisplayName', (request, response, next) => {
  if (request.session.LoggedIn) {
    pool.getConnection(async (err, connection) => {
      if (err) throw err; // Connection failed.

      let sql = 'SELECT DisplayName FROM User WHERE UserID = ?;';

      db.query(connection, sql, request.session.UserID, (result, fields) => {
        response.json(JSON.stringify(result));

        connection.release();
      });
    });
  } else {
    next(); // Continue along routes, will serve a 404.
  }
});

app.post('/api/GetMyUserID', (request, response, next) => {
  if (request.session.LoggedIn) {
    response.json(
      JSON.stringify([{
        UserID: request.session.UserID, // Return the user's ID.
      }, ])
    );
  } else {
    next(); // Continue along routes, will serve a 404.
  }
});

app.post('/api/GetMessages', (request, response, next) => {
  if (request.session.LoggedIn && request.body.GroupID) {
    pool.getConnection(async (err, connection) => {
      if (err) throw err; // Connection failed.

      async.parallel({
          adminStatus: function DetermineRole(callback) {
            let determineRoleQuery = 'SELECT Role FROM GroupMembership WHERE UserID = ? AND GroupID = ?;';

            db.query(connection, determineRoleQuery, [request.session.UserID, request.body.GroupID], (result, fields) => {
              callback(null, result[0].Role);
            });
          },
          messages: function GetMessageData(callback) {
            let getMessageDataQuery = `
            SELECT Message.MessageID,
              User.DisplayName AS AuthorDisplayName,
              Message.MessageString,
              Message.Timestamp,
              Message.AuthorID = ? AS Owned,
              Media.FileName
            FROM Message
            LEFT JOIN Media
              ON Message.MessageID = Media.ReferencesMessageID
            INNER JOIN GroupMembership
              ON Message.GroupID = GroupMembership.GroupID
            INNER JOIN User
              ON User.UserID = Message.AuthorID
            WHERE GroupMembership.UserID = ? AND GroupMembership.GroupID = ?
            ORDER BY Message.Timestamp;`;

            db.query(connection, getMessageDataQuery, [request.session.UserID, request.session.UserID, request.body.GroupID], (result, fields) => {
              callback(null, result);
            });
          },
        },
        (error, results) => {
          if (error) throw error;

          response.json(
            JSON.stringify({
              role: results.adminStatus, // Result of the first function.
              messageData: results.messages, // Result of the second function.
            })
          );

          connection.release();
        }
      );
    });
  } else {
    next(); // Continue along routes, will serve a 404.
  }
});

app.post('/api/GetFriendMessages', (request, response, next) => {
  if (request.session.LoggedIn && request.body.FriendshipID) {
    pool.getConnection(async (err, connection) => {
      if (err) throw err; // Connection failed.

      let getMessageDataQuery = `
      SELECT Message.MessageID,
        User.DisplayName AS AuthorDisplayName,
        Message.MessageString,
        Message.Timestamp,
        Message.AuthorID = ? AS Owned,
        Media.FileName
      FROM Message
      LEFT JOIN Media
        ON Message.MessageID = Media.ReferencesMessageID
      INNER JOIN Friendship
        ON Message.FriendshipID = Friendship.FriendshipID
      INNER JOIN UserFriend
        ON Friendship.FriendshipID = UserFriend.FriendshipID
      INNER JOIN User
        ON User.UserID = Message.AuthorID
      WHERE UserFriend.UserInFriendship = ? AND Friendship.FriendshipID = ?
      ORDER BY Message.Timestamp;`;

      db.query(connection, getMessageDataQuery, [request.session.UserID, request.session.UserID, request.body.FriendshipID], (result, fields) => {
        response.json(JSON.stringify(result));

        connection.release();
      });
    });
  } else {
    next(); // Continue along routes, will serve a 404.
  }
});

app.post('/api/GetPinnedMessage', (request, response, next) => {
  if (request.session.LoggedIn && request.body.GroupID) {
    pool.getConnection(async (err, connection) => {
      if (err) throw err; // Connection failed.

      let sql = `
      SELECT Message.MessageID, User.DisplayName AS AuthorDisplayName,
        Message.MessageString, Message.Timestamp
      FROM Message
      INNER JOIN User
        ON Message.AuthorID = User.UserID
      INNER JOIN \`Group\`
        ON \`Group\`.PinnedMessageID = Message.MessageID
      INNER JOIN GroupMembership
        ON \`Group\`.GroupID = GroupMembership.GroupID
      WHERE  Groupmembership.UserID = ?
        AND \`Group\`.GroupID = ?;`;

      db.query(connection, sql, [request.session.UserID, request.body.GroupID], (result, fields) => {
        response.json(JSON.stringify(result));

        connection.release();
      });
    });
  } else {
    next(); // Continue along routes, will serve a 404.
  }
});

app.post('/api/GetInviteCode', (request, response, next) => {
  if (request.session.LoggedIn && request.body.GroupID) {
    pool.getConnection(async (err, connection) => {
      if (err) throw err; // Connection failed.

      let sql = 'SELECT InviteCode FROM `Group` WHERE GroupID = ?;';

      db.query(connection, sql, request.body.GroupID, (result, fields) => {
        response.json(JSON.stringify(result));

        connection.release();
      });
    });
  } else {
    next(); // Continue along routes, will serve a 404.
  }
});

app.post('/api/GetGroupMemberList', (request, response, next) => {
  if (request.session.LoggedIn && request.body.GroupID) {
    pool.getConnection(async (err, connection) => {
      if (err) throw err; // Connection failed.

      let checkPermissibleRequest = 'SELECT COUNT(*) AS Matches FROM GroupMembership WHERE UserID = ? AND GroupID = ?;';

      db.query(connection, checkPermissibleRequest, [request.session.UserID, request.body.GroupID], (result, fields) => {
        if (result[0].Matches == 1) {
          let getMemberListQuery = `
          SELECT User.UserID,
            User.DisplayName,
            GroupMembership.Role,
            SecondDerivedTable.IsAFriend
          FROM GroupMembership
          INNER JOIN User
            ON User.UserID = GroupMembership.UserID
          LEFT JOIN
            (SELECT UserInFriendship, COUNT(FirstDerivedTable.FriendshipID) > 0 AS IsAFriend
              FROM
                (SELECT FriendshipID FROM UserFriend WHERE UserInFriendship = ?) AS FirstDerivedTable
                INNER JOIN UserFriend
                  ON UserFriend.FriendshipID = FirstDerivedTable.FriendshipID
                WHERE UserInFriendship != ?
              GROUP BY FirstDerivedTable.FriendshipID) AS SecondDerivedTable
            ON User.UserID = SecondDerivedTable.UserInFriendship
          WHERE GroupID = ?
          ORDER BY User.DisplayName;`;

          db.query(connection, getMemberListQuery, [request.session.UserID, request.session.UserID, request.body.GroupID], (result, fields) => {
            result.forEach((element) => (element.IsAFriend = element.UserID == request.session.UserID ? 1 : element.IsAFriend)); // Check each item and make sure the requested users is marked as a friend with themselves.

            response.json(JSON.stringify(result));
            connection.release();
          });
        }
      });
    });
  } else {
    next();
  }
});

app.get('/group-info', (request, response, next) => {
  if (request.session.LoggedIn && request.query.GroupID) {
    let checkMemberQuery = 'SELECT COUNT(*) AS Matches, Role FROM GroupMembership WHERE UserID = ? AND GroupID = ?;';

    pool.getConnection(async (err, connection) => {
      if (err) throw err; // Connection failed.

      db.query(connection, checkMemberQuery, [request.session.UserID, request.query.GroupID], (result, fields) => {
        connection.release();

        if (result[0].Matches == 1 && result[0].Role > 0) {
          response.status(200).sendFile(path.join(__dirname + '/../client/hidden/group-info.html'));
        } else {
          next(); // Continue along routes, will serve a 404.
        }
      });
    });
  } else {
    next(); // Continue along routes, will serve a 404.
  }
});

app.post('/api/GetGroupData', (request, response) => {
  if (request.session.LoggedIn && request.body.GroupID) {
    let checkMemberQuery = 'SELECT COUNT(*) AS Matches, Role FROM GroupMembership WHERE UserID = ? AND GroupID = ?;';

    pool.getConnection(async (err, connection) => {
      if (err) throw err; // Connection failed.

      db.query(connection, checkMemberQuery, [request.session.UserID, request.body.GroupID], (result, fields) => {
        if (result[0].Matches == 1) {
          async.parallel({
              groupName: function GetGroupName(callback) {
                let getGroupNameQuery = 'SELECT GroupName FROM `Group` WHERE GroupID = ?;';
                db.query(connection, getGroupNameQuery, request.body.GroupID, (result, fields) => {
                  callback(null, result);
                });
              },
              members: function GetMemberData(callback) {
                let getMemberListQuery = 'SELECT User.UserID, User.DisplayName, GroupMembership.Role FROM GroupMembership INNER JOIN User ON User.UserID = GroupMembership.UserID WHERE GroupMembership.GroupID = ? ORDER BY User.DisplayName;';
                db.query(connection, getMemberListQuery, request.body.GroupID, (result, fields) => {
                  callback(null, result);
                });
              },
              messages: function GetMessageData(callback) {
                // Get raw message statistics
                let getMessagesStatisticsQuery = 'SELECT COUNT(*) AS MessagesToday, DATE(FROM_UNIXTIME(Timestamp / 1000)) AS MessageBlockDay FROM Message WHERE GroupID = ? GROUP BY MessageBlockDay;';
                db.query(connection, getMessagesStatisticsQuery, request.body.GroupID, (result, fields) => {
                  callback(null, result);
                });
              },
            },
            (error, results) => {
              if (error) throw error;

              let clients = chat.getClients(
                results.members.map((element) => element.UserID),
                request.body.GroupID,
                request.session.UserID
              );

              response.json(
                JSON.stringify({
                  groupName: results.groupName[0].GroupName, // Result of the first function.
                  members: results.members.map((obj, index) => ({
                    ...obj, // Don't affect the database return.
                    // Add the online data from the sockets
                    Online: clients[index], // Reuse the same index because we preserved the order of elements.
                  })), // Result of the second function.
                  messages: results.messages, // Result of the third function.
                  currentServerDate: new Date().setHours(0, 0, 0, 0), // Ignore the time to compare by day.
                })
              );

              connection.release();
            }
          );
        } else {
          response.json(JSON.stringify({
            status: 'invalid'
          }));
        }
      });
    });
  } else {
    response.json(JSON.stringify({
      status: 'invalid'
    }));
  }
});

app.post('/api/GetMyFriends', (request, response, next) => {
  if (request.session.LoggedIn) {
    pool.getConnection(async (err, connection) => {
      if (err) throw err; // Connection failed.

      let getFriendsQuery = `
      SELECT MyFriendships.FriendshipID, User.DisplayName, MyFriendships.UserSentRequest AS SentRequest, Friendship.Status, LatestMessageInFriendship.LatestMessageString
      FROM
        (
          SELECT * FROM UserFriend
          WHERE UserInFriendship = ?) AS MyFriendships
          INNER JOIN UserFriend
            ON MyFriendships.FriendshipID = UserFriend.FriendshipID
          INNER JOIN Friendship
            ON MyFriendships.FriendshipID = Friendship.FriendshipID
          INNER JOIN User
            ON UserFriend.UserInFriendship = User.UserID
          LEFT JOIN
            (
              SELECT Message.MessageString AS LatestMessageString, LatestMessage.FriendshipID, LatestMessage.Timestamp
              FROM Message
              INNER JOIN (SELECT FriendshipID, MAX(Timestamp) AS Timestamp FROM Message GROUP BY FriendshipID) AS LatestMessage
                ON Message.FriendshipID = LatestMessage.FriendshipID AND Message.Timestamp = LatestMessage.Timestamp
            )
            AS LatestMessageInFriendship

            ON MyFriendships.FriendshipID = LatestMessageInFriendship.FriendshipID

        WHERE UserFriend.UserInFriendship != ?
        ORDER BY LatestMessageInFriendship.Timestamp DESC, User.DisplayName;`;

      db.query(connection, getFriendsQuery, [request.session.UserID, request.session.UserID], (result, fields) => {
        response.json(
          JSON.stringify({
            // Status: null or 0 - pending,
            //                 1 - rejected,
            //                 2 - accepted and active.
            sentPending: result.filter((element) => element.SentRequest == true && !(element.Status > 0)), // Just get the elements where we sent the request and are still waiting for a reply.
            notSentPending: result.filter((element) => element.SentRequest != true && !(element.Status > 0)), // Just get the elements were we didn't sent the request and we need to accept or reject it.
            active: result.filter((element) => element.Status == 2), // Just get all of the active friendships.
          })
        );

        connection.release();
      });
    });
  } else {
    next(); // Continue along routes, will serve a 404.
  }
});

app.post('/api/SetTag', (request, response, next) => {
  if (request.session.LoggedIn && request.body.GroupID && request.body.tag && request.body.colour && request.body.tag.length <= 14 && request.body.colour.replace('#', '').length == 6) {
    pool.getConnection(async (err, connection) => {
      if (err) throw err; // Connection failed.

      // We will update the user's group membership.
      let updateTagInfoQuery = 'UPDATE GroupMembership SET Tag = ?, CustomColour = ? WHERE UserID = ? AND GroupID = ?;';

      db.query(connection, updateTagInfoQuery, [request.body.tag, request.body.colour.replace('#', ''), request.session.UserID, request.body.GroupID], (result, fields) => {
        response.status(200).json(JSON.stringify({
          GroupID: request.body.GroupID,
          Tag: request.body.tag,
          Colour: request.body.colour
        }));

        connection.release();
      });
    });
  } else {
    response.status(422).send(); // Continue along routes, will serve a 404.
  }
});

app.get('/user-file', (request, response, next) => {
  if (request.query.fileName) {
    if (fs.existsSync(path.join(__dirname, '../../user_files', request.query.fileName))) {
      // Serve the file from the random name.
      response.status(200).sendFile(path.join(__dirname, '../../user_files', request.query.fileName));
    } else {
      next();
    }
  } else {
    next();
  }
});

app.use(
  express.static('../client/servable', {
    extensions: ['html', 'htm'], // We can leave off the .html from a URL and the correct file will still be served.
  })
);

app.use((request, response) => {
  response.status(404).sendFile(path.join(__dirname + '/../client/hidden/404.html'));
});

const httpServer = http.createServer(app).listen(defaultPort, () => {
  log.info('Node.js HTTP web server started on port ' + httpServer.address().port);
  chat.initialise(io); // Start the socket chat service.
});

let io = require('socket.io')(httpServer);

io.use((socket, next) => {
  // Allow us to access session data directly from any established socket.
  sessionMiddleware(socket.request, socket.request.res, next);
});

function GetNewGroupID(connection, callback) {
  let duplicates = 0;

  do {
    let candidateID = require('crypto').randomBytes(6).toString('hex');

    db.query(connection, 'SELECT COUNT(*) AS NumberOfDuplicates FROM `Group` WHERE InviteCode = ?;', candidateID, (result, fields) => {
      duplicates = result[0].NumberOfDuplicates;

      if (duplicates == 0) {
        return callback(candidateID); // Ensure callback is called after the async activity terminates, to prevent null errors.
      }
    });
  } while (duplicates != 0);
}