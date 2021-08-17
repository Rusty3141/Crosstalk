'use strict';

$(window).on('load', () => {
  // Get the GroupID.
  let searchParams = new URLSearchParams(window.location.search);

  // We should proceed to check with the server because the request might be valid.
  if (searchParams.has('GroupID')) {
    // Get the group data.
    $.ajax({
      type: 'POST',
      url: '/api/GetGroupData',
      data: {
        GroupID: searchParams.get('GroupID'),
      },
      success: (data) => {
        let stats = $.parseJSON(data);

        $('#data-container > .title').text(stats.groupName);

        $('#users-readout').text(stats.members.length);
        $('#online-users-readout').text(stats.members.filter((element) => element.Online).length);
        $('#messages-sent-readout').text(countMessages(stats.messages));

        // Let's check with the server and see how many messages have been sent recently.
        let sevenDayActivity = getPrevious7DayMessages(stats.messages, stats.currentServerDate);

        let messageChartContext = $('#messages-over-time-chart')[0].getContext('2d');

        // Here we just set up the data to send Chart.js so it can display our graph nicely.
        Chart.defaults.global.defaultFontFamily = "'Work Sans', sans-serif";
        let messageChart = new Chart(messageChartContext, {
          type: 'line',
          data: {
            labels: sevenDayActivity.map((element) => element.date), // Extract just the dates.
            datasets: [{
              label: 'Number of Messages',
              data: sevenDayActivity.map((element) => element.messagesToday), // Extract just the number of messages on each day.
              backgroundColor: '#ff6384',
              borderColor: '#ff6384',
              borderWidth: 1,
              fill: false,
            }, ],
          },
          options: {
            responsive: true,
            maintainAspectRatio: false,
            title: {
              display: true,
              text: 'Message Activity Over the Previous 7 Days',
              fontSize: 20,
              fontStyle: 'normal',
            },
            tooltips: {
              mode: 'index',
              intersect: false,
              titleFontStyle: 'normal',
            },
            hover: {
              mode: 'nearest',
              intersect: true,
            },
            scales: {
              xAxes: [{
                display: true,
                ticks: {
                  fontSize: 14,
                },
                scaleLabel: {
                  display: true,
                  labelString: 'Date',
                  fontSize: 14,
                },
              }, ],
              yAxes: [{
                display: true,
                ticks: {
                  beginAtZero: true,
                  fontSize: 14,
                  precision: 0, // Don't show any decimal points on the y-axis.
                },
                scaleLabel: {
                  display: true,
                  labelString: 'Number of Messages',
                  fontSize: 14,
                },
              }, ],
            },
            legend: {
              display: false,
            },
            animation: {
              duration: 0,
            },
          },
        });
      },
      failure: () => {
        console.error('Could not group data. Try again later.');
      },
    });
  }

  // The server has given us a list of all the messages sent per day since group creation. Let's add them all up to see how many were sent ever.
  function countMessages(messages) {
    let result = 0;

    for (let i = 0; i < messages.length; ++i) {
      result += messages[i].MessagesToday;
    }

    return result;
  }

  // We have got the number of messages sent per day since the group was created. Let's ignore the ones that weren't in the previous 7-day window and get a complete list of the previous 7-days, because the server won't send us data that was just 0 messages.
  function getPrevious7DayMessages(messages, today) {
    let result = [];

    let providedMessagesToday = messages.map((element) => element.MessagesToday); // Extract just the number of messages per day that we are given by the server.
    let providedTimes = messages.map((element) => new Date(element.MessageBlockDay).getTime()); // Extract just the dates we are given by the server.

    for (let daysAgo = 6; daysAgo >= 0; --daysAgo) {
      // Go in this order so we get today on the right of the graph.
      let newDay = new Date(today);
      newDay.setDate(newDay.getDate() - daysAgo); // Get the date for daysAgo.

      result.push({
        date: newDay.toLocaleDateString(),
        messagesToday: providedTimes.includes(newDay.getTime()) ? providedMessagesToday[providedTimes.indexOf(newDay.getTime())] : 0, // We must compare by the numerical value of getTime to get a match as dates are compared by reference, not value.
      });
    }

    return result;
  }
});