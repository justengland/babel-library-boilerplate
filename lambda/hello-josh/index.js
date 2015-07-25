import fs from 'fs';

exports.handler = function(event, context) {
  console.log(JSON.stringify(event));
  console.log("dude looks like a lady");

  context.done(null);
};