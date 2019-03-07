const uuidv4 = require('uuid/v4');
const uid2 = require('uid2');

//////////////////////////////////////
/// Returns UUID for a Request
//////////////////////////////////////
module.exports.getRequestUUID = () => {
  return uid2(36);
}

//////////////////////////////////////////////////
/// Helper function to check if field has data
/////////////////////////////////////////////////
module.exports.fieldHasData = (field) => {
  return field !== null && field !== undefined && field !== '';
}

//////////////////////////////////////////////////
/// Helper function to check if has minimun length
//////////////////////////////////////////////////
module.exports.minLength = (field, minlength) => {
  return module.exports.fieldHasData(field) && field.length < minlength;
}

////////////////////////////////////
/// Gets a unique identifier
////////////////////////////////////
module.exports.getUUID = () => {
  return uuidv4();
}

//////////////////////////////////////////////////////
/// Gets a random identifier given it's length
//////////////////////////////////////////////////////
module.exports.getRandomIdentifier = (length = 200) => {
  return uid2(length);
}

///////////////////////////////////////////////////////
/// Gets a random identifier given it's length
///////////////////////////////////////////////////////
module.exports.getEmailConfirmationToken = () => {
  return uid2(500);
}

///////////////////////////////////////////////////////////////
/// Gets a random digit number given minimun and maximum
//////////////////////////////////////////////////////////////
module.exports.getRandomDigits = (min, max) => {
  var num = Math.floor(Math.random() * (max - min + 1)) + min;
  return num;
}




// Nodejs encryption with CTR
const crypto = require('crypto'), algorithm = 'aes-256-ctr';

module.exports.encrypt = function encrypt({ text, password }){
  var cipher = crypto.createCipher(algorithm,password)
  var crypted = cipher.update(text,'utf8','hex')
  crypted += cipher.final('hex');
  return crypted;
}
 
module.exports.decrypt = function decrypt({ text, password }){
  var decipher = crypto.createDecipher(algorithm,password)
  var dec = decipher.update(text,'hex','utf8')
  dec += decipher.final('utf8');
  return dec;
}
