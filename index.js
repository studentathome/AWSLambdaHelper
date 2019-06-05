const AWSXRay = require('aws-xray-sdk');
const AWS = AWSXRay.captureAWS(require('aws-sdk'));
const async = require('async');
const uuidv4 = require('uuid/v4');
const cloudwatchlogs = new AWS.CloudWatchLogs();
const lambda = new AWS.Lambda();
const documentClient = new AWS.DynamoDB.DocumentClient();
const http = AWSXRay.captureHTTPs(require('http'));
const https = AWSXRay.captureHTTPs(require('https'));
const joi = require('joi');

let functionName = 'unknown';
let environment = 'unknown';
let logGroupName = process.env.CW_LOG_GROUP_NAME ? process.env.CW_LOG_GROUP_NAME + '-' + environment : undefined;
let logEvent;
let logContext;
let logMessages;

const requiredHeaderParams = process.env.REQUIRED_HEADER_PARAMS ? process.env.REQUIRED_HEADER_PARAMS.split(',') : [];
const requiredBodyParams = process.env.REQUIRED_BODY_PARAMS ? process.env.REQUIRED_BODY_PARAMS.split(',') : [];

const secretFilter = /(pass|token)/i;
const additionalSecretFilter = process.env.SECRET_RE? new RegExp(process.env.SECRET_RE): false;

const init = (event, context, callback) => {
  if (event.body && typeof event.body === 'string') {
    event.body = JSON.parse(event.body);
  }

  functionName = context.functionName;
  environment = functionName.split('-')[1];
  logGroupName = process.env.CW_LOG_GROUP_NAME ? process.env.CW_LOG_GROUP_NAME + '-' + environment : undefined;

  logEvent = JSON.parse(JSON.stringify(event));
  logContext = context;
  logMessages = [];

  console.info('Received event:', JSON.stringify(logEvent, hideVulnerableKeys, 2));
  console.info('Received context:', JSON.stringify(logContext, hideVulnerableKeys, 2));

  checkRequiredParams(event.headers, event.body, callback);
};

const initWith = (fn, schema=null) => {
  return (event, context, callback) => {
    init(event, context, async (err, result) => {
      if (err) return err;
      if (schema) {
        const joiValidation = joi.validate(event, schema);
        if (joiValidation.error) return JSON.stringify(result.error);
      }
      fn(event, context, callback);
    });
  };
};

const callbackResponse = (statusCode, body, callback) => {
  const response = {
    statusCode: statusCode,
    headers: {
      'Access-Control-Allow-Origin' : '*',
      'Access-Control-Allow-Credentials' : true
    }
  };

  try {
    response.body = JSON.stringify(body);
  } catch (e) {
    response.body = "{'error': 'body could not be stringified'}";
  }

  try {
    console.info('Response:', JSON.stringify(response, hideVulnerableKeys, 2));
  } catch (e) {
    console.info('Response can not be stringified');
  }
  console.timeEnd(functionName);

  try {
    if (statusCode >= 500) {
      callback(JSON.stringify(response));
    } else {
      callback(undefined, JSON.stringify(response));
    }
  } catch (e) {
    callback("{'error': 'response could not be stringified'}");
  }

  postMessages();
};

const invokeLambda = (lambdaFuncName, payload, callback, optionalParameters) => {
  functionName += '-' + environment;
  let params = {
    FunctionName: functionName,
    Payload: JSON.stringify(payload)
  };

  if (optionalParameters) {
    params = Object.assign({}, params, optionalParameters);
  }

  lambda.invoke(params, (err, result) => {
    if (err) {
      console.log('Error invoking ' + params.FunctionName);
      console.log(JSON.stringify(err, null, 2));
      module.exports.logError(err);
      callback(err);
    } else {
      if (!result.Payload) {
        callback();
      } else {
        const resultPayload = JSON.parse(result.Payload);
        let body;
        if (resultPayload.body) {
          body = JSON.parse(resultPayload.body);
        }
        if (resultPayload.statusCode >= 200 && resultPayload.statusCode < 300) {
          callback(undefined, body);
        } else {
          callback(body);
        }
      }
    }
  });
};

