//References:  https://thewayofcode.wordpress.com/2013/04/21/how-to-build-and-test-rest-api-with-nodejs-express-mocha/
// NodeJs Modules
var request = require('supertest');
var should = require('should');

// Modules
var config = require('../config');

//Test Variables
var url = 'http://localhost:'+config.app.port+'/api';

describe('Withdraw Process', function() {
  it('Only EU 100', function(done) {
  this.timeout(20 * 1000);
  var body = {
    value: 100
  };
  
  request(url)
      .post('/withdraw')
      .send(body)
      .expect(200)
      .end(function(err, res) {
        if (err) {
          throw err;
        }
        res.body.success.should.be.equal(true);
        res.body.data[0].note.should.be.equal(100);
        res.body.data[0].qty.should.be.equal(1);
        done();
      });
  }) //it
  , it('NoteUnavailableException', function(done) {
    var body = {
      value: 125.00
    };

    request(url)
      .post('/withdraw')
      .send(body)
      .expect(400)
      .end(function(err, res) {
        if (err) {
          throw err;
        }
        res.body.success.should.be.equal(false);
        res.body.error_code.should.be.equal('NoteUnavailableException');
        done();
      });
  }) //it
  , it('InvalidArgumentException', function(done) {
    var body = {
      value: -130.00
    };

    request(url)
      .post('/withdraw')
      .send(body)
      .expect(400)
      .end(function(err, res) {
        if (err) {
          throw err;
        }
        res.body.success.should.be.equal(false);
        res.body.error_code.should.be.equal('InvalidArgumentException');
        done();
      });
  }) //it
  , it('[Empty Set]', function(done) {
    var body = null;

    request(url)
      .post('/withdraw')
      .send(body)
      .expect(400)
      .end(function(err, res) {
        if (err) {
          throw err;
        }
        res.body.success.should.be.equal(false);
        res.body.error_code.should.be.equal('[Empty Set]');
        done();
      });
  }) //it 
});