const gulp = require('gulp');

const $ = require('gulp-load-plugins')();
const fs = require('fs');
const del = require('del');
// New requires
const gutil = require('gulp-util');
const rename = require('gulp-rename');
const install = require('gulp-install');
const zip = require('gulp-zip');
const gcallback = require('gulp-callback');
const AWS = require('aws-sdk');
const readdir = require('readdir-plus');
const async = require('async');

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



// Adding in https://medium.com/@AdamRNeary/a-gulp-workflow-for-amazon-lambda-61c2afd723b6
//   also https://medium.com/@AdamRNeary/developing-and-testing-amazon-lambda-functions-e590fac85df4

// Here we want to install npm packages to dist, ignoring devDependencies.
gulp.task('npm', function() {
  gulp.src('./lambda/hello-world/package.json')
      .pipe(gulp.dest('./dist/'))
      .pipe(install({production: true}));
});

// The js task could be replaced with gulp-coffee as desired.
//gulp.task('js', function() {
//
//  // this is where I am moving the source file
//  gulp.src('./lambda/hello-world/index.js')
//      .pipe(gulp.dest('dist/'));
//});

// Next copy over environment variables managed outside of source control.
gulp.task('env', function() {
  gulp.src('./config.env.production')
      .pipe(rename('.env'))
      .pipe(gulp.dest('./dist'));
});

// Now the dist directory is ready to go. Zip it.
gulp.task('zip', function(onComplete) {
  function handleFolder(folder, onFolderComplete) {
    const zipLocation = __dirname + "/dist";
    const zipName = folder.basename + '.zip';
    const thesrc = ['**/*'];
    gulp.src(['dist/hello-josh/**/*'])
      .pipe(zip(zipName))
      .pipe(gulp.dest('dist'))
      .pipe(gcallback(onFolderComplete));
  }

  getLambdasDistribution(function(lambdaFolders) {
    async.each(lambdaFolders, handleFolder, function(err){
      // if any of the file processing produced an error, err would equal that error
      if( err ) {
        gutil.log('Failed to build lambda javascript', err);
      }
      onComplete();
    });
  });

  return;
});

// Per the gulp guidelines, we do not need a plugin for something that can be
// done easily with an existing node module. #CodeOverConfig
//
// Note: This presumes that AWS.config already has credentials. This will be
// the case if you have installed and configured the AWS CLI.
//
// See http://aws.amazon.com/sdk-for-node-js/
gulp.task('upload', function(onComplete) {

  // TODO: This should probably pull from package.json
  AWS.config.region = 'us-east-1';
  var lambda = new AWS.Lambda();

  function handleZip(zipFile, onFolderComplete) {
    var functionName = zipFile.basename;
    var zipPath = './dist/' + functionName + '.zip'

    gutil.log('Push: ', zipFile);
    lambda.getFunction({FunctionName: functionName}, function(err, data) {
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
      var params = {
        FunctionName: functionName
      };

      gutil.log('lambda params:', params);

      fs.readFile(zipPath, function(err, data) {
        params['ZipFile'] = data;

        lambda.updateFunctionCode(params, function(err, data) {
          if (err) {
            var warning = 'Package upload failed. '
            warning += 'Check your iam:PassRole permissions.'
            gutil.log(warning, err);
          }
          onFolderComplete();
        });
      });
    });
  }

  getLambdasZipFiles(function(zips) {
    async.each(zips, handleZip, function(err){
      // if any of the file processing produced an error, err would equal that error
      if( err ) {
        gutil.log('Failed to build lambda javascript', err);
      }
      onComplete();
    });
  });
});

// Heading Back to the template Adding in https://github.com/babel/babel-library-boilerplate

// Remove the built files
gulp.task('clean', function(onComplete) {
  del([destinationFolder], function() {
    // from gulp workflow
    del('./dist',
      del('./archive.zip', onComplete)
    );
  });
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

function getLambdas(onComplete) {
  var options = {
    recursive: false,
    filter: {
      directory: true
    }
  };

  readdir(config.lambdaPath, options, function (err, files) {
    files.filter(function(file) {
      return file.type === 'directory';
    });
    onComplete(files);
  });
}

function getLambdasDistribution(onComplete) {
  var options = {
    recursive: false,
    filter: {
      directory: true
    }
  };

  readdir("./dist", options, function (err, files) {
    files.filter(function(file) {
      return file.type === 'directory';
    });
    onComplete(files);
  });
}

function getLambdasZipFiles(onComplete) {
  var options = {
    recursive: false,
    filter: {
      directory: false
    }
  };

  readdir("./dist", options, function (err, files) {
    onComplete(files);
  });
}

// transpile
function bundleSource(name, base, entry, done) {

  const exportFileName = path.basename(config.lambdaEntryFile, path.extname(entry));
  gutil.log('exportFileName -->', exportFileName);

  esperanto.bundle({
    base: base,
    entry: entry,
  }).then(function (bundle) {
    var res = bundle.toUmd({
      sourceMap: true,
      sourceMapSource: entry + '.js',
      sourceMapFile: entry + '.js',
      name: config.exportVarName
    });

    // Write the generated sourcemap
    mkdirp.sync(destinationFolder);
    const workingFolder = path.join(destinationFolder, name);
    mkdirp.sync(workingFolder);

    var outfileName = path.join(workingFolder, exportFileName + '.js')
    // gutil.log("path it-->", res.map.toString());
    fs.writeFileSync(outfileName, res.map.toString());

    $.file(exportFileName + '.js', res.code, {src: true})
      .pipe($.plumber())
      .pipe($.sourcemaps.init({loadMaps: true}))
      .pipe($.babel({blacklist: ['useStrict']}))
      .pipe($.sourcemaps.write('./', {addComment: false}))
      .pipe(gulp.dest(workingFolder))
      .pipe($.filter(['*', '!**/*.js.map']))
      // We will use webpack to do mins and uglify
      //.pipe($.rename(exportFileName + '.min.js'))
      //.pipe($.sourcemaps.init({loadMaps: true}))
      //.pipe($.uglify())
      //.pipe($.sourcemaps.write('./'))
      .pipe(gulp.dest(workingFolder))
      .on('end', done);
    })
    .catch(done);
}
gulp.task('build', ['lint-src', 'clean'], function(done) {
  getLambdas(function(lambdaFolders) {

    function handleFolder(folder, onFolderComplete) {
      const name = folder.basename;
      const base = path.join(config.lambdaPath, folder.basename);
      const entry = config.lambdaEntryFile;

      bundleSource(name, base, entry, onFolderComplete);
    }

    async.each(lambdaFolders, handleFolder, function(err){
      // if any of the file processing produced an error, err would equal that error
      if( err ) {
        gutil.log('Failed to build lambda javascript', err);
      }
      done();
    });

  });

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
    ['clean'],
    ['npm', 'env'],
    ['build'],
    ['zip'],
    ['upload'],
    callback
  );
});