const dynamoGet = (tableName, key, callback) => {
  tableName += '-' + environment;
  const params = {
    TableName : tableName,
    Key: key
  };

  documentClient.get(params, (err, data) => {
    if (err) {
      console.log('Error getting item from table: ' + tableName);
      console.log(JSON.stringify(err, null, 2));
      module.exports.logError(err);
      callback(err);
    } else {
      callback(undefined, data.Item);
    }
  });
};

const dynamoPut = (tableName, item, callback, conditionExpression, expressionAttributeNames, expressionAttributeValues) => {
  tableName += '-' + environment;
  const params = {
    TableName : tableName,
    Item: item
  };

  if (conditionExpression) {
    params.ConditionExpression = conditionExpression;
  }

  if (expressionAttributeNames) {
    params.ExpressionAttributeNames = expressionAttributeNames;
  }

  if (expressionAttributeValues) {
    params.ExpressionAttributeValues = expressionAttributeValues;
  }

  documentClient.put(params, (err, data) => {
    if (err) {
      if (err.code !== 'ConditionalCheckFailedException') {
        console.log('Error putting item on table: ' + tableName);
        console.log(JSON.stringify(err, null, 2));
        module.exports.logError(err);
      }
      callback(err);
    } else {
      callback();
    }
  });
};

const dynamoUpdate = (tableName, key, updateExpression, expressionAttributeValues, callback, conditionExpression, expressionAttributeNames) => {
  tableName += '-' + environment;
  const params = {
    TableName: tableName,
    Key: key,
    UpdateExpression: updateExpression,
    ReturnValues: 'ALL_NEW'
  };

  if (expressionAttributeNames) {
    params.ExpressionAttributeNames = expressionAttributeNames;
  }

  if (expressionAttributeValues) {
    params.ExpressionAttributeValues = expressionAttributeValues;
  }

  if (conditionExpression) {
    params.ConditionExpression = conditionExpression;
  }

  documentClient.update(params, (err, data) => {
    if (err) {
      if (err.code !== 'ConditionalCheckFailedException') {
        console.log('Error updating item on table: ' + tableName);
        console.log(JSON.stringify(err, null, 2));
        module.exports.logError(err);
      }
      callback(err);
    } else {
      callback(undefined, data.Attributes);
    }
  });
};

const dynamoQuery = (tableName, keyConditionExpression, expressionAttributeValues, callback, indexName, lastEvaluatedKey, expressionAttributeNames, attributesToGet, filterExpression) => {
  tableName += '-' + environment;

  const params = {
    TableName: tableName,
    KeyConditionExpression: keyConditionExpression,
    ExpressionAttributeValues: expressionAttributeValues
  };

  if (indexName) {
    params.IndexName = indexName;
  }

  if (expressionAttributeNames) {
    params.ExpressionAttributeNames = expressionAttributeNames;
  }

  if (lastEvaluatedKey) {
    params.ExclusiveStartKey = lastEvaluatedKey;
  }

  if (attributesToGet) {
    params.AttributesToGet = attributesToGet;
  }

  if (filterExpression) {
    params.FilterExpression = filterExpression;
  }

  documentClient.query(params, (err, data) => {
    if (err) {
      console.log('Error query on table: ' + tableName);
      console.log(JSON.stringify(err, null, 2));
      module.exports.logError(err);
      callback(err);
    } else {
      const returnObject = {
        items: data.Items,
        count: data.Count,
        scannedCount: data.ScannedCount,
        lastEvaluatedKey: data.LastEvaluatedKey
      };
      callback(undefined, returnObject);
    }
  });
};

