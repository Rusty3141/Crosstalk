'use strict';

$(window).on('load', () => {
  // Handle data submission and display an appropriate message once the server gets back to us.
  $('#password-reset-form').submit((e) => {
    e.preventDefault();

    $.ajax({
      type: 'POST',
      url: '/account/change-password',
      data: JSON.stringify({
        recoveryKey: new URLSearchParams(window.location.search).get('recoveryKey'),
        formData: {
          newPassword: $('#password-reset-form input[name="new-password"]')[0].value,
          confirmNewPassword: $('#password-reset-form input[name="confirm-new-password"]')[0].value,
        },
      }),
      contentType: 'application/json',
      success: (data) => {
        let JSONData = $.parseJSON(data);

        if (JSONData.outcome == 'mismatch') {
          // Password did not match its confirmation field.
          $('#result').text('Passwords did not match.');

          $('input[name="new-password"]').val('').focus();
          $('input[name="confirm-new-password"]').removeClass('non-empty').val('');
        } else if (JSONData.outcome == 'password') {
          $('#result').text('Password does not meet the security requirements. It needs to be at least 8 characters long and contain an upper case letter, digit and a symbol. It must also not contain more than 2 repeated characters next to each other, like in "passwooord".');

          $('input[name="new-password"]').val('').focus();
          $('input[name="confirm-new-password"]').removeClass('non-empty').val('');
        } else if (JSONData.outcome == 'invalid') {
          // The recovery key was not valid.
          $('#result').text('Invalid recovery key; it may have expired. Redirecting...');

          // Wait and then automatically redirect to the recovery page.
          setTimeout(() => {
            window.location.href = '/recover';
          }, 3000);
        } else if (JSONData.outcome == 'change') {
          // Password changed.
          $('#result').text('Password changed. Redirecting...');

          // Wait and then automatically redirect to the login page.
          setTimeout(() => {
            window.location.href = '/login';
          }, 3000);
        }
      },
      error: () => {
        $('#result').text('Something went wrong. Try again later.');
      },
    });
  });
});