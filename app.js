var express = require('express');
var bodyParser = require('body-parser');

/////////////////////////////////
/// App Initialization
/////////////////////////////////

var app = express();
app.use((req, res, next) => {
  res.header('Access-Control-Allow-Origin', req.get('Origin') || '*');
  res.header('Access-Control-Allow-Credentials', 'true');
  res.header('Access-Control-Allow-Methods', 'GET,HEAD,PUT,PATCH,POST,DELETE');
  res.header('Access-Control-Expose-Headers', 'Content-Length');
  res.header('Access-Control-Allow-Headers', 'Accept, Authorization, Content-Type, X-Requested-With, Range');
  if (req.method === 'OPTIONS') {
    res.statusCode = 200;
    return res.send();
  } else {
    return next();
  }
  next();
});
app.use(bodyParser.urlencoded({ extended: false }));
app.use(bodyParser.json({ limit: "15MB", type:'application/json'}));


// Routes
app.use('/api/withdraw', require('./routes/withdraw'));

/// Sends a custom error message
function errorHandler (err, req, res, next) {
    res.status(500).send({ error: 'Unexpected error!', message: err.message, stack: err.stack})
}

module.exports = app;
