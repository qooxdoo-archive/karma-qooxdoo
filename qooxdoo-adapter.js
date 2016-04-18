
(function(window) {
  var parser = window.document.createElement("a");

  var formatError = function (error) {
    var stack = error.stack;
    var message = error.message;

    if (stack) {
      var trace = [];
      var lines = stack.split("\n");
      if (message && stack.indexOf(message) === -1) {
        trace.push(message.trim());
      }
      lines.forEach(function(line, i) {
        var parts = /^[\t\s]*at\s([^\(]+)\s\((.+)\)$/.exec(line);
        if (!parts) {
          // firexfox stacktraces are different
          if (line.indexOf("@") > -1) {
            parts = line.split("@");
            // add empty item on index 0 to make parts compatible (url must be on index 2)
            parts.unshift("");
          } else {
            trace.push("\t"+line.trim());
            return;
          }
        }
        var errorLine = "\tat "+parts[1];

        if (parts[2].indexOf("/") > -1) {
          // strip down url
          var sourceLine = /^(.+):([0-9]+):([0-9]+)$/.exec(parts[2]);
          var urlString = sourceLine ? sourceLine[1] : parts[2];

          parser.href = urlString;
          errorLine += " -> " + parser.pathname.substring(1);
          if (sourceLine.length === 4 && sourceLine[2]) {
            errorLine += ":" + sourceLine[2]+":"+sourceLine[3];
          }
        } else {
          errorLine += " -> ("+parts[2]+")";
        }
        trace.push(errorLine);
      });

      return trace.join("\n");
    }
    return message;
  };

  var createQooxdooStartFn = function(tc) {

    return function () {

      var suiteResults = {};
      var totalTests;
      var testCount;
      var testList = [];
      var testResult;
      var currentTest;

      var runNext = function() {
        if (currentTest && currentTest.getTestClass().getSandbox) {
          var results = suiteResults[currentTest.getFullName()];
          if (results.status === "failure" || results.status === "error") {
            // restore sandbox on failed tests, because if the test is using spies/stubs/mockups
            // which have been initialized + restored inside the test function and not in setUp/tearDown
            // the restore part might not have been executed
            currentTest.getTestClass().getSandbox().restore();
          }
        }
        currentTest = testList.shift();

        setTimeout(function() {
          currentTest.run(testResult);
        }, 5);
      };

      var addListeners = function(testResult) {
        testResult.addListener("startTest", function(e) {
          var testName = e.getData().getFullName();
          // if we aready have a result, this is a resumed async test
          if (!suiteResults[testName]) {
            suiteResults[testName] = {
              startTime: Date.now(),
              exceptions: []
            };
          } else if (suiteResults[testName].status !== "wait") {
            // test was executed before, clear old exceptions
            suiteResults[testName].exceptions = [];
          }
          suiteResults[testName].status = "startTest";
        });

        testResult.addListener("failure", function(e) {
          e.getData().forEach(function(errMap) {
            var suiteResult = suiteResults[errMap.test.getFullName()];
            suiteResult.status = "failure";
            suiteResult.exceptions.push(formatError(errMap.exception));
          });
        });

        testResult.addListener("error", function(e) {
          e.getData().forEach(function(errMap) {
            window.console.warn(errMap.test.getFullName() + " : Unexpected exception");

            var suiteResult = suiteResults[errMap.test.getFullName()];
            suiteResult.status = "error";
            suiteResult.exceptions.push(formatError(errMap.exception));
          });
        });

        testResult.addListener("skip", function(e) {
          e.getData().forEach(function(errMap) {
            window.console.warn(errMap.test.getFullName() + " skipped: " + errMap.exception.toString());

            var suiteResult = suiteResults[errMap.test.getFullName()];
            suiteResult.status = "skip";
            suiteResult.exceptions.push(formatError(errMap.exception));
          });
        });

        testResult.addListener("wait", function(e) {
          var testName = e.getData().getFullName();

          suiteResults[testName].status = "wait";
        });

        testResult.addListener("endTest", function(e) {
          testCount--;
          var testName = e.getData().getFullName();

          var suiteResult = suiteResults[testName];

          var log = suiteResult.exceptions.map(function(ex) {
            return ex.toString();
          });

          var suite, description;
          var match = /(.*?)\.([a-zA-Z]+:.*)/.exec(testName);
          if (match) {
            suite = [match[1]];
            description = match[2];
          } else {
            suite = [];
            description = testName;
          }
          var skipped = suiteResult.status === "skip";
          var success = suiteResult.status === "startTest";

          var result = {
            id : (totalTests-testCount),
            description: description,
            suite: suite,
            success: success,
            skipped: skipped,
            log: success ? [] : log,
            time: skipped ? 0 : Date.now() - suiteResult.startTime,
            assertionErrors: log
          };

          tc.result(result);

          if (testCount === 0) {
            tc.complete({
              coverage: window.__coverage__
            });
          } else {
            runNext();
          }
        });
      };

      window.onload = function() {
        qx.event.Timer.once(function() {
          var loader = qx.core.Init.getApplication();

          var classes = loader.getSuite().getTestClasses();

          var filter = window.__karma__.config.testClass ? window.__karma__.config.testClass : null;

          for (var i=0; i<classes.length; i++) {

            if (!filter || classes[i].getName().startsWith(filter)) {
              var methods = classes[i].getTestMethods();
              for (var j = 0; j < methods.length; j++) {
                testList.push(methods[j]);
              }
            }
          }
          totalTests = testCount = testList.length;
          tc.info({
            total: totalTests
          });
          testResult = new qx.dev.unit.TestResult();
          addListeners(testResult);

          // start the queue
          runNext();
        }, this, 0);
      };
    };
  };

  window.__karma__.start = createQooxdooStartFn(window.__karma__);

})(window);
