var initQooxdoo = function(files) {
  files.unshift({
    pattern: __dirname + "/qooxdoo-adapter.js",
    included: true,
    served: true,
    watched: false
  });
};

initQooxdoo.$inject = ['config.files'];

module.exports = {
  'framework:qooxdoo': ['factory', initQooxdoo]
};
