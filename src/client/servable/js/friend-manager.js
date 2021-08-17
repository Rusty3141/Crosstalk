'use strict';

$(window).on('load', () => {
  // What text should we show in the chatbox?
  const chatboxReminder = 'Select or add a friend first.';

  // Toggle expansion of the box that has our pending requests in it.
  $('#friend-requests-toggle').click(function(event) {
    $(event.target).closest('#friend-requests-toggle').toggleClass('active-button');
    $(event.target).closest('#friend-requests-toggle').find('img').toggleClass('expanded');
    $('#server-container #friend-requests-container .slide-back').toggleClass('expanded');
  });

  $('#chat-type-toggle').change(function(event) {
    $('#chatbox-reminder').css('display', 'block');

    $('#invite-prompt').hide(); // Users cannot invite to a private message and so we should hide this prompt.

    if (event.target.checked) {
      // Friends view.
      $('#chatbox-reminder').text(chatboxReminder); // Update the chatbox reminder to show text relevant to friends.
      $('#group-prompt').text('No friends yet.'); // Update the selector prompt to be friend-specific.

      $('#options').addClass('friends'); // Ensure the correct border radii are displayed for the visible elements.

      $('#pinned-message-container').hide(); // Don't show old pinned messages.

      friendManagerInstance.setFriends();

      // Send the server some information because we have acted on a friend request.
      $(document).on('click', '.accept-button', function(event) {
        alterFriendState($(event.target).closest('.friend-request-display').attr('id'), true);
      });

      $(document).on('click', '.reject-button', function(event) {
        alterFriendState($(event.target).closest('.friend-request-display').attr('id'), false);
      });

      // We have clicked on a private message. Change button styling and load up the messages.
      $(document).on('click', '.friend-button', (event) => {
        if (($(event.target).closest('.friend-button').attr('id') != chatInstance.activeServerID || !$(event.target).closest('.friend-button').hasClass('active-button')) && !$(event.target).hasClass('unfriend-button')) {
          // Only do something if we are not clicking the currently active button.
          // If the event target is the text in the button, we actually want the parent button.

          let friendshipID = $(event.target).closest('.friend-button').attr('id');

          chatInstance.groupIsPrivate = true;

          chatInstance.setActiveFriendID(friendshipID);

          chatInstance.refreshAdminContentDisplay();

          $('#server-name-display').text(
            'Private Message: ' +
            $('#' + friendshipID)
            .find('h1')
            .text()
          ); // Set the title.
          $('#group-options-label').text(
            $('#' + friendshipID)
            .find('h1')
            .text()
          ); // Set group options title.

          $('#server-selector .friend-button').each(function() {
            $(this).removeClass('active-button');
          });

          $('#' + friendshipID).addClass('active-button');
        }
      });
    }
  });

  function alterFriendState(friendshipID, isAccepting) {
    socket.emit('friend update request', {
      FriendshipID: friendshipID,
      IsAccepting: isAccepting,
    });
  }

  $(document).on('click', '.unfriend-button', (event) => {
    // Tell the user which group they might be about to leave.
    $('#unfriend-name').text($(event.target).closest('.friend-button').find('h1').text());

    $('#unfriend-button').attr('friendship', $(event.target).closest('.friend-button').attr('id'));

    $('#unfriend-container').fadeIn(200); // Take 200ms to fade.
    $('body *:not(.blur-exclude):not(.blur-exclude *)').css('-webkit-filter', 'blur(3px)'); // Blur background.
  });

  $('#unfriend-close-button').click(() => {
    friendManagerInstance.closeUnFriendForm();
  });

  $('#unfriend-form').submit((event) => {
    event.preventDefault(); // Don't refresh, we want a smooth experience.

    socket.emit('unfriend', {
      friendshipID: $('#unfriend-button').attr('friendship'),
      type: $('#unfriend-type-select').val()
    });

    friendManagerInstance.closeUnfriendForm();
  });

  function closeUnfriendForm() {
    $('#unfriend-container').fadeOut(200); // Take 200ms to fade.

    chatInstance.unhidePopup();
  }

  socket.on('removed', (friendshipID) => {
    $('#' + friendshipID).remove();

    $('#server-name-display').text('Crosstalk');
    $('#chatbox').empty();
    $('#chatbox-reminder').text(chatboxReminder).show();

    if ($('#server-selector button').length == 0) {
      $('#group-prompt').text('No friends yet.');
      $('#group-prompt-container').css('display', 'block');
    }
  });
});

