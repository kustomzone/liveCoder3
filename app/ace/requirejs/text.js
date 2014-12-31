
/*
 * Extremely simplified version of the requireJS text plugin
 */
 
(function() {
    
var globalRequire = typeof require != "undefined" && require;
if (typeof define !== "function") // running in webpack
    return module.exports = function(source) { return source; };

define(function (require, exports, module) {
    "use strict";
    if (globalRequire && globalRequire.nodeRequire) {
        module.exports = globalRequire.nodeRequire(require.toUrl("./text_build"));
    } else {
        exports.load = function(name, req, onLoad, config) {    
            require("../lib/net").get(req.toUrl(name), onLoad);
        };
    }
});

})();
