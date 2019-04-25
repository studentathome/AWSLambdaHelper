const expect = require("chai").expect;
const lh = require("..");

const AWS = require("aws-sdk-mock");
AWS.mock('DynamoDB.DocumentClient', 'query', 'message');


describe("LambdaHelper", function() {

  describe("Init and return", function() {

    it("succesful init", function() {
      lh.init({}, {}, function(err) {
        expect(err, "Expected error to be undefined").to.be.undefined;
      });
    });

    it("succesful 200 callbackResponse", function() {
      lh.callbackResponse(200, "Test", function (err, result) {
        expect(err, "Expected error to be undefined").to.be.undefined;
        expect(result).to.have.all.keys("statusCode", "headers", "body");
      });
    });

  });


  describe("DynamoDB", function() {
    it("query", function(done) {
      lh.dynamoQuery("marketingData", "#type=:type", { ":type": "mijnPortalOnboardProgress" }, function(err, result) {
        console.log(err, result);
        expect(err, "Expected error to be undefined").to.be.undefined;
        done();
      }, null, null, { "#type": "type" });
    })
  });
});