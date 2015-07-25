// TODO: This should probably pull from package.json
var AWS = require('aws-sdk');
var gutil = gutil || {};
var fs = require('fs');
gutil.log = console.log;

AWS.config.region = 'us-east-1';
var lambda = new AWS.Lambda();
var functionName = 'hello-josh';


function upload (onUploadComplete) {
  lambda.getFunction({FunctionName: functionName}, function(err, data) {
    gutil.log("made it this far", data);

    if (err) {
      if (err.statusCode === 404) {
        var warning = 'Unable to find lambda function ' + deploy_function + '. '
        warning += 'Verify the lambda function name and AWS region are correct.'
        gutil.log(warning);
      } else {
        var warning = 'AWS API request failed. '
        warning += 'Check your AWS credentials and permissions.'
        gutil.log(warning);
      }
    }

    // This is a bit silly, simply because these five parameters are required.
    var current = data.Configuration;
    var params = {
      FunctionName: functionName
    };



    fs.readFile('./dist/lambda.zip', function(err, data) {
      params['ZipFile'] = data;
      gutil.log('lambda params:', params);

      lambda.updateFunctionCode(params, function(err, data) {
        if (err) {
          var warning = 'Package upload failed. '
          warning += 'Check your iam:PassRole permissions.'
          gutil.log(warning, err);
        }
        onUploadComplete();
      });
    });
  });
}

function run() {
  var context = {
    "key3": "value3",
    "key2": "value2",
    "key1": "value1"
  };

  var params = {
    FunctionName: functionName,
    InvocationType: 'RequestResponse',
    LogType: 'Tail',
    Payload: JSON.stringify(context),
  };
  lambda.invoke(params, function(err, data) {
    if (err) console.log('-------> ', err, err.stack); // an error occurred
    else {
      // successful response
      console.log('-------> ', JSON.stringify(data,0,2));

      //
      console.log("PayLoad:");
      var payLoad = JSON.parse(data.Payload);
      console.log(JSON.stringify(payLoad,0,2));

      // Get the log data
      var b = new Buffer(data.LogResult, 'base64')
      console.log('log:');
      console.log(b.toString());

    }



  });
}


upload(function() {
  run();
})