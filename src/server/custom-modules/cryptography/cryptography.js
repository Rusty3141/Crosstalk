'use strict';

const argon2 = require('argon2');

module.exports.Hash = async (password) => {
  try {
    const hash = await argon2.hash(password);
    return hash;
  } catch (err) {
    log.error('Something went wrong while trying to hash this password.');
  }
};

module.exports.CompareHashes = async (hash, password) => {
  // Does this password match this hash?
  return argon2.verify(hash, password);
};