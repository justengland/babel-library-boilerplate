var readdir = require('readdir-plus');
var fs = require('fs');
var lambdaPath = './lambda/';
var options = {
  recursive: false,
  filter: {
    directory: true
  }
};

function getLambdas(onComplete) {
  readdir(lambdaPath, options, function (err, files) {
    files.filter(function(file) {
      return file.type === 'directory';
    });
    onComplete(files);
  });
}

function bundle(path, onComplete) {
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

    $.file(exportFileName + '.smart.js', res.code, { src: true })
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
      .on('end', onComplete);
  })
  .catch(done);
}




