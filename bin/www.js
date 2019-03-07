var config = require('../config');
var app = require('../app');

app.set('port', config.app.port || 3000);

var server = app.listen(app.get('port'), function() {
 });
