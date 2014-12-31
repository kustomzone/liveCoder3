(function setupHTMLConsole() {

  var warn, error, log, errorHandler;

  (function addLogEl() {
    jQuery(function() {
      if (!jQuery.find("#log").length)
        jQuery("body").append('<div id="log" class="log"><div/>');
      if (!jQuery.find("#log-css").length){
        var url = jQuery('script[src$="html-console.js"]').attr("src").replace(/\.js$/, ".css")
        jQuery("head").append('<link id="log-css" href="' + url + '" rel="stylesheet" type="text/css"/>');
      }
    });
  })();

  (function installConsoleWrapper() {
    var c = window.console;
    warn = wrapperFunc(c, 'warn');
    error = wrapperFunc(c, 'error');
    log = wrapperFunc(c, 'log');
  })();

  (function installErrorCapture() {
    var errorHandler = (function errorHandler(errEvent, url, lineNumber, column, errorObj) {
      if (errEvent.stack) {
        var string = String(err.stack)
        console.error("%s", string.replace(/\n/g, ''));
      } else {
        var msg = errEvent.message,
            lineNumber = lineNumber || errEvent.lineno,
            column = column || errEvent.colno,
            url = url || errEvent.URL || errEvent.filename;
        console.error("%s  %s:%s", msg, url, lineNumber);
      }
    });
  
    window.addEventListener('error', errorHandler);
  })();

  function wrapperFunc(console, type) {
    if (!console["_" + type]) console["_" + type] = console[type];
    var orig = console["_" + type];
    
    console[type] = function consoleWrapper(/*args*/) {
      orig.apply(console, arguments);

      var string;
      if (typeof arguments[0] === 'object' && typeof lively !== "undefined" && lively.lang && lively.lang.obj) {
        string = lively.lang.obj.inspect(arguments[0], {maxDepth: 4});
      } else {
        string = String(arguments[0]);
        for (var i = 1; i < arguments.length; i++) {
          var idx = string.indexOf('%s');
          if (idx > -1) string = string.slice(0,idx) + String(arguments[i]) + string.slice(idx+2);
        }
      }

      if (console.ignoreLog && console.ignoreLog(type, string)) return;

      var el = jQuery("<div/>")
        .addClass("log-message")
        .addClass(type)
        .addClass("fresh")
        .prependTo("#log > div")
        .append("<span />")
          .text(string);
      setTimeout(el.removeClass.bind(el, "fresh"), 10*1000);
    }
  }  
}).call(window);
