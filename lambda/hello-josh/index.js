import fs from 'fs';
import Sample from './sample';

exports.handler = function(event, context) {
  console.log(JSON.stringify(event));
  console.log("dude looks like a lady man ", Sample.who());

  context.done(null);
};