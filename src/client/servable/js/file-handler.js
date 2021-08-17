'use strict';

$(window).on('load', () => {
  const fileSizeLimit = 15; // Maximum file size.

  $('#file-input').on('change', function() {
    let fileName = $('#file-input')[0].files.length > 0 ? $('#file-input')[0].files[0].name : null,
      extension,
      name,
      fileSize = $('#file-input')[0].files.length > 0 ? ($('#file-input')[0].files[0].size / (1024 ** 2)).toFixed(1) : null; // In MB at a maximum of 1dp.

    if (fileSize <= fileSizeLimit) {
      if (fileName) {
        extension = '.' + fileName.split('.').pop().toLowerCase();
        name = fileName.replace(new RegExp(extension + '$', 'i'), ''); // Strip extension from the end. Ignore the case.
      }

      // Display the name and remove it if the file doesn't exist.
      $('#file-chosen .name').text(name ? name : '');
      // Display the extension and remove it if the file doesn't exist.
      $('#file-chosen .extension').text(extension ? extension : '');
      // We do these separately so we can display an ellipsis if the file name is too long, but always keep the extension.

      // Set classes and control display.
      if (fileName) {
        $('#file-input').addClass('has-file');

        $('#remove-file-button').css('display', 'inline-block');

        $('#message').focus();
      } else {
        $('#file-input').removeClass('has-file');

        $('#remove-file-button').css('display', 'none');
      }
    } else {
      // Display error and then clear the input (and thus error).
      $('#file-chosen .name').text('Too big! Maximum is 15MB');

      setTimeout(() => {
        $('#file-input').val('').trigger('change');
      }, 5000);
    }
  });

  // Clear the input (and thus error).
  $('#remove-file-button').click(() => {
    $('#file-input').val('').trigger('change');
  });
});

let fileHandlerInstance = {
  HandleUpload: function(bindID, existingMessage, file) {
    let stream = ss.createStream();

    // Send the server all of the information that it needs through the stream. We create a new message if the message box was blank.
    ss(socket).emit('file stream', {
      group: chatInstance.activeServerID,
      bind: bindID,
      bytes: stream,
      message: existingMessage ? existingMessage : new Message(null, !chatInstance.groupIsPrivate ? chatInstance.activeServerID : null, chatInstance.groupIsPrivate ? chatInstance.activeServerID : null, null, null, 'A file.', Date.now(), true, null)
    });

    // Start piping the file to the server. This shouldn't take more than about 5 seconds.
    let monitor = ss.createBlobReadStream(file);
    monitor.pipe(stream);

    let progress = 0;

    monitor.on('data', (chunk) => {
      progress += chunk.length;

      console.log('Uploaded ' + ((progress / file.size) * 100).toFixed(1) + '%');
    });

    $('#file-input').val('').trigger('change'); // Clear the file input.
  }
};