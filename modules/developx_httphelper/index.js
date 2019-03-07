////////////////////////////////////////////////////
/// [200] STATUS OK
////////////////////////////////////////////////////
module.exports.status200 = (res, data = null, success = true) => {
  res.statusCode = 200;
  var response = {
    success: success
  };

  if(data != null) {
    response.data = data;
  }
  res.send(response);
}

//////////////////////////////////////////////////////
/// [400] Application Error
//////////////////////////////////////////////////////
module.exports.error400 = (res, errorCode, stack) => {
  res.statusCode = 400;
  let result = {
    success: false,
    message: 'An error occurred on the application while processing your request.',
    error_code: errorCode,
    stack: stack
  };
  res.send(result);
}

///////////////////////////////////////////////
/// [401] Access Denied
///////////////////////////////////////////////
module.exports.error401 = (res, code) => {
  res.statusCode = 401;
  res.send({success: false, data: { code: code }});
  res.end();
}

//////////////////////////////////////////////
/// [404] NOT FOUND (CEMBRANELLI STYLE)
//////////////////////////////////////////////
module.exports.error404 = (res, entity = null) => {
  res.statusCode = 404;
  var response = {
    success: false,
    message: 'NOT FOUND',
  }
  if(entity) {
    response.entity = entity;
  }

  res.send(response);
}

////////////////////////////////////////
/// [500] Server Error
////////////////////////////////////////
module.exports.error500 = (res, message, err) => {
  res.statusCode = 500;

  let response_server_error = {
    success: false,
    message: 'An error occurred on the server: ' + message ? message : '',
    stack: err
  }

  res.send(response_server_error);
  res.end();
}
