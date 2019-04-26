const expect = require("chai").expect;
const lh = require("..");

const AWS = require("aws-sdk-mock");
AWS.mock('DynamoDB.DocumentClient', 'query', 'message');
AWS.mock('DynamoDB.DocumentClient', 'scan', 'message');


describe("LambdaHelper", function() {

  describe("Init", function() {
    it("succesful init", function() {
      lh.init({}, {}, function(err) {
        expect(err, "Expected error to be undefined").to.be.undefined;
      });
    });
  });


  describe("DynamoDB", function() {
    const cur_date = new Date().toISOString();

    it("put", function(done) {
      lh.dynamoPut("marketingData", {"type":"awsLambdaHelperTest", "date": cur_date, "content": "This is a test for the awsLambdaHelper package"}, function(err, result) {
        expect(err, "Expected error to be undefined").to.be.undefined;
        done();
      });
    });

    it("update", function(done) {
      lh.dynamoPut("marketingData", {"type":"awsLambdaHelperTest", "date": cur_date, "content": "This is a followup test for the awsLambdaHelper package"}, function(err, result) {
        expect(err, "Expected error to be undefined").to.be.undefined;
        done();
      });
    });

    it("get", function(done) {
      lh.dynamoGet("marketingData", {"type":"awsLambdaHelperTest", "date": cur_date}, function(err, result) {
        expect(err, "Expected error to be undefined").to.be.undefined;
        done();
      });
    });

    it("query", function(done) {
      lh.dynamoQuery("marketingData", "#type=:type", { ":type": "awsLambdaHelperTest" }, function(err, result) {
        expect(err, "Expected error to be undefined").to.be.undefined;
        done();
      }, null, null, { "#type": "type" });
    });

    it("scan", function(done) {
      lh.dynamoScan("marketingData", function(err, result) {
        expect(err, "Expected error to be undefined").to.be.undefined;
        done();
      });
    });
  });


  describe("Logs", function() {

    it("log an error", function() {
      lh.logError({error: "AWSLambdaHelper Test"});
    });

    it("starts an xray rec", function() {
      lh.startXRayRec("Test", function(err, result) {
        expect(err, "Expected error to be undefined").to.be.undefined;
        expect(result).to.have.all.keys("name", "subsegment");
      });
    });

  });


  describe("Http(s) requests", function() {
    const options = {
      method: "GET",
      hostname: "httpbin.org",
      path: "/get",
      headers:
      {
        "Cache-Control": "no-cache"
      }
    };
    
    it("http", function(done) {
      lh.httpsRequest(options, "", function(err, result) {
        expect(err, "Expected error to be undefined").to.be.undefined;
        done();
      });
    });

    it("https", function(done) {
      lh.httpsRequest(options, "", function(err, result) {
        expect(err, "Expected error to be undefined").to.be.undefined;
        done();
      });
    });

  });


  describe("Callback", function() {
    it("succesful 200 callbackResponse", function() {
      lh.callbackResponse(200, "Test", function (err, result) {
        expect(err, "Expected error to be undefined").to.be.undefined;
        expect(result).to.have.all.keys("statusCode", "headers", "body");
      });
    });
  });
});