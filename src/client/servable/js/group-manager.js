'use strict';

$(window).on('load', () => {
  // What text should we show in the chatbox?
  const chatboxReminder = 'Select or join a group first.';

  $('#chatbox-reminder').text(chatboxReminder); // Set chatbox reminder text for group view.

  let JSONData = {};

  FetchGroups(); // Initially loaded on groups view, so get the groups.

  $('#chat-type-toggle').change(function(event) {
    if (!event.target.checked) {
      // Groups view.
      $('#options').removeClass('friends'); // Return display of group options to default.

      $('#chatbox-reminder').text(chatboxReminder); // Update the chatbox reminder to show text relevant to groups.

      FetchGroups(); // Fetch groups when changing from friends back to groups view.
    }
  });

  // Now the server selector is populated, we can manage the server states.

  $('#group-join-form').submit((e) => {
    // Let's not refresh. We will request that the server adds us to the group and then open it up.

    e.preventDefault();

    $.ajax({
      type: 'POST',
      url: '/JoinGroup',
      data: $('#group-join-form').serialize(),
      success: (data) => {
        if ($.parseJSON(data).status.toLowerCase() == 'success') {
          FetchGroups(() => {
            let newGroupID = $.parseJSON(data).groupID;
            socket.emit('join', newGroupID);

            // Select the new group and scroll to it.
            $('#' + newGroupID).trigger('click');

            scrollTo(newGroupID, false);
          });

          $('#group-join-code').val('');
          $('#group-join').removeClass('active-button');
          $('#server-container #group-join-form').css('display', 'none');
        } else if ($.parseJSON(data).status.toLowerCase() == 'existing') {
          let newGroupID = $.parseJSON(data).groupID;

          // Select the new group and scroll to it.
          $('#' + newGroupID).trigger('click');

          scrollTo(newGroupID, false);

          $('#group-join-code').val('');
          $('#group-join').removeClass('active-button');
          $('#server-container #group-join-form').css('display', 'none');
          $('#group-join-button').css('background', '');
        } else {
          $('#group-join-code').val('').focus();
          $('#group-join-button').text('Invalid');
          $('#group-join-button').css('background', '#e74c3c');

          // Wait and then automatically clear the error state.
          setTimeout(() => {
            $('#group-join-button').text('Go');
            $('#group-join-button').css('background', '');
          }, 3000);
        }
      },
      failure: () => {
        console.error('Could not process the invite code. Try again later.');
      },
    });
  });

  $('#group-create-form').submit((e) => {
    // We will ask the server to make the group for us and then we will make a new button for it in the selector and open it.

    e.preventDefault();

    $('#group-create-button').css('background', '#8ffd9f').prop('disabled', true);

    $.ajax({
      type: 'POST',
      url: '/CreateGroup',
      data: $('#group-create-form').serialize(),
      success: (data) => {
        JSONData = $.parseJSON(data);

        let newGroupID = $.parseJSON(data)[0].GroupID;
        socket.emit('join', newGroupID);

        FetchGroups(() => {
          // Select the new group and scroll to it.
          $('#' + newGroupID).trigger('click');

          scrollTo(newGroupID, true);
        });

        $('#group-create').removeClass('active-button');

        $('#group-create-container').fadeOut(200); // Take 200ms to fade.
        $('body *:not(.blur-exclude)').css('-webkit-filter', '');

        $('#group-create-form input[name="group"]').val(''); // Clear the name input.
        $('#group-create-form input[name="group"]').removeClass('non-empty'); // Clear the name input.

        $('#group-create-button').css('background', '#6dd5ed').prop('disabled', false);;
      },
      error: () => {
        console.error('Something went wrong. Try again later.');
      },
    });
  });

  // We have opened a new group. Let's change the styling of the buttons and load up the group data and messages.
  $(document).on('click', '.server-button', (event) => {
    if ($(event.target).closest('.server-button').attr('id') != chatInstance.activeServerID && !$(event.target).hasClass('group-leave-button')) {
      // Only do something if we are not clicking the currently active button.
      // If the event target is the text in the button, we actually want the parent button.
      // Match by just the GroupID property.
      let targetIndex = JSONData.findIndex((x) => x.GroupID == $(event.target).closest('button.server-button').attr('id'));

      $('#' + JSONData[targetIndex].GroupID).addClass('active-button');

      chatInstance.groupIsPrivate = false;

      JSONData.forEach((item, i) => {
        if (i != targetIndex) {
          $('#' + item.GroupID).removeClass('active-button');
        }
      });

      chatInstance.setActiveServerID(JSONData[targetIndex].GroupID);

      $('#server-name-display').text(JSONData[targetIndex].GroupName);
      $('#group-options-label').text(JSONData[targetIndex].GroupName);
    }
  });

  $('#tag-set-form').submit((e) => {
    // We will ask the server to update our membership with this custom & personal information.

    e.preventDefault();

    $.ajax({
      type: 'POST',
      url: '/api/SetTag',
      data: $('#tag-set-form').serialize() + '&GroupID=' + chatInstance.activeServerID,
      dataType: 'json',
      success: (data) => {
        $('#tag-set-form').trigger('reset'); // Clear data.
        $('#tag-set-form input[name="tag"]').removeClass('non-empty');

        let tagInfo = $.parseJSON(data);

        if (tagInfo.Tag) {
          $('#' + tagInfo.GroupID).find('p.tag-text').text(tagInfo.Tag); // Update the text label.
        }

        if (tagInfo.Colour) {
          addCustomButtonBackground(tagInfo.GroupID, tagInfo.Colour.replace('#', ''));
        }

        chatInstance.closeTagSetList();
      },
      error: () => {
        console.error('Something went wrong. Try again later.');
      },
    });
  });

  // We have changed whatever was typed into the search bar.
  $('#tags-search').on('input', () => {
    let search = $('#tags-search').val().toLowerCase();

    let activeGroupTags = $('#server-selector button .tag-text');
    let nothingFound = true;

    // Linear search over active groups.
    for (let i = 0; i < activeGroupTags.length; i++) {
      if (activeGroupTags[i].innerHTML.toLowerCase().indexOf(search) > -1) {
        nothingFound = false;
        activeGroupTags[i].parentElement.style.display = 'block';
      } else {
        activeGroupTags[i].parentElement.style.display = 'none';
      }
    }

    if (nothingFound) {
      $('#group-prompt-container').show();
    } else {
      $('#group-prompt-container').hide();
    }
  });

  // What groups are we in? Get them and put them in the server selector so we can pick one.
  function FetchGroups(callback) {
    // Remove the groups we already have, they might have changed.
    $('#server-selector').empty();

    $('#tags-search').val('');

    // Call the server's API to get the user's groups.
    $.ajax({
      type: 'POST',
      url: '/api/GetMyGroups',
      success: (data) => {
        JSONData = $.parseJSON(data);

        if (JSONData.length > 0) {
          $('#group-prompt-container').css('display', 'none');
        } else {
          $('#group-prompt').text('No groups yet. Join or create one.');
          $('#group-prompt-container').css('display', 'block');
        }

        // Then we can populate the container dynamically.
        $.each(JSONData, (i, item) => {
          // Construct HTML from the parsed JSON data. Using .text() escapes any malformed or malicious strings.
          let newGroup = $('<button class="server-button" type="button">')
            .attr('id', item.GroupID)
            .append($('<p class="tag-text" style="position: absolute; bottom: 5px; right: 33px;">').text(item.Tag ? item.Tag : ''))
            .append('<button class="tag-set-button"><img class="tag-image" src="img/TagLo.png" alt="Set Tag" />')
            .append('<button class="group-leave-button">')
            .append(
              $('<span class="server-info-container">')
              .append($('<h1>').text(item.GroupName))
              .append($('<i>').text(item.LatestMessageString ? item.LatestMessageString : 'No messages yet.'))
            );

          socket.emit('join', item.GroupID);

          newGroup.appendTo('#server-selector');

          if (item.CustomColour) {
            addCustomButtonBackground(item.GroupID, item.CustomColour.replace('#', ''));
          }
        });

        if (callback) callback();
      },
      failure: () => {
        console.error('Could not retreive messaging groups. Try again later.');
      },
    });
  }

  // Go to a group in the server selector, if we can't see it at the moment.
  function scrollTo(newGroupID, create) {
    if (create) { // Content of page is different if we used the create form so we need to calculate the desired scroll height differently.
      $('#server-selector').scrollTop(
        $('#' + newGroupID)[0].offsetTop - // The distance from the top of this element that the desired elemenent is.
        $('#server-selector').height() + // Scroll so that the element is at the bottom of the window.
        $('#' + newGroupID).height() // Scroll so the bottom of the button is at the bottom of the server selector.
      );
    } else {
      $('#server-selector').scrollTop(
        $('#' + newGroupID)[0].offsetTop - // The distance from the top of this element that the desired elemenent is.
        $('.toggle-box').height() - // Account for height of the top toggle and buttons.
        $('#server-buttons-container').height() - // Account for join buttons and tag filter input.
        ($('#group-join-form .slide-back').height() + 1) - // The invite form will hide after executing and we need to account for its height.
        $('#server-selector').height() + // Scroll so that the element is at the bottom of the window.
        $('#' + newGroupID).height() // Scroll so the bottom of the button is at the bottom of the server selector.
      );
    }
  }

  function addCustomButtonBackground(group, colour) {
    if (colour.length == 6) {
      // Add a new style element to the DOM for the button so we can show its custom background colour.
      $('<style type="text/css"> [id="' + group + '"].active-button { background: #' + colour + ' !important; } </style>').appendTo('head');

      // Extract background components and convert to decimal. Can handle either case for a/A-f/F.
      let red = parseInt(colour.substring(0, 2), 16);
      let green = parseInt(colour.substring(2, 4), 16);
      let blue = parseInt(colour.substring(4, 6), 16);

      // SOURCE: https://www.w3.org/TR/AERT/#color-contrast [Accessed 18/02/2021]
      let brightness = 0.299 * red + 0.587 * green + 0.114 * blue; // 0 - 255.
      // END SOURCE

      brightness *= 100 / 255; // 0 - 100;

      const brightnessThreshold = 60;

      if (brightness < brightnessThreshold) {
        // Text might not be legible, switch to white.
        $('<style type="text/css"> [id="' + group + '"].active-button * { color: white !important; } [id="' + group + '"].active-button button img { -webkit-filter: invert(100%); filter: invert(100%); } </style>').appendTo('head');
      } else {
        $('<style type="text/css"> [id="' + group + '"].active-button * { color: black !important; } [id="' + group + '"].active-button button img { -webkit-filter: none; filter: none; } </style>').appendTo('head');
      }
    } else {
      console.warn('Malformed colour.');
    }
  }

  $(document).on('click', '.group-leave-button', (event) => {
    // Tell the user which group they might be about to leave.
    $('#leave-name').text('You are about to leave the group: ' + $(event.target).closest('.server-button').find('h1').text());

    $('#leave-group-button').attr('group', $(event.target).closest('.server-button').attr('id'));

    $('#leave-container').fadeIn(200); // Take 200ms to fade.
    $('body *:not(.blur-exclude):not(.blur-exclude *)').css('-webkit-filter', 'blur(3px)'); // Blur background.
  });

  $('#leave-close-button').click(() => {
    closeLeaveForm();
  });

  $('#leave-form').submit((event) => {
    event.preventDefault(); // Don't refresh, we want a smooth experience.

    socket.emit('leave', $('#leave-group-button').attr('group'));

    $('#' + $('#leave-group-button').attr('group')).remove();

    $('#server-name-display').text('Crosstalk');
    $('#chatbox').empty();
    $('#chatbox-reminder').text(chatboxReminder).show();

    if ($('#server-selector button').length == 0) {
      $('#group-prompt').text('No groups yet. Join or create one.');
      $('#group-prompt-container').css('display', 'block');
    }

    $('#pinned-message-container').hide();

    closeLeaveForm();
  });

  function closeLeaveForm() {
    $('#leave-container').fadeOut(200); // Take 200ms to fade.

    chatInstance.unhidePopup();
  }
});