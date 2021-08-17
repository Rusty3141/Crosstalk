'use strict';

$(window).on('load', () => {
  // Handle data submission and display an appropriate message once the server gets back to us.
  $('#register-form').submit((e) => {
    e.preventDefault();

    $.ajax({
      type: 'POST',
      url: '/register-account',
      data: $('#register-form').serialize(),
      success: (data) => {
        switch (data) {
          case 'success':
            $('#result').text('A link has been sent to your email. Click it to verify your account.');

            $('#register-form')[0].reset();
            $('#register-form :focus').blur();
            $('#register-form input.non-empty').removeClass('non-empty');

            break;
          case 'display':
            $('#result').text('An account already exists with that display name.');
            $('input[name="display-name"]').val('').focus();

            break;
          case 'email':
            $('#result').text('An account already exists under that email address.');
            $('input[name="email"]').val('').focus();
            $('input[name="confirm-email"]').removeClass('non-empty').val('');

            break;
          case 'password':
            $('#result').text('Password does not meet the security requirements. It needs to be at least 8 characters long and contain an upper case letter, digit and a symbol. It must also not contain more than 2 repeated characters next to each other, like in "passwooord".');
            $('input[name="password"]').val('').focus();
            $('input[name="confirm-password"]').removeClass('non-empty').val('');

            break;
          default:
            $('#result').text('Data entered was not valid. Check that the confirmation fields match the normal fields.');
        }
      },
      error: () => {
        $('#result').text('Something went wrong. Try again later.');
      },
    });
  });

  $('#login-form').submit((e) => {
    e.preventDefault();

    $.ajax({
      type: 'POST',
      url: '/authenticate-login',
      data: $('#login-form').serialize(),
      success: (data) => {
        if (data == 'fail') {
          $('#result').text('Invalid credentials.');
          $('input[name="email"]').val('').focus();
          $('input[name="password"]').val('').removeClass('non-empty');
        } else if (data == 'unverified') {
          $('#result').text('You need to verify your account first!');
        } else {
          window.location.replace('/chat');
        }
      },
      error: () => {
        $('#result').text('Something went wrong. Try again later.');
      },
    });
  });

  $('#recover-form').submit((e) => {
    e.preventDefault();

    $.ajax({
      type: 'POST',
      url: '/recover-account',
      data: $('#recover-form').serialize(),
      success: (data) => {
        if (data == 'success') {
          $('#result').text('A link has been sent to that email, if its account exists. Click it to reset your password.');
        }
      },
      error: () => {
        $('#result').text('Something went wrong. Try again later.');
      },
    });
  });
});