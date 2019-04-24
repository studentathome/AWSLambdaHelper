var assert = require('assert');
const awsLambdaHelper = require('../');

describe('Array', function () {
  describe('#indexOf()', function () {
    it('should return -1 when the value is not present', function () {
      assert.equal([1, 2, 3].indexOf(4), -1);
    });
  });
});

describe('User', function () {
  describe('#save()', function () {
    it('should save without error', function (done) {
      var user = new User('Luna');
      user.save(function (err) {
        if (err) done(err);
        else done();
      });
    });
  });
});

describe('User', function () {
  describe('#save()', function () {
    it('should save without error', function (done) {
      var user = new User('Luna');
      user.save(done);
    });
  });
});

it('double done', function (done) {
  // Calling `done()` twice is an error
  setImmediate(done);
  setImmediate(done);
});

describe('Init', function() {
  it('should init without error', function(done) {
    awsLambdaHelper.init({}, {}, function() { setImmediate(done); })
  });
  awsLambdaHelper.init();
});
