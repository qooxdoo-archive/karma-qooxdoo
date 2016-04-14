(function(window) {
  var formatError = function (error) {
    var stack = error.stack;
    var message = error.message;

    if (stack) {
      if (message && stack.indexOf(message) === -1) {
        stack = message + '\n' + stack
      }
      return stack;
    }

    return message;
  };

  var createQooxdooStartFn = function(tc) {

    return function () {

      var suiteResults = {};
      var totalTests;
      var testCount;

      var getTestList = function(testDesc) {
        var list = [];
        testDesc.forEach(function(testClass) {
          list = list.concat(testClass.tests);
        });
        return list;
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
            suiteResult.exceptions.push(errMap.exception);
          });
        });

        testResult.addListener("skip", function(e) {
          e.getData().forEach(function(errMap) {
            window.console.warn(errMap.test.getFullName() + " skipped: " + errMap.exception.toString());

            var suiteResult = suiteResults[errMap.test.getFullName()];
            suiteResult.status = "skip";
            suiteResult.exceptions.push(errMap.exception);
          });
        });

        testResult.addListener("wait", function(e) {
          var testName = e.getData().getFullName();

          //window.console.debug(testName + " wait");
          suiteResults[testName].status = "wait";
        });

        testResult.addListener("endTest", function(e) {
          testCount--;
          var testName = e.getData().getFullName();
          //window.console.debug(testName, "endTest");

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

          var result = {
            id : (totalTests-testCount),
            description: description,
            suite: suite,
            success: (suiteResult.status == "startTest"),
            skipped: suiteResult.status == "skip",
            log: log,
            time: Date.now() - suiteResult.startTime
          };

          tc.result(result);
          if (testCount == 0) {
            tc.info({ total: totalTests });
            tc.complete({
              coverage: window.__coverage__
            });
          }
        });
      };

      window.onload = function() {
        qx.event.Timer.once(function() {
          var loader = qx.core.Init.getApplication();

          var testDesc = JSON.parse(loader.getTestDescriptions());

          var testList = getTestList(testDesc);
          totalTests = testCount = testList.length;
          tc.info({total: totalTests});

          var testResult = new qx.dev.unit.TestResult();
          addListeners(testResult);
          loader.getSuite().runAsync(testResult);
        }, this, 0);
      };
    };
  };

  window.__karma__.start = createQooxdooStartFn(window.__karma__);

})(window);
