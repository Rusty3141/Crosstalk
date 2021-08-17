'use strict';

const log = require('../logging');
const db = require('../database');
let io;
const ss = require('socket.io-stream');

const fs = require('fs');
const path = require('path');
const fileType = require('file-type');

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

module.exports.initialise = (instance) => {
  io = instance;

  io.sockets.on('connection', (socket) => {
    socket.on('join', (id) => {
      // Check the user is actually permitted to join first.
      pool.getConnection(async (err, connection) => {
        if (err) throw err; // Connection failed.

        db.query(connection, 'SELECT COUNT(*) AS Matches FROM GroupMembership WHERE UserID = ? AND GroupID = ?;', [socket.request.session.UserID, id], (result, fields) => {
          if (result[0].Matches == 1) {
            // Put the user in a new room with all other online users. We will send data in this room if we need something to update in real-time, like messages or permissions.
            socket.join(id.toString());
          }

          connection.release();
        });
      });
    });

    socket.on('join private', (id) => {
      // Check the user is actually permitted to join first.
      pool.getConnection(async (err, connection) => {
        if (err) throw err; // Connection failed.

        // Check the users are friends and add any of them that are online to a room.
        db.query(connection, 'SELECT COUNT(*) AS Matches FROM UserFriend WHERE UserInFriendship = ? AND FriendshipID = ?;', [socket.request.session.UserID, id], (result, fields) => {
          if (result[0].Matches == 1) {
            socket.join('FG' + id.toString());
          }

          connection.release();
        });
      });
    });

    socket.on('chat', (message) => {
      // Check a message was sent (no white-space) and that it wasn't too long.
      if (0 < message.MessageString.trim().length && message.MessageString.trim().length <= 2000) {
        pool.getConnection(async (err, connection) => {
          if (err) throw err; // Connection failed.

          async.parallel({
              // Get the display name of the author to display along with the message text and timestamp.
              getDisplayName: function(callback) {
                let getDisplayNameQuery = 'SELECT DisplayName FROM User WHERE UserID = ?;';

                db.query(connection, getDisplayNameQuery, socket.request.session.UserID, (result, fields) => {
                  callback(null, result[0].DisplayName);
                });
              },
              // Add the message to the database so offline users in the group or friendship can read it later.
              insertMessage: function(callback) {
                let insertGroupMessageQuery = 'INSERT INTO Message (GroupID, AuthorID, MessageString, Timestamp) VALUES (?, ?, ?, ?);';
                let insertPrivateMessageQuery = 'INSERT INTO Message (FriendshipID, AuthorID, MessageString, Timestamp) VALUES (?, ?, ?, ?);';

                // Execute the correct query.
                db.query(
                  connection,
                  message.GroupID ? insertGroupMessageQuery : insertPrivateMessageQuery,
                  [message.GroupID ? message.GroupID : message.FriendshipID, socket.request.session.UserID, message.MessageString, message.Timestamp],
                  (result, fields) => {
                    callback(null, result);
                  }
                );
              },
            },
            (error, results) => {
              if (error) throw error;

              // Set the rest of the message data that we couldn't get from the client.
              message.AuthorID = socket.request.session.UserID;
              message.AuthorDisplayName = results.getDisplayName;
              message.MessageID = results.insertMessage.insertId;

              if (!message.HasFile) {
                // Send the message in the appropriate room. We add 'FG' to the start of a private message to indicate that it is so.
                io.sockets.in(message.GroupID ? message.GroupID.toString() : 'FG' + message.FriendshipID.toString()).emit('message return', message);
              } else {
                // We need to bind the file and its write stream to this message so we won't emit it yet.

                socket.emit('file bind', {
                  bindTo: results.insertMessage.insertId,
                  existingMessage: message
                });
              }

              connection.release();
            }
          );
        });
      }
    });

    ss(socket).on('file stream', async function(stream) {
      let extension, // Initialise variables.
        name,
        size = 0,
        acceptableMimes = ['image/png', 'image/x-png', 'image/jpeg', 'application/pdf'];

      const fileTypeStream = await fileType.stream(stream.bytes), // A slightly adapted file stream where we can extract file extensions/MIMEs directly from the magic bytes.
        maxFileSize = 15; // In MB.

      extension = fileTypeStream.fileType.ext.toLowerCase();

      if (acceptableMimes.includes(fileTypeStream.fileType.mime)) { // Can proceed with upload.
        do {
          name = require('crypto').randomBytes(32).toString('hex');
        } while (fs.existsSync(path.join(__dirname, '../../../../user_files', name + '.' + extension)));
        // Highly unlikely to be any collisions, but we will recalculate a new name if so.

        // Start writing the file as the blocks come in. This is a very efficient process.
        fileTypeStream.pipe(fs.createWriteStream(path.join(__dirname, '../../../../user_files', name + '.' + extension)));

        // A block has arrived. Add its size onto the total and terminate everything if the size goes over our limit.
        fileTypeStream.on('data', (data) => {
          size += data.length;

          if (size / (1024 ** 2) > maxFileSize) {
            fileTypeStream.end((error) => {
              if (error) throw error;

              fs.unlink(path.join(__dirname, '../../../../user_files', name + '.' + extension), (error) => {
                if (error) throw error;

                log.info('File and stream destroyed as it was too large.');
              });
            });
          }
        });

        // Process has terminated, clean up and send the message with the file.
        fileTypeStream.on('end', () => {
          if (fs.existsSync(path.join(__dirname, '../../../../user_files', name + '.' + extension))) { // Check exists, may have deleted.
            pool.getConnection((err, connection) => {
              async.waterfall(
                [
                  function(callback) {
                    let referencesMessage;

                    if (!stream.bind) {
                      // No existing message, create a new one (we didn't type anything but did send a file).
                      let sendFileGroupMessageQuery = 'INSERT INTO Message (GroupID, AuthorID, MessageString, Timestamp) VALUES (?, ?, "A file.", ?);';
                      let sendFilePrivateMessageQuery = 'INSERT INTO Message (FriendshipID, AuthorID, MessageString, Timestamp) VALUES (?, ?, "A file.", ?);';

                      db.query(connection, stream.message.GroupID ? sendFileGroupMessageQuery : sendFilePrivateMessageQuery, [stream.group, socket.request.session.UserID, Date.now()], (result, fields) => {
                        callback(null, result.insertId);
                      });
                    } else {
                      callback(null, stream.bind);
                    }
                  },
                  function(referencesMessage, callback) {
                    // Link the file to its message.
                    let insertMediaQuery = 'INSERT INTO Media (ReferencesMessageID, FileName) VALUES (?, ?);';

                    db.query(connection, insertMediaQuery, [referencesMessage, name + '.' + extension], (result, fields) => {
                      callback(null, referencesMessage);
                    });
                  },
                ],
                (error, referencesMessage) => {
                  if (error) throw error;

                  // Get the user display name.
                  db.query(connection, 'SELECT DisplayName FROM User WHERE UserID = ?;', socket.request.session.UserID, (result, fields) => {
                    connection.release();

                    // Alter the message and then send it out.
                    stream.message.MessageID = referencesMessage;

                    stream.message.AuthorID = socket.request.session.UserID;
                    stream.message.AuthorDisplayName = result[0].DisplayName;

                    stream.message.HasFile = true;
                    stream.message.FilePath = name + '.' + extension;

                    // Send the message in the appropriate room. We add 'FG' to the start of a private message to indicate that it is so.
                    io.sockets.in(stream.message.GroupID ? stream.message.GroupID.toString() : 'FG' + stream.message.FriendshipID.toString()).emit('message return', stream.message);
                  });
                }
              );
            });
          }
        });
      }
    });

    socket.on('role change', (requestData) => {
      pool.getConnection(async (err, connection) => {
        if (err) throw err; // Connection failed.

        async.parallel({
            // Ensure the requesting user is actually in the group and no nefarious request has been constructed.
            checkInGroup: function(callback) {
              let checkInGroupQuery = 'SELECT COUNT(*) AS Matches, Role FROM GroupMembership WHERE UserID = ? AND GroupID = ?;';

              db.query(connection, checkInGroupQuery, [socket.request.session.UserID, requestData.GroupID], (result, fields) => {
                callback(null, result[0].Matches, result[0].Role);
              });
            },
            // Get the current role of the user to be edited. The requesting user can only edit roles below their current one.
            actingOnRole: function(callback) {
              let confirmAuthorityQuery = 'SELECT Role FROM GroupMembership WHERE UserID = ? AND GroupID = ?;';

              db.query(connection, confirmAuthorityQuery, [requestData.UserToChange, requestData.GroupID], (result, fields) => {
                callback(null, result[0].Role ? result[0].Role : 0); // If null, treat as 0 because we haven't been assigned anything.
              });
            },
          },
          (error, results) => {
            if (error) throw error;

            if (results.checkInGroup[0] == 1 && results.checkInGroup[1] > results.actingOnRole && results.checkInGroup[1] >= (requestData.TargetRole == 'admin' ? 1 : null)) {
              // Operation is permitted, update the user's role.
              let updateRoleQuery = 'UPDATE GroupMembership SET Role = ? WHERE UserID = ? AND GroupID = ?;';

              db.query(connection, updateRoleQuery, [requestData.TargetRole == 'admin' ? 1 : null, requestData.UserToChange, requestData.GroupID], (result, fields) => {
                io.sockets.in(requestData.GroupID.toString()).emit('role update', {
                  InGroup: requestData.GroupID,
                  AffectsUser: requestData.UserToChange,
                  NewRole: requestData.TargetRole == 'admin' ? 1 : null
                });
              });
            }

            connection.release();
          }
        );
      });
    });

    socket.on('message delete', (messageID) => {
      if (socket.request.session.LoggedIn && messageID) {
        pool.getConnection(async (err, connection) => {
          if (err) throw err; // Connection failed.

          // We will handle deletion in groups and private messages together. Let's check that the message should be able to be deleted based on the requesting user's permissions or friendships.
          let checkValidQuery = `
          SELECT COUNT(*) AS Matches, GroupID, FriendshipID, FileName
          FROM
            (
              SELECT Message.*, Media.FileName
              FROM Message
              INNER JOIN GroupMembership
                ON Message.GroupID = GroupMembership.GroupID
              LEFT JOIN Media
                ON Message.MessageID = Media.ReferencesMessageID
              WHERE (Message.AuthorID = GroupMembership.UserID OR GroupMembership.Role > 0)
                AND Message.MessageID = ?
                AND GroupMembership.UserID = ?
              UNION SELECT Message.*, Media.FileName
              FROM Message
              INNER JOIN (
                SELECT UserFriend.FriendshipID FROM UserFriend
                INNER JOIN (SELECT FriendshipID FROM UserFriend WHERE UserInFriendship = ?) AS MyFriendships
                  ON UserFriend.FriendshipID = MyFriendships.FriendshipID
                WHERE UserFriend.UserInFriendship != ?) AS SecondDerivedTable
              ON Message.FriendshipID = SecondDerivedTable.FriendshipID
              LEFT JOIN Media
                ON Message.MessageID = Media.ReferencesMessageID
              WHERE MessageID = ?)
            AS AllMessageMatches;`;

          db.query(connection, checkValidQuery, [messageID, socket.request.session.UserID, socket.request.session.UserID, socket.request.session.UserID, messageID], (firstResult, fields) => {
            if (firstResult[0].Matches == 1) {
              async.parallel({
                  secondResult: function(callback) {
                    // Wipe the message from the database.
                    let deleteQuery = 'DELETE FROM Message WHERE MessageID = ?;';

                    db.query(connection, deleteQuery, messageID, (result, fields) => {
                      callback(null, result);
                    });
                  },
                  thirdResult: function(callback) {
                    // Get the latest message in the group at the moment.
                    let getRecentMessageQuery = 'SELECT Message.MessageString AS LatestMessageString FROM Message WHERE Message.GroupID = ? OR Message.FriendshipID = ? ORDER BY Timestamp DESC LIMIT 1;'; // Get the message that is now the most recent in the group.

                    db.query(connection, getRecentMessageQuery, [firstResult[0].GroupID, firstResult[0].FriendshipID], (result, fields) => {
                      callback(null, result);
                    });
                  },
                },
                (error, results) => {
                  if (error) throw error;

                  if (firstResult[0].GroupID) {
                    // This was a group message.

                    io.sockets.in(firstResult[0].GroupID.toString()).emit('binned', {
                      // Send out the information to clients so they can remove the message.
                      group: firstResult[0].GroupID,
                      message: messageID,
                      newLatestMessage: results.thirdResult[0] ? results.thirdResult[0].LatestMessageString : 'No messages yet.',
                    });
                  } else {
                    // This was a private message.

                    io.sockets.in('FG' + firstResult[0].FriendshipID.toString()).emit('binned', {
                      // Send out the information to clients so they can remove the message.
                      group: firstResult[0].FriendshipID,
                      message: messageID,
                      newLatestMessage: results.thirdResult[0] ? results.thirdResult[0].LatestMessageString : 'No messages yet.',
                    });
                  }

                  if (firstResult[0].FileName && fs.existsSync(path.join(__dirname, '../../../../user_files', firstResult[0].FileName))) {
                    fs.unlink(path.join(__dirname, '../../../../user_files', firstResult[0].FileName), (error) => {
                      if (error) throw error;

                      log.info('File bound to message has been permanently deleted.');
                    });
                  }
                }
              );
            }

            connection.release();
          });
        });
      }
    });

    socket.on('message pin', (messageID) => {
      if (socket.request.session.LoggedIn && messageID) {
        pool.getConnection(async (err, connection) => {
          if (err) throw err; // Connection failed.

          // Does the requesting user have the authority to pin the message?
          let checkValidQuery = 'SELECT COUNT(*) AS Matches FROM Message INNER JOIN GroupMembership ON Message.GroupID = GroupMembership.GroupID WHERE GroupMembership.Role > 0 AND Message.MessageID = ? AND GroupMembership.UserID = ?;';

          db.query(connection, checkValidQuery, [messageID, socket.request.session.UserID], (result, fields) => {
            if (result[0].Matches == 1) {
              async.waterfall(
                [
                  function(callback) {
                    // Which group are we working in?
                    let getGroupQuery = 'SELECT GroupID FROM Message WHERE MessageID = ?;';

                    db.query(connection, getGroupQuery, messageID, (result, fields) => {
                      callback(null, result[0].GroupID);
                    });
                  },
                  function(groupIDToUpdate, callback) {
                    // Update the group so offline user's can display the correct pinned message when they log in again.
                    let updateGroupQuery = 'UPDATE `Group` SET PinnedMessageID = ? WHERE GroupID = ?;';

                    db.query(connection, updateGroupQuery, [messageID, groupIDToUpdate], (result, fields) => {
                      callback(null, groupIDToUpdate);
                    });
                  },
                ],
                (error, groupIDToUpdate) => {
                  io.sockets.in(groupIDToUpdate.toString()).emit('pinned', groupIDToUpdate);
                }
              );
            }

            connection.release();
          });
        });
      }
    });

    socket.on('message unpin', (groupID) => {
      if (socket.request.session.LoggedIn && groupID) {
        pool.getConnection(async (err, connection) => {
          if (err) throw err; // Connection failed.

          // Is the requesting user allowed to pin the message?
          let checkValidQuery =
            'SELECT COUNT(*) AS Matches, `Group`.GroupID, `Group`.PinnedMessageID AS MessageID FROM `Group` INNER JOIN GroupMembership ON `Group`.GroupID = GroupMembership.GroupID WHERE GroupMembership.Role > 0 AND `Group`.GroupID = ? AND GroupMembership.UserID = ?;';

          db.query(connection, checkValidQuery, [groupID, socket.request.session.UserID], (result, fields) => {
            if (result[0].Matches == 1) {
              let groupIDToUpdate = result[0].GroupID;
              let unpinnedMessageID = result[0].MessageID;

              // Update the database and send out the unpin message in a socket room so clients can get rid of it in real-time.
              let updateQuery = 'UPDATE `Group` SET PinnedMessageID = NULL WHERE GroupID = ?;';

              db.query(connection, updateQuery, groupIDToUpdate, (result, fields) => {
                io.sockets.in(groupIDToUpdate.toString()).emit('unpinned', {
                  group: groupIDToUpdate,
                  message: unpinnedMessageID
                });
              });
            }

            connection.release();
          });
        });
      }
    });

    socket.on('friend add', (data) => {
      if (socket.request.session.LoggedIn && data) {
        pool.getConnection(async (err, connection) => {
          if (err) throw err; // Connection failed.

          // First we check that the user and their target friend are in a group together, so the friend request is valid.
          let checkCommonGroupQuery = `
          SELECT * FROM
            (SELECT COUNT(*) AS RequestingUserMatches FROM GroupMembership WHERE UserID = ? AND GroupID = ?)
              AS FirstDerivedTable
              LEFT JOIN
            (SELECT COUNT(*) AS TargetingUserMatches FROM GroupMembership WHERE UserID = ? AND GroupID = ?)
              AS SecondDerivedTable
              ON TRUE
              LEFT JOIN
            (SELECT COUNT(*) AS AlreadyFriendMatches FROM
              (SELECT FriendshipID FROM UserFriend WHERE UserInFriendship = ?) AS ThirdDerivedTable
              INNER JOIN UserFriend
                ON ThirdDerivedTable.FriendshipID = UserFriend.FriendshipID
              WHERE UserInFriendship = ?)
              AS FourthDerivedTable
              ON TRUE;`;

          db.query(connection, checkCommonGroupQuery, [socket.request.session.UserID, data.ReferringGroup, data.NewFriend, data.ReferringGroup, socket.request.session.UserID, data.NewFriend], (result, fields) => {
            if (result[0].RequestingUserMatches == 1 && result[0].TargetingUserMatches == 1 && result[0].AlreadyFriendMatches == 0) {
              // Everything is valid and the users aren't already friends. Let's sent the request.

              async.waterfall(
                [
                  function getSenderName(callback) {
                    // Get the name of the user that send this request.
                    let getSenderNameQuery = 'SELECT DisplayName FROM User WHERE UserID = ?;';

                    db.query(connection, getSenderNameQuery, socket.request.session.UserID, (result, fields) => {
                      callback(null, result[0].DisplayName);
                    });
                  },
                  function AddPendingFriendship(name, callback) {
                    // Make a friendship, the status will be NULL for the moment, until the request is acted upon by the other party.
                    let addPendingFriendshipQuery = 'INSERT INTO Friendship (Status) VALUES (DEFAULT);';

                    db.query(connection, addPendingFriendshipQuery, [], (result, fields) => {
                      callback(null, name, result.insertId); // The new FriendshipID.
                    });
                  },
                  function AddUsersToFriendship(name, friendshipID, callback) {
                    async.parallel({
                        // The user that requested to add.
                        insertRequestingUser: function(callback) {
                          let insertRequestingUserQuery = 'INSERT INTO UserFriend VALUES (?, ?, True)';

                          db.query(connection, insertRequestingUserQuery, [friendshipID, socket.request.session.UserID], (fields, result) => {
                            callback(null);
                          });
                        },
                        // The user that the request went to.
                        insertRequestedUser: function(callback) {
                          let insertRequestedUserQuery = 'INSERT INTO UserFriend (FriendshipID, UserInFriendship) VALUES (?, ?)';

                          db.query(connection, insertRequestedUserQuery, [friendshipID, data.NewFriend], (fields, result) => {
                            callback(null);
                          });
                        },
                      },
                      (error, results) => {
                        if (error) throw error;

                        callback(null, name, friendshipID);
                      }
                    );
                  },
                ],
                (error, name, friendshipID) => {
                  if (error) throw error;

                  // Send the data out to the group that the request was made in so we can update the member items.
                  io.sockets.in(data.ReferringGroup.toString()).emit('friend requested', data.NewFriend, name);
                }
              );
            }

            connection.release();
          });
        });
      }
    });

    socket.on('friend update request', (data) => {
      if (socket.request.session.LoggedIn && data) {
        pool.getConnection(async (err, connection) => {
          if (err) throw err; // Connection failed.

          // First we check that there is an existing friend request to update.
          let checkValidQuery = `
          SELECT Friendship.FriendshipID, Friendship.Status, FirstDerivedTable.OtherUserID
          FROM Friendship
            INNER JOIN (SELECT UF1.FriendshipID, UF2.UserInFriendship AS OtherUserID FROM UserFriend UF1
                    INNER JOIN UserFriend UF2
                      ON UF1.FriendshipID = UF2.FriendshipID AND UF1.UserInFriendship != UF2.UserInFriendship
                    WHERE UF1.UserInFriendship = ? AND UF1.FriendshipID = ?)
                    AS FirstDerivedTable
              ON Friendship.FriendshipID = FirstDerivedTable.FriendshipID;`; // Perform a self join on UserFriend.

          db.query(connection, checkValidQuery, [socket.request.session.UserID, data.FriendshipID], (result, fields) => {
            let otherUserID = result[0].OtherUserID;

            if (result.length == 1) {
              // Everything is valid, update the record.

              let updateFriendshipQuery = 'UPDATE Friendship SET Status = ? WHERE FriendshipID = ? AND (Status IS NULL OR Status = 0);'; // Don't do anything if the status is already set.

              db.query(connection, updateFriendshipQuery, [data.IsAccepting ? 2 : 1, result[0].FriendshipID], (result, fields) => {
                let newFriendshipData = {
                  FriendshipID: data.FriendshipID,
                  Status: data.IsAccepting ? 2 : 1, // We can either make the users friends or reject the request.
                };

                // Allow a real-time update.
                io.to(socket.id).emit('friend update', newFriendshipData);

                let otherUserConnectedSocket;

                // We will check through the connected users and see if any of them are the user that the request goes to, and send them the request if they are online.
                io.sockets.sockets.forEach((item) => {
                  if (item.request.session.UserID == otherUserID) {
                    otherUserConnectedSocket = item;
                  }
                });

                if (otherUserConnectedSocket) {
                  io.to(otherUserConnectedSocket.id).emit('friend update', newFriendshipData); // The other user in the friendship.
                }
              });
            }
          });

          connection.release();
        });
      }
    });

    socket.on('leave', (data) => {
      if (socket.request.session.LoggedIn && data) {
        pool.getConnection(async (err, connection) => {
          db.query(connection, 'DELETE FROM GroupMembership WHERE UserID = ? AND GroupID = ?;', [socket.request.session.UserID, data], (result, fields) => {
            log.info(socket.request.session.UserID + ' left ' + data);

            socket.leave(data.toString());

            connection.release();
          });
        });
      }
    });

    socket.on('check pending friends', () => {
      if (socket.request.session.LoggedIn) {
        pool.getConnection(async (err, connection) => {
          let checkIfPendingFriendsQuery = `
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

          db.query(connection, checkIfPendingFriendsQuery, [socket.request.session.UserID, socket.request.session.UserID], (result, fields) => {
            socket.emit('pending friends result', result.filter((element) => element.SentRequest != true && !(element.Status > 0)).length > 0);

            connection.release();
          });
        });
      }
    });

    socket.on('unfriend', (data) => {
      if (socket.request.session.LoggedIn && data) {
        pool.getConnection(async (err, connection) => {
          // First we check that there is an existing friend request to update.
          let checkValidQuery = `
          SELECT Friendship.FriendshipID
          FROM Friendship
            INNER JOIN (SELECT UF1.FriendshipID, UF2.UserInFriendship AS OtherUserID FROM UserFriend UF1
                    INNER JOIN UserFriend UF2
                      ON UF1.FriendshipID = UF2.FriendshipID AND UF1.UserInFriendship != UF2.UserInFriendship
                    WHERE UF1.UserInFriendship = ? AND UF1.FriendshipID = ?)
                    AS FirstDerivedTable
              ON Friendship.FriendshipID = FirstDerivedTable.FriendshipID;`; // Perform a self join on UserFriend.

          db.query(connection, checkValidQuery, [socket.request.session.UserID, data.friendshipID], (result, fields) => {
            if (result.length == 1) {
              // Request valid, proceed with processing it.

              if (data.type == 'block') {
                db.query(connection, 'UPDATE Friendship SET Status = 1 WHERE FriendshipID = ?;', data.friendshipID, (result, fields) => {
                  log.info(socket.request.session.UserID + ' unfriended (blocked) in ' + data.friendshipID);
                });
              } else if (data.type == 'remove') {
                db.query(connection, 'DELETE FROM Friendship WHERE FriendshipID = ?;', data.friendshipID, (result, fields) => {
                  log.info(socket.request.session.UserID + ' unfriended (future requests possible) in ' + data.friendshipID);
                });
              }

              io.sockets.in('FG' + data.friendshipID.toString()).emit('removed', data.friendshipID);

              connection.release();
            }
          });
        });
      }
    });
  });

  // What are the clients that are online in this room/group?
  module.exports.getClients = function getClients(allUserIDs, groupID, requestingUserID) {
    let currentRoom = io.sockets.adapter.rooms.get(groupID);
    if (currentRoom) var clientSocketIDArray = Array.from(currentRoom); // Socket IDs for open connections in the group room.
    let connectedClientIDs = []; // User IDs from connected sockets.

    let result = []; // List of all UserIDs and whether or not they are connected.

    if (clientSocketIDArray) {
      for (let i = 0; i < clientSocketIDArray.length; ++i) {
        connectedClientIDs.push(io.sockets.sockets.get(clientSocketIDArray[i]).request.session.UserID);
      }
    }

    for (let i = 0; i < allUserIDs.length; ++i) {
      let currentIDToCheck = allUserIDs[i];

      result.push(
        currentIDToCheck == requestingUserID ?
        true // Ensure the user that is making the request is always marked as online, as they may not have the chat window open in the background.
        :
        connectedClientIDs.includes(currentIDToCheck)
      );
    }

    return result;
  };
};