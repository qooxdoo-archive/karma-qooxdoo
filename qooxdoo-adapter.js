
(function(window) {
  var parser = window.document.createElement("a");

  var formatStrackTrace = function(trace) {
    var newTrace = [];
    trace.forEach(function(line) {
      var sourceLine = /^(.+):([0-9]+):([0-9]+)$/.exec(line);
      if (!sourceLine) {
        return;
      }
      var urlString = sourceLine ? sourceLine[1] : line;
      parser.href = urlString;
      var newLine = "\t"+parser.pathname.substring(1);
      if (sourceLine && sourceLine.length === 4 && sourceLine[2]) {
        newLine += ":" + sourceLine[2]+":"+sourceLine[3];
      }
      newTrace.push(newLine);
    });
    return newTrace;
  };

  var formatError = function (error) {
    var trace = [];
    if (error instanceof qx.core.AssertionError) {
      trace = error.getStackTrace();
      trace.unshift(error.getComment()+": "+error.message);
    } else {
      trace = qx.dev.StackTrace.getStackTraceFromError(error);
      trace.unshift(error.message);
    }
    return trace.join("\n\t");
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
        if (currentTest) {
          var results = suiteResults[currentTest.getFullName()];
          if (results && (results.status === "failure" || results.status === "error")) {
            if (currentTest.getTestClass().getSandbox) {
              // restore sandbox on failed tests, because if the test is using spies/stubs/mockups
              // which have been initialized + restored inside the test function and not in setUp/tearDown
              // the restore part might not have been executed
              currentTest.getTestClass().getSandbox().restore();
            }
          }
        }
        currentTest = testList.shift();

        setTimeout(function runTest() {
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
        setTimeout(function() {
          var loader = qx.core.Init.getApplication();

          var classes = loader.getSuite().getTestClasses();

          var filters = window.__karma__.config.testClass ? new qx.data.Array(window.__karma__.config.testClass.split(",")) : null;

          for (var i=0; i<classes.length; i++) {
            var skip = true;
            if (filters) {
              filters.some(function(filter) {
                if (classes[i].getName().startsWith(filter)) {
                  skip = false;
                  return true;
                }
              })
            } else {
              skip = false;
            }

            if (skip === false) {
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

          qx.dev.StackTrace.FORMAT_STACKTRACE = formatStrackTrace;

          // start the queue
          runNext();
        }, 0);
      };
    };
  };

  window.__karma__.start = createQooxdooStartFn(window.__karma__);

})(window);
