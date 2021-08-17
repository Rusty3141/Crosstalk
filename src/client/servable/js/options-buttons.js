'use strict';

$(window).on('load', () => {
  $(document).click((event) => {
    // Handle click events. We should hide the nav container if it's visible and we click outside of it.

    // We hide and show various elements depending on the context and ensure that the styling is appropriate on the remaining ones.

    if (
      $('#profile-options-nav-container').css('visibility') == 'visible' &&
      !$(event.target).is('#profile-options-nav-container') &&
      !$(event.target).is('#profile-options-nav-container *') &&
      !($(event.target).is('#profile-options-button') || $(event.target).is('#profile-options-button *') || $(event.target).is('#options-button') || $(event.target).is('#options-button *'))
    ) {
      toggleVisiblity('#profile-options-nav-container');
    } else if (
      $('#options-nav-container').css('visibility') == 'visible' &&
      !$(event.target).is('#options-nav-container') &&
      !$(event.target).is('#options-nav-container *') &&
      !($(event.target).is('#profile-options-button') || $(event.target).is('#profile-options-button *') || $(event.target).is('#options-button') || $(event.target).is('#options-button *'))
    ) {
      toggleVisiblity('#options-nav-container');

      hideInviteCode();
    } else if ($(event.target).is('#profile-options-button') || $(event.target).is('#profile-options-button *')) {
      toggleVisiblity('#profile-options-nav-container');
    } else if ($(event.target).is('#options-button') || $(event.target).is('#options-button *')) {
      if ($('#options-nav-container').css('visibility') == 'hidden' && !$('#options').hasClass('friends')) getInviteCode();

      toggleVisiblity('#options-nav-container');
    } else if ($(event.target).is('#show-invite-code')) {
      if ($('#invite-code-display').css('display') == 'none') {
        $('#invite-code-display').css('display', 'flex');
        if (!(role > 0)) {
          $('#show-invite-code').closest('li').removeClass('round-bottom');
          $('#invite-code-display').addClass('round-bottom');
        }
      } else {
        $('#invite-code-display').css('display', 'none');
        if (!(role > 0)) {
          $('#invite-code-display').removeClass('round-bottom');
          $('#show-invite-code').closest('li').addClass('round-bottom');
        }
      }
    } else if ($(event.target).is('#invite-code-copy')) {
      copyInviteCode();

      $('#invite-code-display').css('background', '#d7fadc');
      $('#invite-code-copy').css('background', '#8ffd9f');
      $('#invite-code-copy').text('Copied');

      // Wait and then automatically clear the copied state.
      setTimeout(() => {
        $('#invite-code-display').css('background', '');
        $('#invite-code-copy').css('background', '');
        $('#invite-code-copy').text('Copy');
      }, 4000);
    }
  });

  // SOURCE:https://codepen.io/shaikmaqsood/pen/XmydxJ [Accessed 04/01/2021]
  function copyInviteCode() {
    // Create a temporary element so we can copy the code, then delete it again.

    let $temp = $('<input>');
    $('body').append($temp);
    $temp.val($('#invite-code-display p').text()).select();
    document.execCommand('copy');
    $temp.remove();
  }
  // END SOURCE

  function getInviteCode() {
    // Request our code from the server so that we can give it to other users to join.

    $.ajax({
      type: 'POST',
      url: '/api/GetInviteCode',
      data: {
        GroupID: chatInstance.activeServerID,
      },
      success: (data) => {
        $('#invite-code').text($.parseJSON(data)[0].InviteCode);
      },
      failure: () => {
        $('#invite-code').text('Error. Try again later.');
      },
    });
  }
});

function toggleVisiblity(name) {
  // If I'm visible, hide me.
  // If I need to be shown, show me, and if the other nav item is visible then hide it too.

  if ($(name).css('visibility') == 'visible') {
    $(name).css('visibility', 'hidden');

    if (name == '#options-nav-container') {
      hideInviteCode();
      $('#search').val('').trigger('input');
      $('#message-type-toggle').prop('checked', false).trigger('change');
    }
  } else {
    let otherContainer = name == '#profile-options-nav-container' ? '#options-nav-container' : '#profile-options-nav-container';

    if ($(otherContainer).css('visibility') == 'visible') {
      $(otherContainer).css('visibility', 'hidden');
    }

    $(name).css('visibility', 'visible');
  }
}

function hideInviteCode() {
  $('#invite-code-display').css('background', '');
  $('#invite-code-copy').css('background', '');
  $('#invite-code-copy').text('Copy');

  $('#invite-code-display').css('display', 'none');
  $('#invite-code-display').removeClass('round-bottom');
  $('#invite-code').text('');
}