const dynamoScan = (tableName, callback, indexName, lastEvaluatedKey, filterExpression, expressionAttributeNames, expressionAttributeValues, attributesToGet) => {
  tableName += '-' + environment;
  const params = {
    TableName: tableName,
    IndexName: indexName || undefined,
    ExclusiveStartKey: lastEvaluatedKey,
    FilterExpression: filterExpression,
    ExpressionAttributeNames: expressionAttributeNames,
    ExpressionAttributeValues: expressionAttributeValues,
    AttributesToGet: attributesToGet
  };

  documentClient.scan(params, (err, data) => {
    if (err) {
      console.log('Error scan on table: ' + tableName);
      console.log(JSON.stringify(err, null, 2));
      module.exports.logError(err);
      callback(err);
    } else {
      const returnObject = {
        items: data.Items,
        count: data.Count,
        scannedCount: data.ScannedCount,
        lastEvaluatedKey: data.LastEvaluatedKey
      };
      callback(undefined, returnObject);
    }
  });
};

const logError = (error, options) => {
  if (!error.time) {
    error.time = new Date().toISOString();
  }

  let logMessage = {
    level: 'ERROR',
    time: error.time,
    functionName: functionName
  };

  try {
    logMessage = Object.assign({}, error, logMessage);
  } catch (e) {
    //Not much we can do about it
  }

  if (options) {
    try {
      logMessage = Object.assign({}, options, logMessage);
    } catch (e) {
      //Not much we can do about it
    }
  }

  logMessages.push(logMessage);
};

const httpsRequest = (options, data, callback) => {
  const req = https.request(options, res => {

    let body = '';
    res.on('data', part => {
      body += part;
    });

    res.on('end', () => {
      if (res.statusCode >= 200 && res.statusCode < 300) {
        res.body = body;
        callback(undefined, res);
      } else {
        callback(res);
      }
    });

  });

  req.on('error', err => {
    console.log('Error requesting api');
    console.log(JSON.stringify(err, null, 2));
    module.exports.logError(err);
    const error = {
      code: 'UnexpectedLambdaException',
      message: 'An unexpected error occured, try again later or contact support',
      statusCode: 500
    };
    callback(error);
  });

  if (data) {
    req.write(data);
  }

  req.end();
};

const httpRequest = (options, data, callback) => {
  const req = http.request(options, res => {

    let body = '';
    res.on('data', part => {
      body += part;
    });

    res.on('end', () => {
      if (res.statusCode >= 200 && res.statusCode < 300) {
        res.body = body;
        callback(undefined, res);
      } else {
        callback(res);
      }
    });

  });

  req.on('error', err => {
    console.log('Error requesting api');
    console.log(JSON.stringify(err, null, 2));
    module.exports.logError(err);
    const error = {
      code: 'UnexpectedLambdaException',
      message: 'An unexpected error occured, try again later or contact support',
      statusCode: 500
    };
    callback(error);
  });

  if (data) {
    req.write(data);
  }

  req.end();
};

const startXRayRec = (name, callback) => {
  AWSXRay.captureAsyncFunc(name, subsegment => {
    const recorder = new XRayRecorder(name, subsegment);
    callback(undefined, recorder);
  });
};

const checkRequiredParams = (headers, body, callback) => {
  async.parallel({
    headerParams: paramCallback => {
      checkHeaderParams(headers, paramCallback);
    },
    bodyParams: paramCallback => {
      checkBodyParams(body, paramCallback);
    }
  }, (err, results) => {
    if (err) {
      callback(err);
    } else {
      callback();
    }
  });
};

const checkHeaderParams = (headers, callback) => {
  if (requiredHeaderParams.length === 0 || (requiredHeaderParams.length === 1 && requiredHeaderParams[0] === '')) {
    callback();
  } else {
    if (!headers) {
      const error = {
        code: 'InvalidParameterException',
        message: 'No headers found in the request',
        statusCode: 400
      };
      callback(error);
    } else {
      checkValues(requiredHeaderParams, headers, callback);
    }
  }
};

