const gulp = require('gulp');

const $ = require('gulp-load-plugins')();
const fs = require('fs');
const del = require('del');
// New requires
const gutil = require('gulp-util');
const rename = require('gulp-rename');
const install = require('gulp-install');
const zip = require('gulp-zip');
const AWS = require('aws-sdk');


const glob = require('glob');
const path = require('path');
const mkdirp = require('mkdirp');
const babelify = require('babelify');
const isparta = require('isparta');
const esperanto = require('esperanto');
const browserify = require('browserify');
const runSequence = require('run-sequence');
const source = require('vinyl-source-stream');

const manifest = require('./package.json');
const config = manifest.babelBoilerplateOptions;
const mainFile = manifest.main;
const destinationFolder = path.dirname(mainFile);
const exportFileName = path.basename(mainFile, path.extname(mainFile));

// Adding in https://medium.com/@AdamRNeary/a-gulp-workflow-for-amazon-lambda-61c2afd723b6
//   also https://medium.com/@AdamRNeary/developing-and-testing-amazon-lambda-functions-e590fac85df4

// Here we want to install npm packages to dist, ignoring devDependencies.
gulp.task('npm', function() {
  gulp.src('./lambda/hello-world/package.json')
      .pipe(gulp.dest('./dist/'))
      .pipe(install({production: true}));
});

// The js task could be replaced with gulp-coffee as desired.
gulp.task('js', function() {

  // this is where I am moving the source file
  gulp.src('./lambda/hello-world/index')
      .pipe(gulp.dest('dist/'))
});

// Next copy over environment variables managed outside of source control.
gulp.task('env', function() {
  gulp.src('./config.env.production')
      .pipe(rename('.env'))
      .pipe(gulp.dest('./dist'))
});

// Now the dist directory is ready to go. Zip it.
gulp.task('zip', function() {
  gulp.src(['dist/**/*', '!dist/package.json', 'dist/.*'])
      .pipe(zip('dist.zip'))
      .pipe(gulp.dest('./'));
});

// Per the gulp guidelines, we do not need a plugin for something that can be
// done easily with an existing node module. #CodeOverConfig
//
// Note: This presumes that AWS.config already has credentials. This will be
// the case if you have installed and configured the AWS CLI.
//
// See http://aws.amazon.com/sdk-for-node-js/
gulp.task('upload', function() {

  // TODO: This should probably pull from package.json
  AWS.config.region = 'us-east-1';
  var lambda = new AWS.Lambda();
  var functionName = 'hello-josh';

  lambda.getFunction({FunctionName: functionName}, function(err, data) {
    gutil.log("made it this far");

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
      FunctionName: functionName,
      Handler: current.Handler,
      Mode: current.Mode,
      Role: current.Role,
      Runtime: current.Runtime
    };

    fs.readFile('./dist.zip', function(err, data) {
      params['ZipFile'] = data;

      lambda.updateFunctionCode(params, function(err, data) {
        if (err) {
          var warning = 'Package upload failed. '
          warning += 'Check your iam:PassRole permissions.'
          gutil.log(warning);
        }
      });
    });
  });
});

// Heading Back to the template Adding in https://github.com/babel/babel-library-boilerplate

// Remove the built files
gulp.task('clean', function(cb) {
  del([destinationFolder], cb);

  // from gulp workflow
  del('./dist',
      del('./archive.zip', cb)
  );

});

// Remove our temporary files
gulp.task('clean-tmp', function(cb) {
  del(['tmp'], cb);
});

// Send a notification when JSRC fails,
// so that you know your changes didn't build
function jscsNotify(file) {
  if (!file.jscs) { return; }
  return file.jscs.success ? false : 'JSRC failed';
}

function createLintTask(taskName, files) {
  gulp.task(taskName, function() {
    return gulp.src(files)
      .pipe($.plumber())
      .pipe($.eslint())
      .pipe($.eslint.format())
      .pipe($.eslint.failOnError())
      .pipe($.jscs())
      .pipe($.notify(jscsNotify));
  });
}

// Lint our source code
createLintTask('lint-src', ['src/**/*.js']);

// Lint our test code
createLintTask('lint-test', ['test/**/*.js']);

