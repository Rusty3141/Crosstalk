'use strict';

$(window).on('load', () => {
  $('.input-field-container input').focusout((event) => {
    // If we lose focus on an input field, don't move the label back over if any user content is present.

    if ($(event.target).val() != '') {
      $(event.target).addClass('non-empty');
    } else {
      $(event.target).removeClass('non-empty');
    }
  });
});