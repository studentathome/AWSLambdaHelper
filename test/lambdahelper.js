/* global describe it */
const chai = require('chai');
const chaiAsPromised = require('chai-as-promised');
chai.use(chaiAsPromised);
const expect = chai.expect;

const lh = require('..');

const AWS = require('aws-sdk-mock');
AWS.mock('DynamoDB.DocumentClient', 'query', 'message');
AWS.mock('DynamoDB.DocumentClient', 'scan', 'message');

const http = require('http');
const https = require('https');
const pki = require('node-forge').pki;

const servers = mockServer();

describe('LambdaHelper', function() {
  describe('Init', function() {
    it('no context init', function() {
      lh.init('', null, function(err) {
        expect(lh.getFunctionName()).to.eql('unknown-unknown');
        expect(lh.getEnvironment()).to.eql('unknown');
        expect(err).to.be.undefined;
      });
    });
    it('empty context init', function() {
      lh.init('', {}, function(err) {
        expect(lh.getFunctionName()).to.eql('unknown-unknown');
        expect(lh.getEnvironment()).to.eql('unknown');
        expect(err).to.be.undefined;
      });
    });
    it('succesful init', function() {
      lh.init({}, {'functionName': 'marketingData-dev'}, function(err) {
        expect(err, 'Expected error to be undefined').to.be.undefined;
      });
    });
  });

  describe('Init With', function() {
    const eventExpected = {test: 'event', body: {test: 'body'}};
    const contextExpected = {'functionName': 'marketingData-dev'};
    const eventTest = {
      test: 'event',
      body: '{"test": "body"}'
    };
    const contextTest = {
      functionName: 'marketingData-dev'
    };
    it('succesful init with', function(done) {
      const testFunction = function(event, context, callback) {
        expect(eventExpected).to.eql(event);
        expect(lh.getFunctionName()).to.eql('marketingData-dev');
        expect(lh.getEnvironment()).to.eql('dev');
        done();
      };
      const error = lh.initWith(testFunction)(eventTest, contextTest, function(err) {
        expect(err).to.be.undefined;
      });
      expect(error).to.be.undefined;
    });
    it('failed schema validation for init with', function(done) {
      const testFunction = function(event, context, callback) {
        expect(eventExpected).to.eql(event);
        expect(lh.getFunctionName()).to.eql('marketingData-dev');
        expect(lh.getEnvironment()).to.eql('dev');
        done();
      };
      const schema = {'body': 'should be a string for this test lambda'};
      lh.initWith(testFunction, schema)(eventTest, contextTest, function(err) {
        expect(err.toString()).to.eql('ValidationError: child "body" fails because ["body" must be a string]');
      });
    });
    it('succesful schema validation for init with', function(done) {
      const testFunction = function(event, context, callback) {
        expect({body: {}}).to.eql(event);
        expect(lh.getFunctionName()).to.eql('marketingData-dev');
        expect(lh.getEnvironment()).to.eql('dev');
        done();
      };
      const schema = {'body': {}};
      lh.initWith(testFunction, schema)({body: '{}'}, contextTest, function(err) {
        expect(err).to.be.undefined;
      });
    });
  });

  describe('DynamoDB', function() {
    const cur_date = new Date().toISOString();

    it('put', function(done) {
      lh.dynamoPut('marketingData', {'type':'awsLambdaHelperTest', 'date': cur_date, 'content': 'This is a test for the awsLambdaHelper package'}, function(err, result) {
        expect(err, 'Expected error to be undefined').to.be.undefined;
        expect(result, 'Expected result to be undefined').to.be.undefined;
        done();
      });
    });

    it('update', function(done) {
      lh.dynamoPut('marketingData', {'type':'awsLambdaHelperTest', 'date': cur_date, 'content': 'This is a followup test for the awsLambdaHelper package'}, function(err, result) {
        expect(err, 'Expected error to be undefined').to.be.undefined;
        expect(result, 'Expected result to be undefined').to.be.undefined;
        done();
      });
    });

    it('get', function(done) {
      lh.dynamoGet('marketingData', {'type':'awsLambdaHelperTest', 'date': cur_date}, function(err, result) {
        expect(err, 'Expected error to be undefined').to.be.undefined;
        expect(result).to.have.all.keys(['content', 'date', 'type']);
        expect(result).to.eql({
          content: 'This is a followup test for the awsLambdaHelper package',
          date: cur_date,
          type: 'awsLambdaHelperTest'
        });
        done();
      });
    });

    it('query', function(done) {
      lh.dynamoQuery('marketingData', '#type=:type', { ':type': 'awsLambdaHelperTest' }, function(err, result) {
        expect(err, 'Expected error to be undefined').to.be.undefined;
        expect(result).to.have.all.keys(['count', 'items', 'lastEvaluatedKey', 'scannedCount']);
        expect(result.items).to.have.lengthOf.at.least(1);
        expect(result.items[0]).to.have.all.keys(['content', 'date', 'type']);
        done();
      }, null, null, { '#type': 'type' });
    });

    it('scan', function(done) {
      lh.dynamoScan('marketingData', function(err, result) {
        expect(err, 'Expected error to be undefined').to.be.undefined;
        expect(result).to.have.all.keys(['count', 'items', 'lastEvaluatedKey', 'scannedCount']);
        expect(result.items).to.have.lengthOf.at.least(1);
        expect(result.items[0]).to.have.all.keys(['content', 'date', 'type']);
        done();
      });
    });
  });


  describe('Logs', function() {

    it('log an error', function() {
      lh.logError({error: 'AWSLambdaHelper Test'});
    });

    it('log an error with options', function() {
      lh.logError({error: 'AWSLambdaHelper Test'}, {test: 'hi'});
    });

    it('log an error with incorrectly assigned options', function() {
      lh.logError({error: 'AWSLambdaHelper Test'}, 'not json');
    });

    it('starts an xray rec', function() {
      lh.startXRayRec('Test', function(err, result) {
        expect(err, 'Expected error to be undefined').to.be.undefined;
        expect(result).to.have.all.keys('name', 'subsegment');
      });
    });

  });


  describe('Http(s) requests', function() {
    const options = {
      method: 'GET',
      hostname: 'localhost',
      port: 8008,
      path: '/',
      headers:
      {
        'Cache-Control': 'no-cache'
      }
    };

    const https_options = Object.assign({}, options, {
      rejectUnauthorized: false,
      port: 8443
    });

    let both;
    it('http', function(done) {
      servers.then(([http_s, https_s]) => {
        lh.httpRequest(options, '', function(err, result) {
          expect(err, 'Expected error to be undefined').to.be.undefined;
          expect(result).to.include.keys(['body']);
          expect(JSON.parse(result.body)).to.include.keys(['status']);
          done();
          if(both) {
            http_s.close();
            https_s.close();
          }
          else both=true;
        });
      });
    });

    it('https', function(done) {
      servers.then(([http_s, https_s]) => {
        lh.httpsRequest(https_options, '', function(err, result) {
          expect(err, 'Expected error to be undefined').to.be.undefined;
          expect(result).to.include.keys(['body']);
          expect(JSON.parse(result.body)).to.include.keys(['status']);
          done();
          if(both) {
            http_s.close();
            https_s.close();
          }
          else both=true;
        });
      });
    });
  });


  describe('Callback', function() {
    it('succesful 200 callbackResponse', function() {
      lh.callbackResponse(200, 'Test', function (err, result) {
        expect(err, 'Expected error to be undefined').to.be.undefined;
        expect(result).to.have.all.keys('statusCode', 'headers', 'body');
      });
    });
  });

  describe('Callback to Promise', function() {
    const arg1 = 'bla';
    const arg2 = { something: 'to test' };
    const callback_fn = function(fn_arg1, fn_arg2, callback) {
      it('keeps the same arguments but appends a callback function', function() {
        expect(fn_arg1).to.equal(arg1);
        expect(fn_arg2).to.equal(arg2);
        expect(callback).to.be.a('function');
        callback();
      });
    };
    const promisified_fn = lh.CtP(callback_fn);
    it('returns a function', function() {
      expect(promisified_fn).to.be.a('function');
    });
    it('returns a promise', function() {
      const promise_result = promisified_fn(arg1, arg2);
      expect(promise_result).to.be.a('promise');
      expect(promise_result).to.eventually.be.fulfilled;
    });
    it('rejects the promise when callback has a first argument', function() {
      const error = new Error('Callback to Promise Error');
      const promisified_error_fn = lh.CtP(function(cb){cb(error);});
      expect(promisified_error_fn()).to.eventually.be.rejectedWith(error);
    });
  });

  describe('Sleep should wait for at least the specified delay', function() {
    it('should take over a second to resume the code with 1000 milliseconds', function(done) {
      const startTime = new Date();
      lh.sleep(1000).then(function() {
        const endTime = new Date();
        const diff = endTime - startTime;
        expect(diff).to.be.least(1000);
        done();
      });
    });
  });
});


async function mockServer() {
  function status200 (_, res) {
    res.writeHead(200, {'Content-Type': 'application/json'});
    res.end('{ "status": "OK" }');
  }
  const http_s = http.createServer(status200).listen(8008);

  const keys = pki.rsa.generateKeyPair(2048);
  const cert = pki.createCertificate();
  cert.publicKey = keys.publicKey;
  cert.serialNumber = '01';
  cert.sign(keys.privateKey);

  // convert a Forge certificate and privateKey to PEM
  const pem = pki.certificateToPem(cert);
  const key = pki.privateKeyToPem(keys.privateKey);

  const https_s = https.createServer({key: key, cert: pem}, status200).listen(8443);
  return [http_s, https_s];
}