// Build two versions of the library
gulp.task('build', ['lint-src', 'clean'], function(done) {
  esperanto.bundle({
    base: 'src',
    entry: config.entryFileName,
  }).then(function(bundle) {
    var res = bundle.toUmd({
      sourceMap: true,
      sourceMapSource: config.entryFileName + '.js',
      sourceMapFile: exportFileName + '.js',
      name: config.exportVarName
    });

    // Write the generated sourcemap
    mkdirp.sync(destinationFolder);
    fs.writeFileSync(path.join(destinationFolder, exportFileName + '.js'), res.map.toString());

    $.file(exportFileName + '.js', res.code, { src: true })
      .pipe($.plumber())
      .pipe($.sourcemaps.init({ loadMaps: true }))
      .pipe($.babel({ blacklist: ['useStrict'] }))
      .pipe($.sourcemaps.write('./', {addComment: false}))
      .pipe(gulp.dest(destinationFolder))
      .pipe($.filter(['*', '!**/*.js.map']))
      .pipe($.rename(exportFileName + '.min.js'))
      .pipe($.sourcemaps.init({ loadMaps: true }))
      .pipe($.uglify())
      .pipe($.sourcemaps.write('./'))
      .pipe(gulp.dest(destinationFolder))
      .on('end', done);
  })
  .catch(done);
});

// Bundle our app for our unit tests
gulp.task('browserify', function() {
  var testFiles = glob.sync('./test/unit/**/*');
  var allFiles = ['./test/setup/browserify.js'].concat(testFiles);
  var bundler = browserify(allFiles);
  bundler.transform(babelify.configure({
    sourceMapRelative: __dirname + '/src',
    blacklist: ['useStrict']
  }));
  return bundler.bundle()
    .on('error', function(err){
      console.log(err.message);
      this.emit('end');
    })
    .pipe($.plumber())
    .pipe(source('./tmp/__spec-build.js'))
    .pipe(gulp.dest(''))
    .pipe($.livereload());
});

function test() {
  return gulp.src(['test/setup/node.js', 'test/unit/**/*.js'], {read: false})
    .pipe($.mocha({reporter: 'dot', globals: config.mochaGlobals}));
}

gulp.task('coverage', ['lint-src', 'lint-test'], function(done) {
  require('babel/register');
  gulp.src(['src/**/*.js'])
    .pipe($.istanbul({ instrumenter: isparta.Instrumenter }))
    .pipe($.istanbul.hookRequire())
    .on('finish', function() {
      return test()
      .pipe($.istanbul.writeReports())
      .on('end', done);
    });
});

// Lint and run our tests
gulp.task('test', ['lint-src', 'lint-test'], function() {
  require('babel/register');
  return test();
});

// Ensure that linting occurs before browserify runs. This prevents
// the build from breaking due to poorly formatted code.
gulp.task('build-in-sequence', function(callback) {
  runSequence(['lint-src', 'lint-test'], 'browserify', callback);
});

const watchFiles = ['src/**/*', 'test/**/*', 'package.json', '**/.eslintrc', '.jscsrc'];

// Run the headless unit tests as you make changes.
gulp.task('watch', function() {
  gulp.watch(watchFiles, ['test']);
});

// Set up a livereload environment for our spec runner
gulp.task('test-browser', ['build-in-sequence'], function() {
  $.livereload.listen({port: 35729, host: 'localhost', start: true});
  return gulp.watch(watchFiles, ['build-in-sequence']);
});

// An alias of test
// gulp.task('default', ['test']);

// The key to deploying as a single command is to manage the sequence of events.
gulp.task('default', function(callback) {
  return runSequence(
      ['run-hello-world'],
      callback
  );
});

gulp.task('run-hello-world', function() {

  //var params = {
  //  FunctionName: 'STRING_VALUE', /* required */
  //  ClientContext: 'STRING_VALUE',
  //  InvocationType: 'Event | RequestResponse | DryRun',
  //  LogType: 'None | Tail',
  //  Payload: new Buffer('...') || 'STRING_VALUE'
  //};
  //lambda.invoke(params, function(err, data) {
  //  if (err) console.log(err, err.stack); // an error occurred
  //  else     console.log(data);           // successful response
  //});
});
