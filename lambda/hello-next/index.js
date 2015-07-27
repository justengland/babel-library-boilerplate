import fs from 'fs';

exports.handler = function(event, context) {
  console.log(JSON.stringify(event));
  console.log('this is the next item');

  context.done(null);
};