'use strict';
// require

/**
 * AWS Lambda entry point
 *
 * @param {Object} event lambda event object
 * @param {Object} context lambda context
 */
exports.handler = function(event, context) {
    console.log(JSON.stringify(event));

    debugger;
    context.done(null);
};