// To generate a session secret. Serves no other purpose.
console.log(require('crypto').randomBytes(512).toString('hex'));