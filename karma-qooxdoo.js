var fs = require("fs");
var path = require('path');

var qooxdooProxies = {};

var createPattern = function(file, included, served, watched) {
  return {
    pattern  : file,
    included : typeof included === "boolean" ? included : true,
    served   : typeof served === "boolean" ? served : true,
    watched  : typeof watched === "boolean" ? watched : false
  }
};

var initQooxdoo = function(logger, config, customFilehandlers) {
  var log = logger.create('framework.qooxdoo');
  var files = config.files;
  var basePath = config.basePath;

  // if the jasmine framework is used, we use the jasmine test runner
  var testRunner = config.frameworks.indexOf("jasmine") > -1 ? "jasmine" : "qooxdoo";

  var includeFiles = false;
  for (var pre in config.preprocessors) {
    config.preprocessors[pre].forEach(function(prePro){
      if (prePro === 'coverage') {
        includeFiles = true;
        return;
      }
    });
    if (includeFiles === true) {
      break;
    }
  }

  var qooxdooCustomFileHandler = function (request, response) {
    var url = request.url;
    var normalizedPath = url.indexOf('?') > -1 ? url.substring(0, url.indexOf('?')) : url;
    for (var proxy in qooxdooProxies) {
      if (normalizedPath.startsWith(proxy)) {
        normalizedPath = path.join(qooxdooProxies[proxy],normalizedPath.substring(proxy.length));
        break;
      }
    }
    var content = fs.readFileSync(normalizedPath);
    response.writeHead(200);
    response.end(content);
  };

  // hard coded proxy as it is always needed
  qooxdooProxies['/script'] = path.join(basePath,'test','script');

  var testsSourceFile = '';
  var errorMessage = '';
  var relPath = ''
  var included = false;

  if (config.qooxdooFramework && config.qooxdooFramework.testSources === true) {
    // testing sources => add source files to the server
    switch (testRunner) {
      case "jasmine":
        errorMessage = "Aborted due to missing sources.\n" + "please run ./generate.py source\n";
        testsSourceFile = path.resolve(basePath, path.join('source','script','cv.js'));
        relPath = "source";
        includeFiles = true;
        included = true;
        break;

      default: // qooxdoo testrunner
        testsSourceFile = path.resolve(basePath, path.join('test','script','tests-source.js'));
        errorMessage = "Aborted due to missing test sources.\n" + "please run ./generate.py test-source\n";
        relPath = path.join('test','html');
        break;
    }
    if (!fs.existsSync(testsSourceFile)) {
      log.error("Aborted due to missing test sources.\n" + "please run ./generate.py test-source\n");
      process.exit();
    }

    var source = fs.readFileSync(testsSourceFile).toString();
    var qx = {};


    // read libinfo
    matches = source.match("var libinfo = {(.*)};\n");
    eval("qx.$$libraries = {" + matches[1] + "};");

    // read loader settings
    matches = source.match(/qx\.\$\$loader = {\n((.|\n)+)(?=^};$\n\n)/m);
    eval("var loader = qx.$$loader = { " + matches[1] + " };");
    qx.$$loader.addNoCacheParam = false;

    // load project files
    var uris = loader.decodeUris(loader.packages[loader.parts[loader.boot][0]].uris).reverse();
    uris.forEach(function(uri) {

      // uris are relative to the test/html directory
      var absolutePath = path.resolve(basePath, relPath, uri);
      var relativePath = absolutePath.startsWith(basePath) ? absolutePath.replace(basePath, "") : null;

      if (includeFiles) {
        files.unshift(createPattern(absolutePath, included, true, config.autoWatch));
      }

      if (relativePath) {
        // proxy to base
        var source = relativePath.split(path.sep)[1];
        var target = path.join(basePath,source);
        if (testRunner === "qooxdoo" && !qooxdooProxies["/"+source]) {
          qooxdooProxies["/"+source] = target;
        }
      }
      else {
        var parts = uri.split(path.sep);
        var part = parts.shift();
        while (part === "..") {
          part = parts.shift();
        }
        if (testRunner === "qooxdoo" && !qooxdooProxies["/"+part]) {
          qooxdooProxies["/"+part] = absolutePath.substring(0, absolutePath.indexOf(part) + part.length);
        }
      }
    });

    files.unshift(createPattern(testsSourceFile));

    // loads urisBefore
    var matches = source.match(/\s*urisBefore : \[(.*)\],\n/);
    eval("var urisBefore = ["+matches[1]+"]");
    urisBefore.reverse();
    urisBefore.forEach(function(uri) {
      if (includeFiles) {
        files.unshift(createPattern(path.join(basePath, 'source', uri), included));
      }
      var source = uri.split(path.sep)[0];
      if (testRunner === "qooxdoo" && !qooxdooProxies["/"+source]) {
        qooxdooProxies["/"+source] = path.join(basePath,'source',source);
      }
    });

    if (includeFiles === false) {
      for (var source in qooxdooProxies) {
        customFilehandlers.push({
          urlRegex : new RegExp("^" + source + ".*$"),
          handler  : qooxdooCustomFileHandler
        });
      }
    }
  }
  else {
    testsSourceFile = path.resolve(basePath, path.join('test','script','tests.js'));
    if (!fs.existsSync(testsSourceFile)) {
      log.error("Aborted due to missing tests.\n" + "please run ./generate.py test\n");
      process.exit();
    }
    files.push(createPattern(testsSourceFile));
  }
  if (testRunner === "qooxdoo") {
    files.push(createPattern(path.resolve(__dirname, "qooxdoo-adapter.js")));
  }
};

initQooxdoo.$inject = ['logger', 'config', 'customFileHandlers'];

module.exports = {
  'framework:qooxdoo' : ['factory', initQooxdoo]
};
