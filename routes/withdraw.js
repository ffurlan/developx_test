var router = require('express-promise-router')();
const send = require('../modules/developx_httphelper');

var cashier = require('../modules/developx_methods');

/// Check current
router.post('/', (req, res, next) => {
  let { value } = req.body;
  if (!value){
      send.error400(res, "[Empty Set]");
      return next();
  }   

  if (value <= 0){
    send.error400(res, "InvalidArgumentException");
    return next();
  }

  let notes = cashier.withdraw.calculateNotes(value);

  if (notes.length === 0){
    send.error400(res, "NoteUnavailableException");
    return next();
  }
  
  send.status200(res, notes);
  return next();
});

module.exports = router;
