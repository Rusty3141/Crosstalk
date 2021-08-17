'use strict';

// Message class to store the chat message and metadata.

class Message {
  constructor(messageID, groupID, friendshipID, authorID, authorDisplayName, messageString, timestamp, hasFile, filePath) {
    this.MessageID = messageID;
    this.GroupID = groupID;
    this.FriendshipID = friendshipID;
    this.AuthorID = authorID;
    this.AuthorDisplayName = authorDisplayName;
    this.MessageString = messageString;
    this.Timestamp = timestamp;
    this.HasFile = hasFile;
    this.FilePath = filePath;
  }
}