const checkBodyParams = (body, callback) => {
  if (requiredBodyParams.length === 0 || (requiredBodyParams.length === 1 && requiredBodyParams[0] === '')) {
    callback();
  } else {
    if (!body) {
      const error = {
        code: 'InvalidParameterException',
        message: 'No body found in the request',
        statusCode: 400
      };
      callback(error);
    } else {
      checkValues(requiredBodyParams, body, callback);
    }
  }
};

const checkValues = (params, values, callback) => {
  async.each(params, (param, paramCallback) => {
    if(!isValue(values[param])) {
      const error = {
        code: 'InvalidParameterException',
        message: param + ' is required',
        statusCode: 400
      };
      paramCallback(error);
    } else {
      paramCallback();
    }
  }, callback);
};

const isValue = value => {
  if ((!value && value !== false && value !== 0) || value === '') {
    return false;
  } else {
    return true;
  }
};

const XRayRecorder = function(name, subsegment){
  this.name = name;
  this.subsegment = subsegment;
};

XRayRecorder.prototype.fail = function(error) {
  this.subsegment.addErrorFlag();
  if (error) {
    this.subsegment.addAnnotation(error.code, error.message);
  }
  this.subsegment.close();
};

XRayRecorder.prototype.succeed = function() {
  this.subsegment.addAnnotation('success', 'all tests passed');
  this.subsegment.close();
};

const postMessages = () => {
  if (logMessages.length > 0) {
    if (!logGroupName) {
      console.log('No log group available in environment variables, not posting messages');
      console.log('Messages received for logging:');
      console.log(JSON.stringify(logMessages, null, 2));
    } else {
      const logEvents = [];
      async.each(logMessages, (logMessage, callback) => {
        logMessage.event = logEvent;
        logMessage.context = logContext;
        logEvents.push({
          message: JSON.stringify(logMessage, null, 2),
          timestamp: new Date(logMessage.time).getTime()
        });
        callback();
      }, err => {
        if (err) {
          console.log('An error occurred processing logmessages');
        } else {
          async.waterfall([
            callback => {
              const params = {
                logGroupName: logGroupName,
                logStreamName: functionName + '/' + uuidv4()
              };
              cloudwatchlogs.createLogStream(params, (error, result) => {
                if (error) {
                  console.log('An error occured creating a new log stream');
                  console.log(JSON.stringify(error, null, 2));
                  callback(error);
                } else {
                  callback(undefined, params.logStreamName);
                }
              });
            },
            (logStreamName, callback) => {
              const params = {
                logEvents: logEvents,
                logGroupName: logGroupName,
                logStreamName: logStreamName
              };
              cloudwatchlogs.putLogEvents(params, (error, result) => {
                if (error) {
                  console.log('An error occured posting log messages to stream');
                  console.log(JSON.stringify(error, null, 2));
                }
              });
            }
          ]);
        }
      });
    }
  }
};

const hideVulnerableKeys = (key, val) => {
  if(typeof val === 'string' && secretFilter.test(key))
    return '***';
  if(additionalSecretFilter && additionalSecretFilter.test(key))
    return '***';
  return val;
};

const callbackToPromise = fn => {
  return function(...args) {
    return new Promise((res, rej) => {
      const callbackHandle = (error, result) => { error? rej(error): res(result); };
      args.push(callbackHandle);
      fn.apply(this, args);
    });
  };
};

const sleep = (ms) => {
  return new Promise(resolve => setTimeout(resolve, ms));
};

module.exports = {
  init: init,
  initWith: initWith,
  callbackResponse: callbackResponse,
  invokeLambda: invokeLambda,
  dynamoGet: dynamoGet,
  dynamoPut: dynamoPut,
  dynamoUpdate: dynamoUpdate,
  dynamoQuery: dynamoQuery,
  dynamoScan: dynamoScan,
  logError: logError,
  httpsRequest: httpsRequest,
  httpRequest: httpRequest,
  startXRayRec: startXRayRec,
  getEnvironment: () => environment,
  getFunctionName: () => functionName,
  CtP: callbackToPromise,
  AWS: AWS,
  AWSXRay: AWSXRay,
  sleep: sleep
};
