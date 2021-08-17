'use strict';

const nodemailer = require('nodemailer');

require('dotenv').config();

// Set up the email service. This is hidden data.
const transporter = nodemailer.createTransport({
  service: 'gmail',
  auth: {
    user: process.env.NM_USER,
    pass: process.env.NM_PASS
  }
});

module.exports.SendVerification = (email, verificationKey) => {
  const mailOptions = {
    from: process.env.NM_USER,
    to: email,
    subject: 'Verify Your Account',
    html: '<h1>Welcome to Crosstalk</h1><p>Please click the link below to verify your account.</p><a href="' + process.env.EXTERNAL_IP_ADDRESS + '/verify?verificationKey=' + verificationKey + '">' + process.env.EXTERNAL_IP_ADDRESS + '/verify?verificationKey=' + verificationKey + '</a><p><i>If you didn\'t request this, you can just ignore the email.</i></p><b>IMPORTANT NOTE: This project is my Computer Science A Level NEA. Please do not mistake this for an actual commercial service or product. You should not create or use an account if you have stumbled upon this website without being given permission to use or test it. Thank you.</b>'
  };

  transporter.sendMail(mailOptions, (error, info) => {
    if (error) throw error;
  });
};

module.exports.SendRecovery = (email, recoveryKey) => {
  const mailOptions = {
    from: process.env.NM_USER,
    to: email,
    subject: 'Recover Your Account',
    html: '<h1>Crosstalk</h1><p>Please click the link below to recover your account by resetting your password.</p><a href="' + process.env.EXTERNAL_IP_ADDRESS + '/account/change-password?recoveryKey=' + recoveryKey + '">' + process.env.EXTERNAL_IP_ADDRESS + '/account/change-password?recoveryKey=' + recoveryKey + '</a><p><i>If you didn\'t request this, you can just ignore the email.</i></p><b>IMPORTANT NOTE: This project is my Computer Science A Level NEA. Please do not mistake this for an actual commercial service or product. You should not create or use an account if you have stumbled upon this website without being given permission to use or test it. Thank you.</b>'
  };

  transporter.sendMail(mailOptions, (error, info) => {
    if (error) throw error;
  });
};

module.exports.SendChangeNotification = (displayName, email) => {
  const mailOptions = {
    from: process.env.NM_USER,
    to: email,
    subject: 'Notification of Password Change',
    html: '<h1>Crosstalk</h1><p>Dear ' + displayName + ',</p><p>This automated email is to let you know that the password associated with your account was just changed. If this was you, you do not need to take any further action.</p><b>IMPORTANT NOTE: This project is my Computer Science A Level NEA. Please do not mistake this for an actual commercial service or product. You should not create or use an account if you have stumbled upon this website without being given permission to use or test it. Thank you.</b>'
  };

  transporter.sendMail(mailOptions, (error, info) => {
    if (error) throw error;
  });
};