let friendManagerInstance = {
  setFriends: function() {
    // Get and display our friends in the right areas.
    if ($('#chat-type-toggle')[0].checked) {
      // Don't do anything unless we have toggled to friends.
      // Call the server's API to get our friends and requests.
      $.ajax({
        type: 'POST',
        url: '/api/GetMyFriends',
        success: (data) => {
          let friends = $.parseJSON(data);

          $('#friend-requests').empty(); // Clear out any old data.
          $('#server-selector').empty(); // Clear out any old data.

          if (friends.sentPending.length == 0 && friends.notSentPending.length == 0) {
            $('#friend-requests').append($('<p id="no-requests-prompt" style="width: 100%; text-align: center; padding: 10px 5px;">').text("Nothing to display."));
          } else {
            $('#no-requests-prompt').remove();
          }

          if (friends.notSentPending.length > 0) {
            $('#alert').css('display', 'inline');
          } else {
            $('#alert').css('display', 'none');
          }

          if (friends.active.length > 0) {
            $('#group-prompt-container').css('display', 'none');
          } else {
            $('#group-prompt-container').css('display', 'block');
          }

          // We can click a button to do something to these requests, so add those buttons into each element that we need to.
          friends.notSentPending.forEach((request) => {
            $('#friend-requests').append(
              $("<div class='friend-request-display'>")
              .attr('id', request.FriendshipID)
              .append($('<p>').text(request.DisplayName))
              .append(
                $('<div class="friend-button-container">')
                .append($('<button class="accept-button">').append($('<img src="img/TickLo.png">')))
                .append($('<button class="reject-button">').append($('<img src="img/CrossLo.png">')))
              )
            );
          });

          friends.sentPending.forEach((request) => {
            $('#friend-requests').append(
              $('<div>')
              .attr('id', request.FriendshipID)
              .append($('<p class="no-buttons">').text(request.DisplayName + ' - awaiting their response'))
            );
          });

          friends.active.forEach((item) => {
            // Construct HTML from the parsed JSON data. Using .text() escapes any malformed or malicious strings.
            let newGroup = $('<button class="friend-button" type="button">')
              .attr('id', item.FriendshipID)
              .append('<button class="unfriend-button">')
              .append(
                $('<span class="friend-info-container">')
                .append($('<h1>').text(item.DisplayName))
                .append($('<i></i>').text(item.LatestMessageString ? item.LatestMessageString : 'No messages yet.'))
              );

            $('#server-selector').append(newGroup);

            socket.emit('join private', item.FriendshipID);
          });
        },
        failure: () => {
          console.error('Could not retreive friends. Try again later.');
        },
      });
    }
  },
  oneOfMyFriendsUpdated: function(data) {
    // The server has told us that another client did something to a request we sent them. We should update its appearance on our end, too.
    if (data.Status == 1) {
      $('#' + data.FriendshipID).remove().ready(() => {
        // After current request dealt with, set visiblity of prompts.

        setFriendPromptVisibilities();
      });
    } else if (data.Status == 2) {
      $('#group-prompt-container').hide(); // Now there are friends to select.

      let name = $('#' + data.FriendshipID).find('p').text();

      socket.emit('join private', data.FriendshipID);

      $('#server-selector').append(
        $('<button class="friend-button" type="button">')
        .attr('id', data.FriendshipID)
        .append('<button class="unfriend-button">')
        .append(
          $('<span class="friend-info-container">')
          .append(
            $('<h1>').text(
              name
            )
          )
          .append($('<i>').text('No messages yet.'))
        )
      ).ready(() => {
        $('#' + data.FriendshipID).remove().ready(() => {
          // After current request dealt with, set visiblity of prompts.

          friendManagerInstance.setFriendPromptVisibilities();
        });
      });
    }
  },
  setFriendPromptVisibilities: function() {
    if ($('#friend-requests *').length == 0) {
      $('#friend-requests').append($('<p id="no-requests-prompt" style="width: 100%; text-align: center; padding: 10px 5px;">').text('Nothing to display.'));
    }

    if ($('#friend-requests .friend-request-display').length == 0) {
      $('#alert').css('display', 'none');
      $('.toggle-box p:last-child').removeClass('bounce');
    }
  }
};