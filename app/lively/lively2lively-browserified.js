(function e(t,n,r){function s(o,u){if(!n[o]){if(!t[o]){var a=typeof require=="function"&&require;if(!u&&a)return a(o,!0);if(i)return i(o,!0);var f=new Error("Cannot find module '"+o+"'");throw f.code="MODULE_NOT_FOUND",f}var l=n[o]={exports:{}};t[o][0].call(l.exports,function(e){var n=t[o][1][e];return s(n?n:e)},l,l.exports,e,t,n,r)}return n[o].exports}var i=typeof require=="function"&&require;for(var o=0;o<r.length;o++)s(r[o]);return s})({1:[function(require,module,exports){
var Connection = require('./lib/browser-client').Connection,
    url        = require("url"),
    services   = require('./lib/default-services'),
    lv         = require('./lib/browser-lively-interface').noConflict('lv');

var l2l = lv.l2l || {

    session: null,

    connect: function connect(options, thenDo) {
        options = options || {};
    
        var baseURL    = options.baseURL || "http://localhost:9001/",
            connectURL = url.resolve(baseURL, "nodejs/SessionTracker/connect"),
            name       = options.name || "browser-alien",
            session    = l2l.session = new Connection({
                sessionTrackerURL: connectURL,
                username: name,
                getSessionsCacheInvalidationTimeout: 10*1000
            });
    
        document.addEventListener('onbeforeunload', l2l.disconnect);
        session.reactTo('closed', function() {
            document.removeEventListener('onbeforeunload', l2l.disconnect); })
    
        session.register();
        session.openForRequests();
        session.whenOnline(function() {
            session.addActions(services);
            thenDo && thenDo(null, session);
        });
    },

    disconnect: function() {
        var s = l2l.session;
        if (s) { s.unregister(); l2l.session = null; }
    }
}

// currently supported:
// baseURL, name, autoload
function optionsFromScript() {
    var scriptName = "lively2lively-browserified.js",
        options = {},
        scripts = document.getElementsByTagName('script'),
        l2lScripts = [],
        script;

    for (var i = 0; i < scripts.length; i++) {
        var src = scripts[i].src;
        if (src.indexOf(scriptName) !== -1) l2lScripts.push(scripts[i]);
    }

    if (l2lScripts.length === 0) {
        console.warn('Could not find lively2lively script file for option extraction.');
    } else if (l2lScripts.length >= 2) {
        console.warn('Found multiple lively2lively script files when extracting options. Using the last one.');
        script = l2lScripts[l2lScripts.length-1];
    } else { script = l2lScripts[0]; }

    if (!script) return options;

    var optionsMatch = script.src.match(/\?(.*)/);
    if (!optionsMatch || !optionsMatch[1]) return options;
    optionsMatch[1].split('&').forEach(function(opt) {
        var kv = opt.split('=');
        options[kv[0]] = kv[1] && kv[1] === 'false' ? false : kv[1];
    });

    return options;
}

function dealWithExistingL2lSession() {
    if (!l2l.session || !l2l.session.isConnected()) return;
    console.warn("Found exisiting l2l connection. Deactivating it...");
    lv.l2l.disconnect();
}

(function autoload() {
    dealWithExistingL2lSession();
    var options = optionsFromScript();
    if (options.autoload === false) return;
    l2l.connect(options, function(err, session) {
        if (err) { console.error("Failed to load Lively2Lively: %s", err); return; }
        session._options = options;
        console.log('Lively2Lively connected with id %s', session.sessionId);
    });
})();

// -=-=-=-
// exports
// -=-=-=-

module.exports = lv.l2l = l2l;

},{"./lib/browser-client":3,"./lib/browser-lively-interface":5,"./lib/default-services":7,"url":15}],2:[function(require,module,exports){
var util         = require('util'),
    i            = util.inspect;

// -=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-
// helper
// -=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-
function uuid() { // helper
    var id = 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function(c) {
        var r = Math.random()*16|0, v = c == 'x' ? r : (r&0x3|0x8); return v.toString(16); }).toUpperCase();
    return id;
}

var debugThreshold = 1;
function log(/*level, msg, arguments*/) {
    // the smaller logLevel the more important the message
    var args = Array.prototype.slice.call(arguments);
    var logLevel = typeof args[0] === 'number' ? args.shift() : 1;
    if (logLevel > debugThreshold) return;
    console.log.apply(console, args);
}

// -=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-
// lively-json callback support
// -=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-
function addCallback(sender, msg, callback) {
    if (!callback) return;
    if (typeof msg === 'string') {
        console.warn('Websocket message callbacks are only supported for JSON messages!');
        return;
    }
    if (!sender._messageOutCounter) sender._messageOutCounter = 0;
    if (!sender.callbacks) sender.callbacks = {};
    msg.messageIndex = ++sender._messageOutCounter;
    msg.messageId = msg.messageId || 'lively-msg:' + uuid();
    var callbacks = sender.callbacks[msg.messageId] = sender.callbacks[msg.messageId] || [];
    callbacks.push(callback);
    // log(this.debugLevel, 'adding callback %s for sender %s. Message:', callback, sender, msg);
}

function triggerActions(receiver, connection, msg) {
    if (!receiver) {
        console.warn('no receiver for msg ', msg);
        return;
    }
    try {
        if (receiver.emit) receiver.emit('lively-message', msg, connection);
    } catch(e) {
        console.error('Error when dealing with %s requested from %s:\n%s',
            msg.action, msg.sender, e.stack);
    }
}

function triggerCallbacks(receiver, msg) {
    var expectMore = !!msg.expectMoreResponses,
        responseId = msg.inResponseTo,
        callbacks = responseId && receiver.callbacks && receiver.callbacks[responseId];
    // log(this.debugLevel, 'triggering callbacks for message:', receiver.callbacks, msg);
    if (!callbacks) return;
    callbacks.forEach(function(cb) {
        try { cb(msg, expectMore); } catch(e) { console.error('Error in websocket message callback:\n', e); }
    });
    if (!expectMore) callbacks.length = 0;
}

function onLivelyJSONMessage(receiver, connection, msg) {
    if (typeof msg === 'string') { try { msg = JSON.parse(msg); } catch(e) { return; } }
    var action = msg.action, sender = msg.sender;
    if (!action) return;
    log(receiver.debugLevel+1, '\n%s received %s from %s %s\n',
        receiver, action, sender,
        msg.messageIndex ? '('+msg.messageIndex+')':'',
        msg);
    if (receiver.requiresSender && !sender) { console.error('%s could not extract sender from incoming message %s', receiver, i(msg)); return; }
    if (!action) { console.warn('%s could not extract action from incoming message %s', receiver, i(msg)); }
    if (msg.inResponseTo) triggerCallbacks(receiver, msg);
    else triggerActions(receiver, connection, msg);
}

function sendLivelyMessage(sender, connection, msg, callback) {
    try {
        addCallback(sender, msg, callback);
        if (msg.action) log(sender.debugLevel+1, '\n%s sending: %s to %s\n', sender, msg.action, connection.id || 'unknown', msg);
        if (typeof msg !== 'string') {
            if (sender.sender && !msg.sender) msg.sender = sender.sender;
            if (!msg.messageId) msg.messageId = 'lively-msg:' + uuid();
            msg = JSON.stringify(msg);
        }
        var sendMethod;
        if (connection._send) sendMethod = '_send'; // we wrapped it
        else if (connection.sendUTF) sendMethod = 'sendUTF';
        else sendMethod = 'send';
        return connection[sendMethod](msg);
    } catch(e) {
        console.error('Send with %s failed: %s', sender, e);
    }
    return false;
}


// -=-=-=-
// exports
// -=-=-=-

module.exports = {
    sendLivelyMessage: sendLivelyMessage,
    onLivelyJSONMessage: onLivelyJSONMessage,
    uuid: uuid,
    log: log
};

},{"util":17}],3:[function(require,module,exports){
var util         = require('util'),
    i            = util.inspect,
    f            = util.format,
    EventEmitter = require('events').EventEmitter;

var base = require('./base'),
//     sendLivelyMessage = base.sendLivelyMessage,
//     onLivelyJSONMessage = base.onLivelyJSONMessage,
    log = base.log,
    uuid = base.uuid;

var signal, listen, unlisten;

function extend(origin, add) {
  // Don't do anything if add isn't an object
  if (!add || typeof add !== 'object') return origin;

  var keys = Object.keys(add);
  var i = keys.length;
  while (i--) {
    origin[keys[i]] = add[keys[i]];
  }
  return origin;
}

if (typeof lively !== "undefined" && typeof lively.bindings !== "undefined") {
    signal = function(emitter, type, evt) {
        lively.bindings.signal(emitter, type, evt);    
    }
    
    listen = function(emitter, type, listener, action, options) {
        lively.bindings.connect(emitter, type, listener, action, options);
    }
    
    unlisten = function(from, type, to, action) {
        lively.bindings.disconnect(from, type, to, action);
    }
} else {

    var registry = [];

    function findConnections(emitter, type, target, action, isOnce) {
        return registry.filter(function(entry) {
            return entry[0] === emitter
                && entry[1] === type
                && entry[2] === target
                && entry[3] === action
                && entry[4] === isOnce
        });
    }

    function hasConnection(emitter, type, target, action, isOnce) {
        return findConnections(emitter, type, target, action, isOnce).length > 0;
    }

    function removeConnections(emitter, type, target, action, isOnce) {
        var cs = findConnections(emitter, type, target, action, isOnce);
        cs.forEach(function(c) {
            registry.splice(registry.indexOf(c), 1);
            c[0].removeListener(c[1], c[5]);
        });
    }

    signal = function(emitter, type, evt) {
        emitter.emit(type, evt);
    }
    
    var listenerFuncs = {};
    listen = function(emitter, type, listener, action, options) {
        var once = options && (options.removeAfterUpdate || options.once);
        removeConnections(emitter, type, listener, action, once);
        var listenFunc = function(evt) {
            console.log('fired %s -> %s.%s', type, listener, action);
            listener[action](evt);
        }
        registry.push([emitter, type, listener, action, once, listenFunc]);
        emitter[once ? 'once' : 'on'](type, listenFunc)
    }
    
    unlisten = function(emitter, type, listener, action) {
        removeConnections(emitter, type, listener, action, false);
    }
}

// -=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-
function WebSocketHelper(url, options) {
// -=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-
    options = options || {}
    EventEmitter.call(this);
    this.initialize(url, options);
    // this.url = url;
    // this.protocol = options.protocol;
    // this.sender = options.sender || null;
    // this.setupClient();
    // this.debugLevel = options.debugLevel !== undefined ?  options.debugLevel : 1;
}

util.inherits(WebSocketHelper, EventEmitter);

(function() {

// -=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-
// properties

    this.CONNECTING     = 0,
    this.OPEN           = 1,
    this.CLOSING        = 2,
    this.CLOSED         = 3,
    this.doNotSerialize = ['socket', 'callbacks']

// -=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-
// initializing

    this.initialize = function(uri, options) {
        options = options || {};
        uri = uri.isURL ? uri.toString() : uri;
        uri = uri.replace(/^http/, 'ws');
        this.uri = uri;
        this._erroredCount = 0;
        this._openedCount = 0;
        this._closedCount = 0;
        this._messageOutCounter = 0;
        this._messageInCounter = 0;
        this._lastMessagesOut = [];
        this._lastMessagesIn = [];
        this._lastErrors = [];
        this.socket = null;
        this.reopenClosedConnection = options.enableReconnect || false;
        this._open = false;
        this.sendTimeout = options.timeout || 3 * 1000; // when to stop trying to send
        this.messageQueue = [];
        this.callbacks = {};
        this.protocol = options.protocol ? options.protocol : null;
    }

    this.onrestore = function() {
        this.callbacks = {};
        this._open = false;
    }

    this.enableReconnect = function() { this.reopenClosedConnection = true; }

    this.disableReconnect = function() { this.reopenClosedConnection = false; }

// -=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-
// events

    this.signal = function(type, evt) {
        signal(this, type, evt);
    }

    this.onError = function(evt) {
        this._erroredCount++;
        this._lastErrors = this._lastErrors.concat(evt.message || evt).slice(-3);
        console.log('%s got error %s', this, evt.data ? evt.data : evt);
        this.signal('error', evt);
    }

    this.onOpen = function(evt) {
        this._openedCount++;
        this._open = true;
        this.deliverMessageQueue();
        this.signal('opened', evt);
    }

    this.onClose = function(evt) {
        this._closedCount++;
        this.signal('closed', evt);
        // reopen makes only sense if connection was open before
        if (this._open && this.reopenClosedConnection) this.connect();
        else this._open = false;
    }

    this.onMessage = function(evt) {
        this._messageInCounter++;
        this._lastMessagesIn = this._lastMessagesIn.concat(evt.data).slice(-3);
        this.signal('message', evt.data);
        if (this.protocol !== 'lively-json') return;
        var msg;
        try {
            msg = JSON.parse(evt.data);
        } catch(e) {
            console.warn(log('%s failed to JSON parse message and dispatch %s: %s', this, evt.data, e));
            return;
        }
        msg && this.onLivelyJSONMessage(msg);
    }

    this.onLivelyJSONMessage = function(msg) {
        // the lively-json protocol. Messages should be valid JSON in the form:
        // msg = {
        //   messageId: NUMBER|STRING, // optional identifier of the message
        //   action: STRING, // will specify what the receiver should do with
        //                   // the message. Might be used as the key/name for
        //                   // signaling data bindings or emitting events
        //   data: OBJECT, // the payload of the message
        //   sender: STRING, // sender id
        //   target: STRING, // target id
        //   [inResponseTo: NUMBER|STRING,] // optional identifier of a message
        //                                  // that this message answers
        //   [expectMoreResponses: BOOL,] // if this is an answer then this can
        //                                // this can be true and the answer
        //                                // callback will be trigered multiple
        //                                // times, "streaming response"
        //   [messageIndex: NUMBER,]  // Optional, might go away Really Soon,
        //                           // currently used for debugging
        //   [route: ARRAY]  // Ids(?) of websocket handlers that routed this
        //                   // msg
        // }
        var responseId = msg.inResponseTo;
        if (responseId) { // it is a message that is an answer
            var callbacks = responseId && this.callbacks[responseId];
            if (!callbacks) return;
            var expectMore = !!msg.expectMoreResponses;
            callbacks.forEach(function(cb) {
                try {
                    cb(msg, expectMore);
                } catch(e) {
                    console.error(log('Error in websocket message callback\n%s', e.stack || e));
                }
            });
            if (!expectMore) callbacks.length = 0;
        } else { // an initiating message
            this.signal('lively-message', msg);
        }
    }


// -=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-
// network

    this.isOpen = function() { return this.socket && this.socket.readyState === this.OPEN; }

    this.isConnecting = function() { return this.socket && this.socket.readyState === this.CONNECTING; }

    this.isClosed = function() { return !this.socket || this.socket.readyState >= this.CLOSING; }

    this.connect = function() {
        if (this.isOpen() || this.isConnecting()) return this;
        if (this.socket) this.socket.close();
        var self = this;
        this.socket = extend(new WebSocket(this.uri, this.protocol), {
            onerror: function(evt) { return self.onError(evt); },
            onopen: function(evt) { return self.onOpen(evt); },
            onclose: function(evt) { return self.onClose(evt); },
            onmessage: function(evt) { return self.onMessage(evt); }
        });
    },

    this.send = function(data, options, callback) {
        callback = typeof options === 'function' ? options : callback;
        options = typeof options === 'function' ? {} : options;
        var msg = this.queue(data, callback);
        this.deliverMessageQueue(options);
        return msg;
    }

    this.queue = function(data, callback) {
        var msgString;
        if (typeof data !== 'string') {
            data.messageIndex = ++this._messageOutCounter;
            data.messageId = 'client-msg:' + uuid();
            if (callback) {
                var callbacks = this.callbacks[data.messageId] = this.callbacks[data.messageId] || [];
                callbacks.push(callback);
            }
            msgString = JSON.stringify(data);
        } else {
            if (callback) {
                console.warn(log('Websocket message callbacks are only supported for JSON messages!'));
            }
            msgString = data;
        }
        this.messageQueue.push(msgString);
        return data;
    }

    this.deliverMessageQueue = function(options) {
        if (this._sendInProgress) return;
        if (this.isClosed()) {
            // just reconnect, send will be triggered from onOpen
            this.connect(); return; }

        // send logic
        this._sendInProgress = true;
        var ws = this;
        function doSend() {
            try {
                var msg;
                while ((msg = ws.messageQueue.shift())) {
                    ws.socket.send(msg);
                    ws._messageOutCounter++;
                    ws._lastMessagesOut = ws._lastMessagesOut.concat(msg).slice(-3);
                }
            } finally {
                delete ws._sendInProgress;
            }
        }

        // delay and try again
        options = options || {};
        options.startTime = options.startTime || Date.now();
        options.retryDelay = options.retryDelay || 100;
        (function testConnectionAndTriggerSend() {
            if (ws.isOpen()) { doSend(); return; }
            if (ws.sendTimeout && Date.now() - options.startTime > ws.sendTimeout) {
                ws.onError({error: 'send attempt timed out', type: 'timeout'}); return;
            }
            setTimeout(testConnectionAndTriggerSend, options.retryDelay);
        })();
    }

    this.close = function() {
        this.reopenClosedConnection = false;
        if (!this.isClosed()) this.socket.close();
    }


// -=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-
// debugging

    this.toString = function() {
        return f('lively2livelyBrowserClient(%s, connection: %s, %s received messages,  %s sent messages)',
            this.uri, this.isOpen() ? 'open' : 'closed', this._messageInCounter, this._messageOutCounter);
    }

}).call(WebSocketHelper.prototype);


// -=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-
function Connection(options) {
// -=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-

// from lively.net.SessionTracker SessionTrackerConnection
// methods removed:
//   setL2lStore
//   getL2lStore
//   ensureServerToServerConnection
//   resetServer
//   getWebResource

    EventEmitter.call(this);
    this.initialize(options);
    // this.url = url;
    // this.protocol = options.protocol;
    // this.sender = options.sender || null;
    // this.setupClient();
    // this.debugLevel = options.debugLevel !== undefined ?  options.debugLevel : 1;
}

util.inherits(Connection, EventEmitter);

(function() {

    this.reactTo = function(type, callback) {
        listen(this, type, {cb: callback}, 'cb');
    }

// -=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-
// initializing

    this.initialize = function(options) {
        this.sessionId = null; // id of this session, defined when connected
        this.trackerId = null; // id of the tracker endpoint on the server, defined when connected
        this.sessionTrackerURL = options.sessionTrackerURL;
        this.username = options.username;
        this._status = 'disconnected';
        this.registerTimeout = options.registerTimeout || 60*1000; // ms
        this.activityTimeReportDelay = options.activityTimeReportDelay || 20*1000; // ms
        // a value other than null will enable session caching, i.e.
        // this.getSessions will only do a request at most as specified by timeout
        this.getSessionsCacheInvalidationTimeout = options.getSessionsCacheInvalidationTimeout || null;
        this.timeOfCreation = Date.now(); // UNIX timestamp
    }

// -=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-
// net accessors

    this.getWebSocket = function() {
        if (this.webSocket) return this.webSocket;
        var url = String(this.sessionTrackerURL);
        // FIXME
        if (!/connect\/?$/.test(url)) url = url.replace(/\/?$/, '/connect')
        this.webSocket = new WebSocketHelper(url, {protocol: "lively-json", enableReconnect: true});
        listen(this.webSocket, 'error', this, 'connectionError');
        this.listen();
        return this.webSocket;
    }

    this.resetConnection = function() {
        this._status = 'disconnected';
        var ws = this.webSocket;
        if (!ws) return;
        // in case connection wasn't established yet
        unlisten(ws, 'error', this, 'connectionError');
        ws.close();
        this.webSocket = null;
    }

    this.send = function(action, jso, callback) {
        if (!this.sessionId) { throw new Error('Need sessionId to interact with SessionTracker!') }
        var msg;
        if (arguments.length === 1) {
            var options = arguments[0];
            callback = options.callback;
            msg = {
                sender: this.sessionId,
                action: options.action,
                data: options.data || {}
            }
            if (options.inResponseTo) msg.inResponseTo = options.inResponseTo;
            if (options.target) msg.target = options.target;
        } else {
            msg = {
                sender: this.sessionId,
                action: action,
                data: jso
            }
        }
        return this.getWebSocket().send(msg, {}, callback);
    }

    this.sendTo = function(targetId, action, data, callback) {
        return this.send({action: action, data: data, target: targetId, callback: callback});
    }

    this.answer = function(msg, data, callback) {
        if (!msg.messageId) { throw new Error('Cannot answer message without messageId!'); }
        if (!msg.sender) { throw new Error('Cannot answer message without sender!'); }
        return this.send({inResponseTo: msg.messageId, action: msg.action+'Result', data: data, target: msg.sender, callback: callback});
    }

    this.listen = function() {
        var ws = this.webSocket;
        listen(ws, 'lively-message', this, 'dispatchLivelyMessageMyself');
    }

    this.isConnected = function() {
        return this._status === 'connected' && !!this.sessionId;
    }


// -=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-
// server management

    this.getSessions = function(cb, forceFresh) {
        // if timeout specified throttle requests so that they happen at most
        // timeout-often
        var to = this.getSessionsCacheInvalidationTimeout;
        if (forceFresh) delete this._getSessionsCachedResult;
        if (to && this._getSessionsCachedResult) {
            cb && cb(this._getSessionsCachedResult); return; }
        // -=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-
        // queue requests
        var self = this;
        if (!this._getSessionsQueue) this._getSessionsQueue = [];
        this._getSessionsQueue.push(cb);
        if (this._getSessionsInProgress) return;
        // start request if currently no one ongoing
        this._getSessionsInProgress = true;
        this.sendTo(this.trackerId, 'getSessions', {}, function(msg) {
            self._getSessionsInProgress = false;
            var sessions = msg && msg.data; cb;
            if (to) {
                self._getSessionsCachedResult = sessions;
                setTimeout(function() { self._getSessionsCachedResult = null; }, to);
            }
            while ((cb = self._getSessionsQueue.shift())) cb && cb(sessions);
        });
    }

    this.getUserInfo = function(thenDo) {
        // flatten the session data and group by user so that it becomes
        // easier to consume
        this.getSessions(function(sessions) {
            var result = {};
            for (var trackerId in sessions) {
                for (var sessionId in sessions[trackerId]) {
                    if (!sessions[trackerId]) { continue; }
                    var session = sessions[trackerId][sessionId];
                    var sessionList = result[session.user] || (result[session.user] = []);
                    sessionList.push({
                        id: sessionId,
                        tracker: trackerId,
                        worldURL: session.worldURL,
                        lastActivity: session.lastActivity,
                        remoteAddress: session.remoteAddress
                    });
                }
            }
            thenDo(result);
        });
    }


// -=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-
// session management

    this.whenOnline = function(thenDo) {
        if (this.isConnected()) { thenDo(); return; }
        listen(this, 'established', thenDo, 'call', {
            removeAfterUpdate: true});
    }

    this.connectionEstablished = function(msg) {
        // In case we have removed the connection already
        if (!this.webSocket || !this.sessionId) return;
        this._status = 'connected';
        this.trackerId = msg.data && msg.data.tracker && msg.data.tracker.id;
        listen(this.webSocket, 'closed', this, 'connectionClosed', {
            removeAfterUpdate: true});
        signal(this, 'established', this);
        this.startReportingActivities();
        console.log('%s established', this.toString(true));
    }

    this.connectionClosed = function() {
        if (this.sessionId && this.status() === 'connected') { this._status = 'connecting'; signal(this, 'connecting'); this.register(); }
        else { this._status = 'disconnected'; signal(this, 'closed'); }
        console.log('%s closed', this.toString(true));
    }

    this.connectionError = function(err) {
        console.log('connection error in %s:\n%o', this.toString(true),
            err && err.message ? err.message : err);
    }

    this.register = function(actions) {
        // sends a request to the session tracker to register a connection
        // pointing to this session connection/id
        if (!this.sessionId) this.sessionId = 'client-session:' + uuid();
        var session = this;
        setTimeout(function timeoutCheck() {
            if (session.isConnected() || !session.sessionId) return;
            session.resetConnection();
            session.register();
        }, this.registerTimeout
            /*Numbers.random(timeoutCheckPeriod-5, timeoutCheckPeriod+5)*/ // to balance server load
            );
        actions && (this.actions = actions);
        this.whenOnline(this.listen.bind(this));
        this.send('registerClient', {
            id: this.sessionId,
            worldURL: document.URL,
            user: this.username || 'anonymous',
            lastActivity: window.LastEvent && window.LastEvent.timeStamp,
            timeOfCreation: this.timeOfCreation,
        }, this.connectionEstablished.bind(this));
    }

    this.unregister = function() {
        if (this.sessionId) this.sendTo(this.trackerId, 'unregisterClient', {});
        this.resetConnection();
        this.sessionId = null;
        this.trackerId = null;
        this.stopReportingActivities();
    }

    this.initServerToServerConnect = function(serverURL, options, cb) {
        options = options || {}
        var url = serverURL.toString().replace(/^http/, 'ws')
        this.sendTo(this.trackerId, 'initServerToServerConnect', {url: url, options: options}, cb);
    }

    this.initServerToServerDisconnect = function(cb) {
        this.sendTo(this.trackerId, 'initServerToServerDisconnect', {}, cb);
    }


// -=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-
// specific messages

    this.dispatchLivelyMessageMyself = function(msg) {
        this.dispatchLivelyMessage(msg, this);
    }

    this.dispatchLivelyMessage = function(msg, session) {
        var actions = this.getActions(),
            action = actions[msg.action];
        if (action) action(msg, session);
        else if (actions.messageNotUnderstood) actions.messageNotUnderstood(msg, session);
    }

    this.getActions = function() {
        // return Object.extend(Object.extend({}, lively.net.SessionTracker.defaultActions), this.actions);
        return extend({}, this.actions);
    }

    this.addActions = function(actions) {
        return extend(this.actions, actions);
    }

    this.remoteEval = function(targetId, expression, thenDo) {
        this.sendTo(targetId, 'remoteEvalRequest', {expr: expression}, thenDo);
    }

    this.openForRequests = function() {
        if (!this.actions) this.actions = {};
        this.listen();
    }

    this.sendObjectTo = function(targetId, obj, options, callback) {
        if (!Object.isFunction(obj.copy)) { throw new Error('object needs to support #copy for being send'); }
        var stringifiedCopy = obj.copy(true/*stringify*/);
        if (!Object.isString(stringifiedCopy)) { throw new Error('object needs to return a string to copy(true)'); }
        var withObjectDo = options.withObjectDo;
        if (Object.isFunction(withObjectDo)) withObjectDo = '(' + String(withObjectDo) + ')';
        this.sendTo(targetId, 'copyObject', {object: stringifiedCopy, withObjectDo: withObjectDo}, callback);
    }


// -=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-
// reporting

    this.startReportingActivities = function() {
        var session = this;
        function report() {
            function next() { session._reportActivitiesTimer = setTimeout(report, session.activityTimeReportDelay); }
            if (!session.isConnected()) return;
            var timeStamp = window.LastEvent && window.LastEvent.timeStamp;
            if (!timeStamp || timeStamp === session._lastReportedActivity) { next(); return; }
            session._lastReportedActivity = timeStamp;
            session.sendTo(session.trackerId, 'reportActivity', {lastActivity: timeStamp}, next);
        }
        report();
    }

    this.stopReportingActivities = function() {
        clearTimeout(this._reportActivitiesTimer);
        delete this._reportActivitiesTimer;
    }

// -=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-
// debugging

    this.status = function() { return this._status; }

    this.toString = function(shortForm) {
        if (!this.webSocket || !this.webSocket.isOpen() || shortForm) {
            return f("Session connection to %s", this.sessionTrackerURL);
        }
        return f("Session %s to %s\n  id: %s\n  user: %s",
            this.status(), this.sessionTrackerURL, this.sessionId, this.username);
    }


}).call(Connection.prototype);

// -=-=-=-
// exports
// -=-=-=-

module.exports = {
    WebSocket: WebSocketHelper,
    Connection: Connection,
};

},{"./base":2,"events":8,"util":17}],4:[function(require,module,exports){

// -=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-
// debug helper -- inspecting

function inspect(obj, options, depth) {
    options = options || {};
    depth = depth || 0;
    if (!obj) { return print(obj); }

    // print function
    if (typeof obj === 'function') {
        function argNames(func) {
            if (func.superclass) return [];
            var names = String(func).match(/^[\s\(]*function[^(]*\(([^)]*)\)/)[1].
                    replace(/\/\/.*?[\r\n]|\/\*(?:.|[\r\n])*?\*\//g, '').
                    replace(/\s+/g, '').split(',');

            return names.length == 1 && !names[0] ? [] : names;
        }
        return options.printFunctionSource ? String(obj) :
            'function' + (obj.name ? ' ' + obj.name : '')
          + '(' + argNames(obj).join(',') + ') {/*...*/}';
    }
    // print "primitive"
    switch (obj.constructor) {
        case String:
        case Boolean:
        case RegExp:
        case Number: return print(obj);
    };

    if (typeof obj.serializeExpr === 'function') {
        return obj.serializeExpr();
    }

    var isArray = obj && Array.isArray(obj),
        openBr = isArray ? '[' : '{', closeBr = isArray ? ']' : '}';
    if (options.maxDepth && depth >= options.maxDepth) return openBr + '/*...*/' + closeBr;

    var printedProps = [];
    if (isArray) {
        printedProps = obj.map(function(ea) { return inspect(ea, options, depth); });
    } else {
        printedProps = Object.keys(obj)
           // .select(function(key) { return obj.hasOwnProperty(key); })
            .sort(function(a, b) {
                var aIsFunc = typeof obj[a] === 'function', bIsFunc = typeof obj[b] === 'function';
                if (aIsFunc === bIsFunc) {
                    if (a < b)  return -1;
                    if (a > b) return 1;
                    return 0;
                };
                return aIsFunc ? 1 : -1;
            })
            .map(function(key, i) {
                if (isArray) inspect(obj[key], options, depth + 1);
                var printedVal = inspect(obj[key], options, depth + 1);
                return format('%s: %s',
                    options.escapeKeys ? print(key) : key, printedVal);
            });
    }

    if (printedProps.length === 0) { return openBr + closeBr; }

    var printedPropsJoined = printedProps.join(','),
        useNewLines = !isArray
                   && (!options.minLengthForNewLine
                    || printedPropsJoined.length >= options.minLengthForNewLine),
        indent = doIndent('', options.indent || '  ', depth),
        propIndent = doIndent('', options.indent || '  ', depth + 1),
        startBreak = useNewLines ? '\n' + propIndent: '',
        endBreak = useNewLines ? '\n' + indent : '';
    if (useNewLines) printedPropsJoined = printedProps.join(',' + startBreak);
    return openBr + startBreak + printedPropsJoined + endBreak + closeBr;
}

function print(obj) {
    if (obj && Array.isArray(obj)) {
        return '[' + obj.map(function(ea) { return print(ea); }) + ']';
    }
    if (typeof obj !== "string") {
        return String(obj);
    }
    var result = String(obj);
    result = result.replace(/\n/g, '\\n\\\n');
    result = result.replace(/(")/g, '\\$1');
    result = '\"' + result + '\"';
    return result;
}

function format() {
    var objects = makeArray(arguments);
    var format = objects.shift();
    if (!format) { console.log("Error in Strings>>formatFromArray, first arg is undefined"); };

    function appendText(object, string) {
        return "" + object;
    }

    function appendObject(object, string) {
        return "" + object;
    }

    function appendInteger(value, string) {
        return value.toString();
    }

    function appendFloat(value, string, precision) {
        if (precision > -1) return value.toFixed(precision);
        else return value.toString();
    }

    function appendObject(value, string) { return inspect(value); }

    var appenderMap = {s: appendText, d: appendInteger, i: appendInteger, f: appendFloat, o: appendObject};
    var reg = /((^%|[^\\]%)(\d+)?(\.)([a-zA-Z]))|((^%|[^\\]%)([a-zA-Z]))/;

    function parseFormat(fmt) {
        var oldFmt = fmt;
        var parts = [];

        for (var m = reg.exec(fmt); m; m = reg.exec(fmt)) {
            var type = m[8] || m[5],
                appender = type in appenderMap ? appenderMap[type] : appendObject,
                precision = m[3] ? parseInt(m[3]) : (m[4] == "." ? -1 : 0);
            parts.push(fmt.substr(0, m[0][0] == "%" ? m.index : m.index + 1));
            parts.push({appender: appender, precision: precision});

            fmt = fmt.substr(m.index + m[0].length);
        }
        if (fmt)
            parts.push(fmt.toString());

        return parts;
    };

    var parts = parseFormat(format),
        str = "",
        objIndex = 0;

    for (var i = 0; i < parts.length; ++i) {
        var part = parts[i];
        if (part && typeof(part) == "object") {
            var object = objects[objIndex++];
            str += (part.appender || appendText)(object, str, part.precision);
        } else {
            str += appendText(part, str);
        }
    }
    return str;
}

function makeArray(iterable) {
    if (!iterable) return [];
    if (iterable.toArray) return iterable.toArray();
    var length = iterable.length,
        results = new Array(length);
    while (length--) results[length] = iterable[length];
    return results;
}

function doIndent(str, indentString, depth) {
    if (!depth || depth <= 0) return str;
    while (depth > 0) { depth--; str = indentString + str; }
    return str;
}

// -=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-

module.exports = {
    inspect: inspect,
    format: format
}

},{}],5:[function(require,module,exports){

var lv = {
    noConflict: function(globalName) {
        if (globalName) window[globalName] = lv;
        return lv;
    }
}

var helperFns  = require('./browser-helper');
Object.keys(helperFns).forEach(function(k) { lv[k] = helperFns[k]; });

module.exports = lv;
},{"./browser-helper":4}],6:[function(require,module,exports){
// updated on 2014-12-07

// helper
function signatureOf(name, func) {
    var source = String(func),
        match = source.match(/function\s*[a-zA-Z0-9_$]*\s*\(([^\)]*)\)/),
        params = (match && match[1]) || '';
    return name + '(' + params + ')';
}

function isClass(obj) {
    if (obj === obj
      || obj === Array
      || obj === Function
      || obj === String
      || obj === Boolean
      || obj === Date
      || obj === RegExp
      || obj === Number) return true;
    return (obj instanceof Function)
        && ((obj.superclass !== undefined)
         || (obj._superclass !== undefined));
}

function pluck(list, prop) { return list.map(function(ea) { return ea[prop]; }); }

function getObjectForCompletion(evalFunc, stringToEval, thenDo) {
    // thenDo = function(err, obj, startLetters)
    var idx = stringToEval.lastIndexOf('.'),
        startLetters = '';
    if (idx >= 0) {
        startLetters = stringToEval.slice(idx+1);
        stringToEval = stringToEval.slice(0,idx);
    } else {
        startLetters = stringToEval;
        stringToEval = 'Global';
    }
    var completions = [];
    try {
        var obj = evalFunc(stringToEval);
    } catch (e) {
        thenDo(e, null, null);
    }
    thenDo(null, obj, startLetters);
}

function propertyExtract(excludes, obj, extractor) {
    // show(''+excludes)
    return Object.getOwnPropertyNames(obj)
        .filter(function(key) { return excludes.indexOf(key) === -1; })
        .map(extractor)
        .filter(function(ea) { return !!ea; })
        .sort(function(a,b) {
            return a.name < b.name ? -1 : (a.name > b.name ? 1 : 0); });
}

function getMethodsOf(excludes, obj) {
    return propertyExtract(excludes, obj, function(key) {

        if ((obj.__lookupGetter__ && obj.__lookupGetter__(key)) || typeof obj[key] !== 'function') return null;
        return {name: key, completion: signatureOf(key, obj[key])}; })
}

function getAttributesOf(excludes, obj) {
    return propertyExtract(excludes, obj, function(key) {
        if ((obj.__lookupGetter__ && !obj.__lookupGetter__(key)) && typeof obj[key] === 'function') return null;
        return {name: key, completion: key}; })
}

function getProtoChain(obj) {
    var protos = [], proto = obj;
    while (obj) { protos.push(obj); obj = obj.__proto__ }
    return protos;
}

function getDescriptorOf(originalObj, proto) {
    function shorten(s, len) {
        if (s.length > len) s = s.slice(0,len) + '...';
        return s.replace(/\n/g, '').replace(/\s+/g, ' ');
    }

    var stringified;
    try { stringified = String(originalObj); } catch (e) { stringified = "{/*...*/}"; }

    if (originalObj === proto) {
        if (typeof originalObj !== 'function') return shorten(stringified, 50);
        var funcString = stringified,
            body = shorten(funcString.slice(funcString.indexOf('{')+1, funcString.lastIndexOf('}')), 50);
        return signatureOf(originalObj.displayName || originalObj.name || 'function', originalObj) + ' {' + body + '}';
    }

    var klass = proto.hasOwnProperty('constructor') && proto.constructor;
    if (!klass) return 'prototype';
    if (typeof klass.type === 'string' && klass.type.length) return shorten(klass.type, 50);
    if (typeof klass.name === 'string' && klass.name.length) return shorten(klass.name, 50);
    return "anonymous class";
}

function getCompletionsOfObj(obj, thenDo) {
    var err, completions;
    try {
        var excludes = [];
        completions = getProtoChain(obj).map(function(proto) {
            var descr = getDescriptorOf(obj, proto),
                methodsAndAttributes = getMethodsOf(excludes, proto)
                    .concat(getAttributesOf(excludes, proto));
            excludes = excludes.concat(pluck(methodsAndAttributes, 'name'));
            return [descr, pluck(methodsAndAttributes, 'completion')];
        });
    } catch (e) { err = e; }
    thenDo(err, completions);
}

function getCompletions(evalFunc, string, thenDo) {
    // thendo = function(err, completions/*ARRAY*/)
    // eval string and for the resulting object find attributes and methods,
    // grouped by its prototype / class chain
    // if string is something like "foo().bar.baz" then treat "baz" as start
    // letters = filter for properties of foo().bar
    // ("foo().bar.baz." for props of the result of the complete string)
    getObjectForCompletion(evalFunc, string, function(err, obj, startLetters) {
        if (err) { thenDo(err); return }
        var excludes = [];
        var completions = getProtoChain(obj).map(function(proto) {
            var descr = getDescriptorOf(obj, proto),
                methodsAndAttributes = getMethodsOf(excludes, proto)
                    .concat(getAttributesOf(excludes, proto));
            excludes = excludes.concat(pluck(methodsAndAttributes, 'name'));
            return [descr, pluck(methodsAndAttributes, 'completion')];
        });
        thenDo(err, completions, startLetters);
    })
}

module.exports = getCompletions;
},{}],7:[function(require,module,exports){
var getCompletions = require('./completion');

module.exports = {

    reportServices: function(msg, session) {
        session.answer(msg, {services: Object.keys(session.getActions())});
    },

    remoteEvalRequest: function(msg, session) {
        var result;
        if (false && !Config.get('lively2livelyAllowRemoteEval')) {
            result = 'remote eval disabled';
        } else {
            try {
                result = eval(msg.data.expr);
            } catch(e) {
                result = e + '\n' + e.stack;
            }
        }
        session.answer(msg, {result: String(result)});
    },

    completions: function(msg, session) {
        getCompletions(
            function(code) { return eval(code); },
            msg.data.expr,
            function(err, completions, startLetters) {
                console.log(completions);
                session.answer(msg, {
                    error: err ? String(err) : null,
                    completions: completions,
                    prefix: startLetters
                });
            });
    },

    messageNotUnderstood: function(msg, session) {
        console.error('Lively2Lively message not understood:\n%o', msg);
        session.answer(msg, {error: 'messageNotUnderstood'});
    }

}

},{"./completion":6}],8:[function(require,module,exports){
// Copyright Joyent, Inc. and other Node contributors.
//
// Permission is hereby granted, free of charge, to any person obtaining a
// copy of this software and associated documentation files (the
// "Software"), to deal in the Software without restriction, including
// without limitation the rights to use, copy, modify, merge, publish,
// distribute, sublicense, and/or sell copies of the Software, and to permit
// persons to whom the Software is furnished to do so, subject to the
// following conditions:
//
// The above copyright notice and this permission notice shall be included
// in all copies or substantial portions of the Software.
//
// THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS
// OR IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF
// MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN
// NO EVENT SHALL THE AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM,
// DAMAGES OR OTHER LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR
// OTHERWISE, ARISING FROM, OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE
// USE OR OTHER DEALINGS IN THE SOFTWARE.

function EventEmitter() {
  this._events = this._events || {};
  this._maxListeners = this._maxListeners || undefined;
}
module.exports = EventEmitter;

// Backwards-compat with node 0.10.x
EventEmitter.EventEmitter = EventEmitter;

EventEmitter.prototype._events = undefined;
EventEmitter.prototype._maxListeners = undefined;

// By default EventEmitters will print a warning if more than 10 listeners are
// added to it. This is a useful default which helps finding memory leaks.
EventEmitter.defaultMaxListeners = 10;

// Obviously not all Emitters should be limited to 10. This function allows
// that to be increased. Set to zero for unlimited.
EventEmitter.prototype.setMaxListeners = function(n) {
  if (!isNumber(n) || n < 0 || isNaN(n))
    throw TypeError('n must be a positive number');
  this._maxListeners = n;
  return this;
};

EventEmitter.prototype.emit = function(type) {
  var er, handler, len, args, i, listeners;

  if (!this._events)
    this._events = {};

  // If there is no 'error' event listener then throw.
  if (type === 'error') {
    if (!this._events.error ||
        (isObject(this._events.error) && !this._events.error.length)) {
      er = arguments[1];
      if (er instanceof Error) {
        throw er; // Unhandled 'error' event
      }
      throw TypeError('Uncaught, unspecified "error" event.');
    }
  }

  handler = this._events[type];

  if (isUndefined(handler))
    return false;

  if (isFunction(handler)) {
    switch (arguments.length) {
      // fast cases
      case 1:
        handler.call(this);
        break;
      case 2:
        handler.call(this, arguments[1]);
        break;
      case 3:
        handler.call(this, arguments[1], arguments[2]);
        break;
      // slower
      default:
        len = arguments.length;
        args = new Array(len - 1);
        for (i = 1; i < len; i++)
          args[i - 1] = arguments[i];
        handler.apply(this, args);
    }
  } else if (isObject(handler)) {
    len = arguments.length;
    args = new Array(len - 1);
    for (i = 1; i < len; i++)
      args[i - 1] = arguments[i];

    listeners = handler.slice();
    len = listeners.length;
    for (i = 0; i < len; i++)
      listeners[i].apply(this, args);
  }

  return true;
};

EventEmitter.prototype.addListener = function(type, listener) {
  var m;

  if (!isFunction(listener))
    throw TypeError('listener must be a function');

  if (!this._events)
    this._events = {};

  // To avoid recursion in the case that type === "newListener"! Before
  // adding it to the listeners, first emit "newListener".
  if (this._events.newListener)
    this.emit('newListener', type,
              isFunction(listener.listener) ?
              listener.listener : listener);

  if (!this._events[type])
    // Optimize the case of one listener. Don't need the extra array object.
    this._events[type] = listener;
  else if (isObject(this._events[type]))
    // If we've already got an array, just append.
    this._events[type].push(listener);
  else
    // Adding the second element, need to change to array.
    this._events[type] = [this._events[type], listener];

  // Check for listener leak
  if (isObject(this._events[type]) && !this._events[type].warned) {
    var m;
    if (!isUndefined(this._maxListeners)) {
      m = this._maxListeners;
    } else {
      m = EventEmitter.defaultMaxListeners;
    }

    if (m && m > 0 && this._events[type].length > m) {
      this._events[type].warned = true;
      console.error('(node) warning: possible EventEmitter memory ' +
                    'leak detected. %d listeners added. ' +
                    'Use emitter.setMaxListeners() to increase limit.',
                    this._events[type].length);
      if (typeof console.trace === 'function') {
        // not supported in IE 10
        console.trace();
      }
    }
  }

  return this;
};

EventEmitter.prototype.on = EventEmitter.prototype.addListener;

EventEmitter.prototype.once = function(type, listener) {
  if (!isFunction(listener))
    throw TypeError('listener must be a function');

  var fired = false;

  function g() {
    this.removeListener(type, g);

    if (!fired) {
      fired = true;
      listener.apply(this, arguments);
    }
  }

  g.listener = listener;
  this.on(type, g);

  return this;
};

// emits a 'removeListener' event iff the listener was removed
EventEmitter.prototype.removeListener = function(type, listener) {
  var list, position, length, i;

  if (!isFunction(listener))
    throw TypeError('listener must be a function');

  if (!this._events || !this._events[type])
    return this;

  list = this._events[type];
  length = list.length;
  position = -1;

  if (list === listener ||
      (isFunction(list.listener) && list.listener === listener)) {
    delete this._events[type];
    if (this._events.removeListener)
      this.emit('removeListener', type, listener);

  } else if (isObject(list)) {
    for (i = length; i-- > 0;) {
      if (list[i] === listener ||
          (list[i].listener && list[i].listener === listener)) {
        position = i;
        break;
      }
    }

    if (position < 0)
      return this;

    if (list.length === 1) {
      list.length = 0;
      delete this._events[type];
    } else {
      list.splice(position, 1);
    }

    if (this._events.removeListener)
      this.emit('removeListener', type, listener);
  }

  return this;
};

EventEmitter.prototype.removeAllListeners = function(type) {
  var key, listeners;

  if (!this._events)
    return this;

  // not listening for removeListener, no need to emit
  if (!this._events.removeListener) {
    if (arguments.length === 0)
      this._events = {};
    else if (this._events[type])
      delete this._events[type];
    return this;
  }

  // emit removeListener for all listeners on all events
  if (arguments.length === 0) {
    for (key in this._events) {
      if (key === 'removeListener') continue;
      this.removeAllListeners(key);
    }
    this.removeAllListeners('removeListener');
    this._events = {};
    return this;
  }

  listeners = this._events[type];

  if (isFunction(listeners)) {
    this.removeListener(type, listeners);
  } else {
    // LIFO order
    while (listeners.length)
      this.removeListener(type, listeners[listeners.length - 1]);
  }
  delete this._events[type];

  return this;
};

EventEmitter.prototype.listeners = function(type) {
  var ret;
  if (!this._events || !this._events[type])
    ret = [];
  else if (isFunction(this._events[type]))
    ret = [this._events[type]];
  else
    ret = this._events[type].slice();
  return ret;
};

EventEmitter.listenerCount = function(emitter, type) {
  var ret;
  if (!emitter._events || !emitter._events[type])
    ret = 0;
  else if (isFunction(emitter._events[type]))
    ret = 1;
  else
    ret = emitter._events[type].length;
  return ret;
};

function isFunction(arg) {
  return typeof arg === 'function';
}

function isNumber(arg) {
  return typeof arg === 'number';
}

function isObject(arg) {
  return typeof arg === 'object' && arg !== null;
}

function isUndefined(arg) {
  return arg === void 0;
}

},{}],9:[function(require,module,exports){
if (typeof Object.create === 'function') {
  // implementation from standard node.js 'util' module
  module.exports = function inherits(ctor, superCtor) {
    ctor.super_ = superCtor
    ctor.prototype = Object.create(superCtor.prototype, {
      constructor: {
        value: ctor,
        enumerable: false,
        writable: true,
        configurable: true
      }
    });
  };
} else {
  // old school shim for old browsers
  module.exports = function inherits(ctor, superCtor) {
    ctor.super_ = superCtor
    var TempCtor = function () {}
    TempCtor.prototype = superCtor.prototype
    ctor.prototype = new TempCtor()
    ctor.prototype.constructor = ctor
  }
}

},{}],10:[function(require,module,exports){
// shim for using process in browser

var process = module.exports = {};

process.nextTick = (function () {
    var canSetImmediate = typeof window !== 'undefined'
    && window.setImmediate;
    var canMutationObserver = typeof window !== 'undefined'
    && window.MutationObserver;
    var canPost = typeof window !== 'undefined'
    && window.postMessage && window.addEventListener
    ;

    if (canSetImmediate) {
        return function (f) { return window.setImmediate(f) };
    }

    var queue = [];

    if (canMutationObserver) {
        var hiddenDiv = document.createElement("div");
        var observer = new MutationObserver(function () {
            var queueList = queue.slice();
            queue.length = 0;
            queueList.forEach(function (fn) {
                fn();
            });
        });

        observer.observe(hiddenDiv, { attributes: true });

        return function nextTick(fn) {
            if (!queue.length) {
                hiddenDiv.setAttribute('yes', 'no');
            }
            queue.push(fn);
        };
    }

    if (canPost) {
        window.addEventListener('message', function (ev) {
            var source = ev.source;
            if ((source === window || source === null) && ev.data === 'process-tick') {
                ev.stopPropagation();
                if (queue.length > 0) {
                    var fn = queue.shift();
                    fn();
                }
            }
        }, true);

        return function nextTick(fn) {
            queue.push(fn);
            window.postMessage('process-tick', '*');
        };
    }

    return function nextTick(fn) {
        setTimeout(fn, 0);
    };
})();

process.title = 'browser';
process.browser = true;
process.env = {};
process.argv = [];

function noop() {}

process.on = noop;
process.addListener = noop;
process.once = noop;
process.off = noop;
process.removeListener = noop;
process.removeAllListeners = noop;
process.emit = noop;

process.binding = function (name) {
    throw new Error('process.binding is not supported');
};

// TODO(shtylman)
process.cwd = function () { return '/' };
process.chdir = function (dir) {
    throw new Error('process.chdir is not supported');
};

},{}],11:[function(require,module,exports){
(function (global){
/*! http://mths.be/punycode v1.2.4 by @mathias */
;(function(root) {

	/** Detect free variables */
	var freeExports = typeof exports == 'object' && exports;
	var freeModule = typeof module == 'object' && module &&
		module.exports == freeExports && module;
	var freeGlobal = typeof global == 'object' && global;
	if (freeGlobal.global === freeGlobal || freeGlobal.window === freeGlobal) {
		root = freeGlobal;
	}

	/**
	 * The `punycode` object.
	 * @name punycode
	 * @type Object
	 */
	var punycode,

	/** Highest positive signed 32-bit float value */
	maxInt = 2147483647, // aka. 0x7FFFFFFF or 2^31-1

	/** Bootstring parameters */
	base = 36,
	tMin = 1,
	tMax = 26,
	skew = 38,
	damp = 700,
	initialBias = 72,
	initialN = 128, // 0x80
	delimiter = '-', // '\x2D'

	/** Regular expressions */
	regexPunycode = /^xn--/,
	regexNonASCII = /[^ -~]/, // unprintable ASCII chars + non-ASCII chars
	regexSeparators = /\x2E|\u3002|\uFF0E|\uFF61/g, // RFC 3490 separators

	/** Error messages */
	errors = {
		'overflow': 'Overflow: input needs wider integers to process',
		'not-basic': 'Illegal input >= 0x80 (not a basic code point)',
		'invalid-input': 'Invalid input'
	},

	/** Convenience shortcuts */
	baseMinusTMin = base - tMin,
	floor = Math.floor,
	stringFromCharCode = String.fromCharCode,

	/** Temporary variable */
	key;

	/*--------------------------------------------------------------------------*/

	/**
	 * A generic error utility function.
	 * @private
	 * @param {String} type The error type.
	 * @returns {Error} Throws a `RangeError` with the applicable error message.
	 */
	function error(type) {
		throw RangeError(errors[type]);
	}

	/**
	 * A generic `Array#map` utility function.
	 * @private
	 * @param {Array} array The array to iterate over.
	 * @param {Function} callback The function that gets called for every array
	 * item.
	 * @returns {Array} A new array of values returned by the callback function.
	 */
	function map(array, fn) {
		var length = array.length;
		while (length--) {
			array[length] = fn(array[length]);
		}
		return array;
	}

	/**
	 * A simple `Array#map`-like wrapper to work with domain name strings.
	 * @private
	 * @param {String} domain The domain name.
	 * @param {Function} callback The function that gets called for every
	 * character.
	 * @returns {Array} A new string of characters returned by the callback
	 * function.
	 */
	function mapDomain(string, fn) {
		return map(string.split(regexSeparators), fn).join('.');
	}

	/**
	 * Creates an array containing the numeric code points of each Unicode
	 * character in the string. While JavaScript uses UCS-2 internally,
	 * this function will convert a pair of surrogate halves (each of which
	 * UCS-2 exposes as separate characters) into a single code point,
	 * matching UTF-16.
	 * @see `punycode.ucs2.encode`
	 * @see <http://mathiasbynens.be/notes/javascript-encoding>
	 * @memberOf punycode.ucs2
	 * @name decode
	 * @param {String} string The Unicode input string (UCS-2).
	 * @returns {Array} The new array of code points.
	 */
	function ucs2decode(string) {
		var output = [],
		    counter = 0,
		    length = string.length,
		    value,
		    extra;
		while (counter < length) {
			value = string.charCodeAt(counter++);
			if (value >= 0xD800 && value <= 0xDBFF && counter < length) {
				// high surrogate, and there is a next character
				extra = string.charCodeAt(counter++);
				if ((extra & 0xFC00) == 0xDC00) { // low surrogate
					output.push(((value & 0x3FF) << 10) + (extra & 0x3FF) + 0x10000);
				} else {
					// unmatched surrogate; only append this code unit, in case the next
					// code unit is the high surrogate of a surrogate pair
					output.push(value);
					counter--;
				}
			} else {
				output.push(value);
			}
		}
		return output;
	}

	/**
	 * Creates a string based on an array of numeric code points.
	 * @see `punycode.ucs2.decode`
	 * @memberOf punycode.ucs2
	 * @name encode
	 * @param {Array} codePoints The array of numeric code points.
	 * @returns {String} The new Unicode string (UCS-2).
	 */
	function ucs2encode(array) {
		return map(array, function(value) {
			var output = '';
			if (value > 0xFFFF) {
				value -= 0x10000;
				output += stringFromCharCode(value >>> 10 & 0x3FF | 0xD800);
				value = 0xDC00 | value & 0x3FF;
			}
			output += stringFromCharCode(value);
			return output;
		}).join('');
	}

	/**
	 * Converts a basic code point into a digit/integer.
	 * @see `digitToBasic()`
	 * @private
	 * @param {Number} codePoint The basic numeric code point value.
	 * @returns {Number} The numeric value of a basic code point (for use in
	 * representing integers) in the range `0` to `base - 1`, or `base` if
	 * the code point does not represent a value.
	 */
	function basicToDigit(codePoint) {
		if (codePoint - 48 < 10) {
			return codePoint - 22;
		}
		if (codePoint - 65 < 26) {
			return codePoint - 65;
		}
		if (codePoint - 97 < 26) {
			return codePoint - 97;
		}
		return base;
	}

	/**
	 * Converts a digit/integer into a basic code point.
	 * @see `basicToDigit()`
	 * @private
	 * @param {Number} digit The numeric value of a basic code point.
	 * @returns {Number} The basic code point whose value (when used for
	 * representing integers) is `digit`, which needs to be in the range
	 * `0` to `base - 1`. If `flag` is non-zero, the uppercase form is
	 * used; else, the lowercase form is used. The behavior is undefined
	 * if `flag` is non-zero and `digit` has no uppercase form.
	 */
	function digitToBasic(digit, flag) {
		//  0..25 map to ASCII a..z or A..Z
		// 26..35 map to ASCII 0..9
		return digit + 22 + 75 * (digit < 26) - ((flag != 0) << 5);
	}

	/**
	 * Bias adaptation function as per section 3.4 of RFC 3492.
	 * http://tools.ietf.org/html/rfc3492#section-3.4
	 * @private
	 */
	function adapt(delta, numPoints, firstTime) {
		var k = 0;
		delta = firstTime ? floor(delta / damp) : delta >> 1;
		delta += floor(delta / numPoints);
		for (/* no initialization */; delta > baseMinusTMin * tMax >> 1; k += base) {
			delta = floor(delta / baseMinusTMin);
		}
		return floor(k + (baseMinusTMin + 1) * delta / (delta + skew));
	}

	/**
	 * Converts a Punycode string of ASCII-only symbols to a string of Unicode
	 * symbols.
	 * @memberOf punycode
	 * @param {String} input The Punycode string of ASCII-only symbols.
	 * @returns {String} The resulting string of Unicode symbols.
	 */
	function decode(input) {
		// Don't use UCS-2
		var output = [],
		    inputLength = input.length,
		    out,
		    i = 0,
		    n = initialN,
		    bias = initialBias,
		    basic,
		    j,
		    index,
		    oldi,
		    w,
		    k,
		    digit,
		    t,
		    /** Cached calculation results */
		    baseMinusT;

		// Handle the basic code points: let `basic` be the number of input code
		// points before the last delimiter, or `0` if there is none, then copy
		// the first basic code points to the output.

		basic = input.lastIndexOf(delimiter);
		if (basic < 0) {
			basic = 0;
		}

		for (j = 0; j < basic; ++j) {
			// if it's not a basic code point
			if (input.charCodeAt(j) >= 0x80) {
				error('not-basic');
			}
			output.push(input.charCodeAt(j));
		}

		// Main decoding loop: start just after the last delimiter if any basic code
		// points were copied; start at the beginning otherwise.

		for (index = basic > 0 ? basic + 1 : 0; index < inputLength; /* no final expression */) {

			// `index` is the index of the next character to be consumed.
			// Decode a generalized variable-length integer into `delta`,
			// which gets added to `i`. The overflow checking is easier
			// if we increase `i` as we go, then subtract off its starting
			// value at the end to obtain `delta`.
			for (oldi = i, w = 1, k = base; /* no condition */; k += base) {

				if (index >= inputLength) {
					error('invalid-input');
				}

				digit = basicToDigit(input.charCodeAt(index++));

				if (digit >= base || digit > floor((maxInt - i) / w)) {
					error('overflow');
				}

				i += digit * w;
				t = k <= bias ? tMin : (k >= bias + tMax ? tMax : k - bias);

				if (digit < t) {
					break;
				}

				baseMinusT = base - t;
				if (w > floor(maxInt / baseMinusT)) {
					error('overflow');
				}

				w *= baseMinusT;

			}

			out = output.length + 1;
			bias = adapt(i - oldi, out, oldi == 0);

			// `i` was supposed to wrap around from `out` to `0`,
			// incrementing `n` each time, so we'll fix that now:
			if (floor(i / out) > maxInt - n) {
				error('overflow');
			}

			n += floor(i / out);
			i %= out;

			// Insert `n` at position `i` of the output
			output.splice(i++, 0, n);

		}

		return ucs2encode(output);
	}

	/**
	 * Converts a string of Unicode symbols to a Punycode string of ASCII-only
	 * symbols.
	 * @memberOf punycode
	 * @param {String} input The string of Unicode symbols.
	 * @returns {String} The resulting Punycode string of ASCII-only symbols.
	 */
	function encode(input) {
		var n,
		    delta,
		    handledCPCount,
		    basicLength,
		    bias,
		    j,
		    m,
		    q,
		    k,
		    t,
		    currentValue,
		    output = [],
		    /** `inputLength` will hold the number of code points in `input`. */
		    inputLength,
		    /** Cached calculation results */
		    handledCPCountPlusOne,
		    baseMinusT,
		    qMinusT;

		// Convert the input in UCS-2 to Unicode
		input = ucs2decode(input);

		// Cache the length
		inputLength = input.length;

		// Initialize the state
		n = initialN;
		delta = 0;
		bias = initialBias;

		// Handle the basic code points
		for (j = 0; j < inputLength; ++j) {
			currentValue = input[j];
			if (currentValue < 0x80) {
				output.push(stringFromCharCode(currentValue));
			}
		}

		handledCPCount = basicLength = output.length;

		// `handledCPCount` is the number of code points that have been handled;
		// `basicLength` is the number of basic code points.

		// Finish the basic string - if it is not empty - with a delimiter
		if (basicLength) {
			output.push(delimiter);
		}

		// Main encoding loop:
		while (handledCPCount < inputLength) {

			// All non-basic code points < n have been handled already. Find the next
			// larger one:
			for (m = maxInt, j = 0; j < inputLength; ++j) {
				currentValue = input[j];
				if (currentValue >= n && currentValue < m) {
					m = currentValue;
				}
			}

			// Increase `delta` enough to advance the decoder's <n,i> state to <m,0>,
			// but guard against overflow
			handledCPCountPlusOne = handledCPCount + 1;
			if (m - n > floor((maxInt - delta) / handledCPCountPlusOne)) {
				error('overflow');
			}

			delta += (m - n) * handledCPCountPlusOne;
			n = m;

			for (j = 0; j < inputLength; ++j) {
				currentValue = input[j];

				if (currentValue < n && ++delta > maxInt) {
					error('overflow');
				}

				if (currentValue == n) {
					// Represent delta as a generalized variable-length integer
					for (q = delta, k = base; /* no condition */; k += base) {
						t = k <= bias ? tMin : (k >= bias + tMax ? tMax : k - bias);
						if (q < t) {
							break;
						}
						qMinusT = q - t;
						baseMinusT = base - t;
						output.push(
							stringFromCharCode(digitToBasic(t + qMinusT % baseMinusT, 0))
						);
						q = floor(qMinusT / baseMinusT);
					}

					output.push(stringFromCharCode(digitToBasic(q, 0)));
					bias = adapt(delta, handledCPCountPlusOne, handledCPCount == basicLength);
					delta = 0;
					++handledCPCount;
				}
			}

			++delta;
			++n;

		}
		return output.join('');
	}

	/**
	 * Converts a Punycode string representing a domain name to Unicode. Only the
	 * Punycoded parts of the domain name will be converted, i.e. it doesn't
	 * matter if you call it on a string that has already been converted to
	 * Unicode.
	 * @memberOf punycode
	 * @param {String} domain The Punycode domain name to convert to Unicode.
	 * @returns {String} The Unicode representation of the given Punycode
	 * string.
	 */
	function toUnicode(domain) {
		return mapDomain(domain, function(string) {
			return regexPunycode.test(string)
				? decode(string.slice(4).toLowerCase())
				: string;
		});
	}

	/**
	 * Converts a Unicode string representing a domain name to Punycode. Only the
	 * non-ASCII parts of the domain name will be converted, i.e. it doesn't
	 * matter if you call it with a domain that's already in ASCII.
	 * @memberOf punycode
	 * @param {String} domain The domain name to convert, as a Unicode string.
	 * @returns {String} The Punycode representation of the given domain name.
	 */
	function toASCII(domain) {
		return mapDomain(domain, function(string) {
			return regexNonASCII.test(string)
				? 'xn--' + encode(string)
				: string;
		});
	}

	/*--------------------------------------------------------------------------*/

	/** Define the public API */
	punycode = {
		/**
		 * A string representing the current Punycode.js version number.
		 * @memberOf punycode
		 * @type String
		 */
		'version': '1.2.4',
		/**
		 * An object of methods to convert from JavaScript's internal character
		 * representation (UCS-2) to Unicode code points, and back.
		 * @see <http://mathiasbynens.be/notes/javascript-encoding>
		 * @memberOf punycode
		 * @type Object
		 */
		'ucs2': {
			'decode': ucs2decode,
			'encode': ucs2encode
		},
		'decode': decode,
		'encode': encode,
		'toASCII': toASCII,
		'toUnicode': toUnicode
	};

	/** Expose `punycode` */
	// Some AMD build optimizers, like r.js, check for specific condition patterns
	// like the following:
	if (
		typeof define == 'function' &&
		typeof define.amd == 'object' &&
		define.amd
	) {
		define('punycode', function() {
			return punycode;
		});
	} else if (freeExports && !freeExports.nodeType) {
		if (freeModule) { // in Node.js or RingoJS v0.8.0+
			freeModule.exports = punycode;
		} else { // in Narwhal or RingoJS v0.7.0-
			for (key in punycode) {
				punycode.hasOwnProperty(key) && (freeExports[key] = punycode[key]);
			}
		}
	} else { // in Rhino or a web browser
		root.punycode = punycode;
	}

}(this));

}).call(this,typeof global !== "undefined" ? global : typeof self !== "undefined" ? self : typeof window !== "undefined" ? window : {})
},{}],12:[function(require,module,exports){
// Copyright Joyent, Inc. and other Node contributors.
//
// Permission is hereby granted, free of charge, to any person obtaining a
// copy of this software and associated documentation files (the
// "Software"), to deal in the Software without restriction, including
// without limitation the rights to use, copy, modify, merge, publish,
// distribute, sublicense, and/or sell copies of the Software, and to permit
// persons to whom the Software is furnished to do so, subject to the
// following conditions:
//
// The above copyright notice and this permission notice shall be included
// in all copies or substantial portions of the Software.
//
// THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS
// OR IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF
// MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN
// NO EVENT SHALL THE AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM,
// DAMAGES OR OTHER LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR
// OTHERWISE, ARISING FROM, OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE
// USE OR OTHER DEALINGS IN THE SOFTWARE.

'use strict';

// If obj.hasOwnProperty has been overridden, then calling
// obj.hasOwnProperty(prop) will break.
// See: https://github.com/joyent/node/issues/1707
function hasOwnProperty(obj, prop) {
  return Object.prototype.hasOwnProperty.call(obj, prop);
}

module.exports = function(qs, sep, eq, options) {
  sep = sep || '&';
  eq = eq || '=';
  var obj = {};

  if (typeof qs !== 'string' || qs.length === 0) {
    return obj;
  }

  var regexp = /\+/g;
  qs = qs.split(sep);

  var maxKeys = 1000;
  if (options && typeof options.maxKeys === 'number') {
    maxKeys = options.maxKeys;
  }

  var len = qs.length;
  // maxKeys <= 0 means that we should not limit keys count
  if (maxKeys > 0 && len > maxKeys) {
    len = maxKeys;
  }

  for (var i = 0; i < len; ++i) {
    var x = qs[i].replace(regexp, '%20'),
        idx = x.indexOf(eq),
        kstr, vstr, k, v;

    if (idx >= 0) {
      kstr = x.substr(0, idx);
      vstr = x.substr(idx + 1);
    } else {
      kstr = x;
      vstr = '';
    }

    k = decodeURIComponent(kstr);
    v = decodeURIComponent(vstr);

    if (!hasOwnProperty(obj, k)) {
      obj[k] = v;
    } else if (isArray(obj[k])) {
      obj[k].push(v);
    } else {
      obj[k] = [obj[k], v];
    }
  }

  return obj;
};

var isArray = Array.isArray || function (xs) {
  return Object.prototype.toString.call(xs) === '[object Array]';
};

},{}],13:[function(require,module,exports){
// Copyright Joyent, Inc. and other Node contributors.
//
// Permission is hereby granted, free of charge, to any person obtaining a
// copy of this software and associated documentation files (the
// "Software"), to deal in the Software without restriction, including
// without limitation the rights to use, copy, modify, merge, publish,
// distribute, sublicense, and/or sell copies of the Software, and to permit
// persons to whom the Software is furnished to do so, subject to the
// following conditions:
//
// The above copyright notice and this permission notice shall be included
// in all copies or substantial portions of the Software.
//
// THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS
// OR IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF
// MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN
// NO EVENT SHALL THE AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM,
// DAMAGES OR OTHER LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR
// OTHERWISE, ARISING FROM, OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE
// USE OR OTHER DEALINGS IN THE SOFTWARE.

'use strict';

var stringifyPrimitive = function(v) {
  switch (typeof v) {
    case 'string':
      return v;

    case 'boolean':
      return v ? 'true' : 'false';

    case 'number':
      return isFinite(v) ? v : '';

    default:
      return '';
  }
};

module.exports = function(obj, sep, eq, name) {
  sep = sep || '&';
  eq = eq || '=';
  if (obj === null) {
    obj = undefined;
  }

  if (typeof obj === 'object') {
    return map(objectKeys(obj), function(k) {
      var ks = encodeURIComponent(stringifyPrimitive(k)) + eq;
      if (isArray(obj[k])) {
        return map(obj[k], function(v) {
          return ks + encodeURIComponent(stringifyPrimitive(v));
        }).join(sep);
      } else {
        return ks + encodeURIComponent(stringifyPrimitive(obj[k]));
      }
    }).join(sep);

  }

  if (!name) return '';
  return encodeURIComponent(stringifyPrimitive(name)) + eq +
         encodeURIComponent(stringifyPrimitive(obj));
};

var isArray = Array.isArray || function (xs) {
  return Object.prototype.toString.call(xs) === '[object Array]';
};

function map (xs, f) {
  if (xs.map) return xs.map(f);
  var res = [];
  for (var i = 0; i < xs.length; i++) {
    res.push(f(xs[i], i));
  }
  return res;
}

var objectKeys = Object.keys || function (obj) {
  var res = [];
  for (var key in obj) {
    if (Object.prototype.hasOwnProperty.call(obj, key)) res.push(key);
  }
  return res;
};

},{}],14:[function(require,module,exports){
'use strict';

exports.decode = exports.parse = require('./decode');
exports.encode = exports.stringify = require('./encode');

},{"./decode":12,"./encode":13}],15:[function(require,module,exports){
// Copyright Joyent, Inc. and other Node contributors.
//
// Permission is hereby granted, free of charge, to any person obtaining a
// copy of this software and associated documentation files (the
// "Software"), to deal in the Software without restriction, including
// without limitation the rights to use, copy, modify, merge, publish,
// distribute, sublicense, and/or sell copies of the Software, and to permit
// persons to whom the Software is furnished to do so, subject to the
// following conditions:
//
// The above copyright notice and this permission notice shall be included
// in all copies or substantial portions of the Software.
//
// THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS
// OR IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF
// MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN
// NO EVENT SHALL THE AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM,
// DAMAGES OR OTHER LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR
// OTHERWISE, ARISING FROM, OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE
// USE OR OTHER DEALINGS IN THE SOFTWARE.

var punycode = require('punycode');

exports.parse = urlParse;
exports.resolve = urlResolve;
exports.resolveObject = urlResolveObject;
exports.format = urlFormat;

exports.Url = Url;

function Url() {
  this.protocol = null;
  this.slashes = null;
  this.auth = null;
  this.host = null;
  this.port = null;
  this.hostname = null;
  this.hash = null;
  this.search = null;
  this.query = null;
  this.pathname = null;
  this.path = null;
  this.href = null;
}

// Reference: RFC 3986, RFC 1808, RFC 2396

// define these here so at least they only have to be
// compiled once on the first module load.
var protocolPattern = /^([a-z0-9.+-]+:)/i,
    portPattern = /:[0-9]*$/,

    // RFC 2396: characters reserved for delimiting URLs.
    // We actually just auto-escape these.
    delims = ['<', '>', '"', '`', ' ', '\r', '\n', '\t'],

    // RFC 2396: characters not allowed for various reasons.
    unwise = ['{', '}', '|', '\\', '^', '`'].concat(delims),

    // Allowed by RFCs, but cause of XSS attacks.  Always escape these.
    autoEscape = ['\''].concat(unwise),
    // Characters that are never ever allowed in a hostname.
    // Note that any invalid chars are also handled, but these
    // are the ones that are *expected* to be seen, so we fast-path
    // them.
    nonHostChars = ['%', '/', '?', ';', '#'].concat(autoEscape),
    hostEndingChars = ['/', '?', '#'],
    hostnameMaxLen = 255,
    hostnamePartPattern = /^[a-z0-9A-Z_-]{0,63}$/,
    hostnamePartStart = /^([a-z0-9A-Z_-]{0,63})(.*)$/,
    // protocols that can allow "unsafe" and "unwise" chars.
    unsafeProtocol = {
      'javascript': true,
      'javascript:': true
    },
    // protocols that never have a hostname.
    hostlessProtocol = {
      'javascript': true,
      'javascript:': true
    },
    // protocols that always contain a // bit.
    slashedProtocol = {
      'http': true,
      'https': true,
      'ftp': true,
      'gopher': true,
      'file': true,
      'http:': true,
      'https:': true,
      'ftp:': true,
      'gopher:': true,
      'file:': true
    },
    querystring = require('querystring');

function urlParse(url, parseQueryString, slashesDenoteHost) {
  if (url && isObject(url) && url instanceof Url) return url;

  var u = new Url;
  u.parse(url, parseQueryString, slashesDenoteHost);
  return u;
}

Url.prototype.parse = function(url, parseQueryString, slashesDenoteHost) {
  if (!isString(url)) {
    throw new TypeError("Parameter 'url' must be a string, not " + typeof url);
  }

  var rest = url;

  // trim before proceeding.
  // This is to support parse stuff like "  http://foo.com  \n"
  rest = rest.trim();

  var proto = protocolPattern.exec(rest);
  if (proto) {
    proto = proto[0];
    var lowerProto = proto.toLowerCase();
    this.protocol = lowerProto;
    rest = rest.substr(proto.length);
  }

  // figure out if it's got a host
  // user@server is *always* interpreted as a hostname, and url
  // resolution will treat //foo/bar as host=foo,path=bar because that's
  // how the browser resolves relative URLs.
  if (slashesDenoteHost || proto || rest.match(/^\/\/[^@\/]+@[^@\/]+/)) {
    var slashes = rest.substr(0, 2) === '//';
    if (slashes && !(proto && hostlessProtocol[proto])) {
      rest = rest.substr(2);
      this.slashes = true;
    }
  }

  if (!hostlessProtocol[proto] &&
      (slashes || (proto && !slashedProtocol[proto]))) {

    // there's a hostname.
    // the first instance of /, ?, ;, or # ends the host.
    //
    // If there is an @ in the hostname, then non-host chars *are* allowed
    // to the left of the last @ sign, unless some host-ending character
    // comes *before* the @-sign.
    // URLs are obnoxious.
    //
    // ex:
    // http://a@b@c/ => user:a@b host:c
    // http://a@b?@c => user:a host:c path:/?@c

    // v0.12 TODO(isaacs): This is not quite how Chrome does things.
    // Review our test case against browsers more comprehensively.

    // find the first instance of any hostEndingChars
    var hostEnd = -1;
    for (var i = 0; i < hostEndingChars.length; i++) {
      var hec = rest.indexOf(hostEndingChars[i]);
      if (hec !== -1 && (hostEnd === -1 || hec < hostEnd))
        hostEnd = hec;
    }

    // at this point, either we have an explicit point where the
    // auth portion cannot go past, or the last @ char is the decider.
    var auth, atSign;
    if (hostEnd === -1) {
      // atSign can be anywhere.
      atSign = rest.lastIndexOf('@');
    } else {
      // atSign must be in auth portion.
      // http://a@b/c@d => host:b auth:a path:/c@d
      atSign = rest.lastIndexOf('@', hostEnd);
    }

    // Now we have a portion which is definitely the auth.
    // Pull that off.
    if (atSign !== -1) {
      auth = rest.slice(0, atSign);
      rest = rest.slice(atSign + 1);
      this.auth = decodeURIComponent(auth);
    }

    // the host is the remaining to the left of the first non-host char
    hostEnd = -1;
    for (var i = 0; i < nonHostChars.length; i++) {
      var hec = rest.indexOf(nonHostChars[i]);
      if (hec !== -1 && (hostEnd === -1 || hec < hostEnd))
        hostEnd = hec;
    }
    // if we still have not hit it, then the entire thing is a host.
    if (hostEnd === -1)
      hostEnd = rest.length;

    this.host = rest.slice(0, hostEnd);
    rest = rest.slice(hostEnd);

    // pull out port.
    this.parseHost();

    // we've indicated that there is a hostname,
    // so even if it's empty, it has to be present.
    this.hostname = this.hostname || '';

    // if hostname begins with [ and ends with ]
    // assume that it's an IPv6 address.
    var ipv6Hostname = this.hostname[0] === '[' &&
        this.hostname[this.hostname.length - 1] === ']';

    // validate a little.
    if (!ipv6Hostname) {
      var hostparts = this.hostname.split(/\./);
      for (var i = 0, l = hostparts.length; i < l; i++) {
        var part = hostparts[i];
        if (!part) continue;
        if (!part.match(hostnamePartPattern)) {
          var newpart = '';
          for (var j = 0, k = part.length; j < k; j++) {
            if (part.charCodeAt(j) > 127) {
              // we replace non-ASCII char with a temporary placeholder
              // we need this to make sure size of hostname is not
              // broken by replacing non-ASCII by nothing
              newpart += 'x';
            } else {
              newpart += part[j];
            }
          }
          // we test again with ASCII char only
          if (!newpart.match(hostnamePartPattern)) {
            var validParts = hostparts.slice(0, i);
            var notHost = hostparts.slice(i + 1);
            var bit = part.match(hostnamePartStart);
            if (bit) {
              validParts.push(bit[1]);
              notHost.unshift(bit[2]);
            }
            if (notHost.length) {
              rest = '/' + notHost.join('.') + rest;
            }
            this.hostname = validParts.join('.');
            break;
          }
        }
      }
    }

    if (this.hostname.length > hostnameMaxLen) {
      this.hostname = '';
    } else {
      // hostnames are always lower case.
      this.hostname = this.hostname.toLowerCase();
    }

    if (!ipv6Hostname) {
      // IDNA Support: Returns a puny coded representation of "domain".
      // It only converts the part of the domain name that
      // has non ASCII characters. I.e. it dosent matter if
      // you call it with a domain that already is in ASCII.
      var domainArray = this.hostname.split('.');
      var newOut = [];
      for (var i = 0; i < domainArray.length; ++i) {
        var s = domainArray[i];
        newOut.push(s.match(/[^A-Za-z0-9_-]/) ?
            'xn--' + punycode.encode(s) : s);
      }
      this.hostname = newOut.join('.');
    }

    var p = this.port ? ':' + this.port : '';
    var h = this.hostname || '';
    this.host = h + p;
    this.href += this.host;

    // strip [ and ] from the hostname
    // the host field still retains them, though
    if (ipv6Hostname) {
      this.hostname = this.hostname.substr(1, this.hostname.length - 2);
      if (rest[0] !== '/') {
        rest = '/' + rest;
      }
    }
  }

  // now rest is set to the post-host stuff.
  // chop off any delim chars.
  if (!unsafeProtocol[lowerProto]) {

    // First, make 100% sure that any "autoEscape" chars get
    // escaped, even if encodeURIComponent doesn't think they
    // need to be.
    for (var i = 0, l = autoEscape.length; i < l; i++) {
      var ae = autoEscape[i];
      var esc = encodeURIComponent(ae);
      if (esc === ae) {
        esc = escape(ae);
      }
      rest = rest.split(ae).join(esc);
    }
  }


  // chop off from the tail first.
  var hash = rest.indexOf('#');
  if (hash !== -1) {
    // got a fragment string.
    this.hash = rest.substr(hash);
    rest = rest.slice(0, hash);
  }
  var qm = rest.indexOf('?');
  if (qm !== -1) {
    this.search = rest.substr(qm);
    this.query = rest.substr(qm + 1);
    if (parseQueryString) {
      this.query = querystring.parse(this.query);
    }
    rest = rest.slice(0, qm);
  } else if (parseQueryString) {
    // no query string, but parseQueryString still requested
    this.search = '';
    this.query = {};
  }
  if (rest) this.pathname = rest;
  if (slashedProtocol[lowerProto] &&
      this.hostname && !this.pathname) {
    this.pathname = '/';
  }

  //to support http.request
  if (this.pathname || this.search) {
    var p = this.pathname || '';
    var s = this.search || '';
    this.path = p + s;
  }

  // finally, reconstruct the href based on what has been validated.
  this.href = this.format();
  return this;
};

// format a parsed object into a url string
function urlFormat(obj) {
  // ensure it's an object, and not a string url.
  // If it's an obj, this is a no-op.
  // this way, you can call url_format() on strings
  // to clean up potentially wonky urls.
  if (isString(obj)) obj = urlParse(obj);
  if (!(obj instanceof Url)) return Url.prototype.format.call(obj);
  return obj.format();
}

Url.prototype.format = function() {
  var auth = this.auth || '';
  if (auth) {
    auth = encodeURIComponent(auth);
    auth = auth.replace(/%3A/i, ':');
    auth += '@';
  }

  var protocol = this.protocol || '',
      pathname = this.pathname || '',
      hash = this.hash || '',
      host = false,
      query = '';

  if (this.host) {
    host = auth + this.host;
  } else if (this.hostname) {
    host = auth + (this.hostname.indexOf(':') === -1 ?
        this.hostname :
        '[' + this.hostname + ']');
    if (this.port) {
      host += ':' + this.port;
    }
  }

  if (this.query &&
      isObject(this.query) &&
      Object.keys(this.query).length) {
    query = querystring.stringify(this.query);
  }

  var search = this.search || (query && ('?' + query)) || '';

  if (protocol && protocol.substr(-1) !== ':') protocol += ':';

  // only the slashedProtocols get the //.  Not mailto:, xmpp:, etc.
  // unless they had them to begin with.
  if (this.slashes ||
      (!protocol || slashedProtocol[protocol]) && host !== false) {
    host = '//' + (host || '');
    if (pathname && pathname.charAt(0) !== '/') pathname = '/' + pathname;
  } else if (!host) {
    host = '';
  }

  if (hash && hash.charAt(0) !== '#') hash = '#' + hash;
  if (search && search.charAt(0) !== '?') search = '?' + search;

  pathname = pathname.replace(/[?#]/g, function(match) {
    return encodeURIComponent(match);
  });
  search = search.replace('#', '%23');

  return protocol + host + pathname + search + hash;
};

function urlResolve(source, relative) {
  return urlParse(source, false, true).resolve(relative);
}

Url.prototype.resolve = function(relative) {
  return this.resolveObject(urlParse(relative, false, true)).format();
};

function urlResolveObject(source, relative) {
  if (!source) return relative;
  return urlParse(source, false, true).resolveObject(relative);
}

Url.prototype.resolveObject = function(relative) {
  if (isString(relative)) {
    var rel = new Url();
    rel.parse(relative, false, true);
    relative = rel;
  }

  var result = new Url();
  Object.keys(this).forEach(function(k) {
    result[k] = this[k];
  }, this);

  // hash is always overridden, no matter what.
  // even href="" will remove it.
  result.hash = relative.hash;

  // if the relative url is empty, then there's nothing left to do here.
  if (relative.href === '') {
    result.href = result.format();
    return result;
  }

  // hrefs like //foo/bar always cut to the protocol.
  if (relative.slashes && !relative.protocol) {
    // take everything except the protocol from relative
    Object.keys(relative).forEach(function(k) {
      if (k !== 'protocol')
        result[k] = relative[k];
    });

    //urlParse appends trailing / to urls like http://www.example.com
    if (slashedProtocol[result.protocol] &&
        result.hostname && !result.pathname) {
      result.path = result.pathname = '/';
    }

    result.href = result.format();
    return result;
  }

  if (relative.protocol && relative.protocol !== result.protocol) {
    // if it's a known url protocol, then changing
    // the protocol does weird things
    // first, if it's not file:, then we MUST have a host,
    // and if there was a path
    // to begin with, then we MUST have a path.
    // if it is file:, then the host is dropped,
    // because that's known to be hostless.
    // anything else is assumed to be absolute.
    if (!slashedProtocol[relative.protocol]) {
      Object.keys(relative).forEach(function(k) {
        result[k] = relative[k];
      });
      result.href = result.format();
      return result;
    }

    result.protocol = relative.protocol;
    if (!relative.host && !hostlessProtocol[relative.protocol]) {
      var relPath = (relative.pathname || '').split('/');
      while (relPath.length && !(relative.host = relPath.shift()));
      if (!relative.host) relative.host = '';
      if (!relative.hostname) relative.hostname = '';
      if (relPath[0] !== '') relPath.unshift('');
      if (relPath.length < 2) relPath.unshift('');
      result.pathname = relPath.join('/');
    } else {
      result.pathname = relative.pathname;
    }
    result.search = relative.search;
    result.query = relative.query;
    result.host = relative.host || '';
    result.auth = relative.auth;
    result.hostname = relative.hostname || relative.host;
    result.port = relative.port;
    // to support http.request
    if (result.pathname || result.search) {
      var p = result.pathname || '';
      var s = result.search || '';
      result.path = p + s;
    }
    result.slashes = result.slashes || relative.slashes;
    result.href = result.format();
    return result;
  }

  var isSourceAbs = (result.pathname && result.pathname.charAt(0) === '/'),
      isRelAbs = (
          relative.host ||
          relative.pathname && relative.pathname.charAt(0) === '/'
      ),
      mustEndAbs = (isRelAbs || isSourceAbs ||
                    (result.host && relative.pathname)),
      removeAllDots = mustEndAbs,
      srcPath = result.pathname && result.pathname.split('/') || [],
      relPath = relative.pathname && relative.pathname.split('/') || [],
      psychotic = result.protocol && !slashedProtocol[result.protocol];

  // if the url is a non-slashed url, then relative
  // links like ../.. should be able
  // to crawl up to the hostname, as well.  This is strange.
  // result.protocol has already been set by now.
  // Later on, put the first path part into the host field.
  if (psychotic) {
    result.hostname = '';
    result.port = null;
    if (result.host) {
      if (srcPath[0] === '') srcPath[0] = result.host;
      else srcPath.unshift(result.host);
    }
    result.host = '';
    if (relative.protocol) {
      relative.hostname = null;
      relative.port = null;
      if (relative.host) {
        if (relPath[0] === '') relPath[0] = relative.host;
        else relPath.unshift(relative.host);
      }
      relative.host = null;
    }
    mustEndAbs = mustEndAbs && (relPath[0] === '' || srcPath[0] === '');
  }

  if (isRelAbs) {
    // it's absolute.
    result.host = (relative.host || relative.host === '') ?
                  relative.host : result.host;
    result.hostname = (relative.hostname || relative.hostname === '') ?
                      relative.hostname : result.hostname;
    result.search = relative.search;
    result.query = relative.query;
    srcPath = relPath;
    // fall through to the dot-handling below.
  } else if (relPath.length) {
    // it's relative
    // throw away the existing file, and take the new path instead.
    if (!srcPath) srcPath = [];
    srcPath.pop();
    srcPath = srcPath.concat(relPath);
    result.search = relative.search;
    result.query = relative.query;
  } else if (!isNullOrUndefined(relative.search)) {
    // just pull out the search.
    // like href='?foo'.
    // Put this after the other two cases because it simplifies the booleans
    if (psychotic) {
      result.hostname = result.host = srcPath.shift();
      //occationaly the auth can get stuck only in host
      //this especialy happens in cases like
      //url.resolveObject('mailto:local1@domain1', 'local2@domain2')
      var authInHost = result.host && result.host.indexOf('@') > 0 ?
                       result.host.split('@') : false;
      if (authInHost) {
        result.auth = authInHost.shift();
        result.host = result.hostname = authInHost.shift();
      }
    }
    result.search = relative.search;
    result.query = relative.query;
    //to support http.request
    if (!isNull(result.pathname) || !isNull(result.search)) {
      result.path = (result.pathname ? result.pathname : '') +
                    (result.search ? result.search : '');
    }
    result.href = result.format();
    return result;
  }

  if (!srcPath.length) {
    // no path at all.  easy.
    // we've already handled the other stuff above.
    result.pathname = null;
    //to support http.request
    if (result.search) {
      result.path = '/' + result.search;
    } else {
      result.path = null;
    }
    result.href = result.format();
    return result;
  }

  // if a url ENDs in . or .., then it must get a trailing slash.
  // however, if it ends in anything else non-slashy,
  // then it must NOT get a trailing slash.
  var last = srcPath.slice(-1)[0];
  var hasTrailingSlash = (
      (result.host || relative.host) && (last === '.' || last === '..') ||
      last === '');

  // strip single dots, resolve double dots to parent dir
  // if the path tries to go above the root, `up` ends up > 0
  var up = 0;
  for (var i = srcPath.length; i >= 0; i--) {
    last = srcPath[i];
    if (last == '.') {
      srcPath.splice(i, 1);
    } else if (last === '..') {
      srcPath.splice(i, 1);
      up++;
    } else if (up) {
      srcPath.splice(i, 1);
      up--;
    }
  }

  // if the path is allowed to go above the root, restore leading ..s
  if (!mustEndAbs && !removeAllDots) {
    for (; up--; up) {
      srcPath.unshift('..');
    }
  }

  if (mustEndAbs && srcPath[0] !== '' &&
      (!srcPath[0] || srcPath[0].charAt(0) !== '/')) {
    srcPath.unshift('');
  }

  if (hasTrailingSlash && (srcPath.join('/').substr(-1) !== '/')) {
    srcPath.push('');
  }

  var isAbsolute = srcPath[0] === '' ||
      (srcPath[0] && srcPath[0].charAt(0) === '/');

  // put the host back
  if (psychotic) {
    result.hostname = result.host = isAbsolute ? '' :
                                    srcPath.length ? srcPath.shift() : '';
    //occationaly the auth can get stuck only in host
    //this especialy happens in cases like
    //url.resolveObject('mailto:local1@domain1', 'local2@domain2')
    var authInHost = result.host && result.host.indexOf('@') > 0 ?
                     result.host.split('@') : false;
    if (authInHost) {
      result.auth = authInHost.shift();
      result.host = result.hostname = authInHost.shift();
    }
  }

  mustEndAbs = mustEndAbs || (result.host && srcPath.length);

  if (mustEndAbs && !isAbsolute) {
    srcPath.unshift('');
  }

  if (!srcPath.length) {
    result.pathname = null;
    result.path = null;
  } else {
    result.pathname = srcPath.join('/');
  }

  //to support request.http
  if (!isNull(result.pathname) || !isNull(result.search)) {
    result.path = (result.pathname ? result.pathname : '') +
                  (result.search ? result.search : '');
  }
  result.auth = relative.auth || result.auth;
  result.slashes = result.slashes || relative.slashes;
  result.href = result.format();
  return result;
};

Url.prototype.parseHost = function() {
  var host = this.host;
  var port = portPattern.exec(host);
  if (port) {
    port = port[0];
    if (port !== ':') {
      this.port = port.substr(1);
    }
    host = host.substr(0, host.length - port.length);
  }
  if (host) this.hostname = host;
};

function isString(arg) {
  return typeof arg === "string";
}

function isObject(arg) {
  return typeof arg === 'object' && arg !== null;
}

function isNull(arg) {
  return arg === null;
}
function isNullOrUndefined(arg) {
  return  arg == null;
}

},{"punycode":11,"querystring":14}],16:[function(require,module,exports){
module.exports = function isBuffer(arg) {
  return arg && typeof arg === 'object'
    && typeof arg.copy === 'function'
    && typeof arg.fill === 'function'
    && typeof arg.readUInt8 === 'function';
}
},{}],17:[function(require,module,exports){
(function (process,global){
// Copyright Joyent, Inc. and other Node contributors.
//
// Permission is hereby granted, free of charge, to any person obtaining a
// copy of this software and associated documentation files (the
// "Software"), to deal in the Software without restriction, including
// without limitation the rights to use, copy, modify, merge, publish,
// distribute, sublicense, and/or sell copies of the Software, and to permit
// persons to whom the Software is furnished to do so, subject to the
// following conditions:
//
// The above copyright notice and this permission notice shall be included
// in all copies or substantial portions of the Software.
//
// THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS
// OR IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF
// MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN
// NO EVENT SHALL THE AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM,
// DAMAGES OR OTHER LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR
// OTHERWISE, ARISING FROM, OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE
// USE OR OTHER DEALINGS IN THE SOFTWARE.

var formatRegExp = /%[sdj%]/g;
exports.format = function(f) {
  if (!isString(f)) {
    var objects = [];
    for (var i = 0; i < arguments.length; i++) {
      objects.push(inspect(arguments[i]));
    }
    return objects.join(' ');
  }

  var i = 1;
  var args = arguments;
  var len = args.length;
  var str = String(f).replace(formatRegExp, function(x) {
    if (x === '%%') return '%';
    if (i >= len) return x;
    switch (x) {
      case '%s': return String(args[i++]);
      case '%d': return Number(args[i++]);
      case '%j':
        try {
          return JSON.stringify(args[i++]);
        } catch (_) {
          return '[Circular]';
        }
      default:
        return x;
    }
  });
  for (var x = args[i]; i < len; x = args[++i]) {
    if (isNull(x) || !isObject(x)) {
      str += ' ' + x;
    } else {
      str += ' ' + inspect(x);
    }
  }
  return str;
};


// Mark that a method should not be used.
// Returns a modified function which warns once by default.
// If --no-deprecation is set, then it is a no-op.
exports.deprecate = function(fn, msg) {
  // Allow for deprecating things in the process of starting up.
  if (isUndefined(global.process)) {
    return function() {
      return exports.deprecate(fn, msg).apply(this, arguments);
    };
  }

  if (process.noDeprecation === true) {
    return fn;
  }

  var warned = false;
  function deprecated() {
    if (!warned) {
      if (process.throwDeprecation) {
        throw new Error(msg);
      } else if (process.traceDeprecation) {
        console.trace(msg);
      } else {
        console.error(msg);
      }
      warned = true;
    }
    return fn.apply(this, arguments);
  }

  return deprecated;
};


var debugs = {};
var debugEnviron;
exports.debuglog = function(set) {
  if (isUndefined(debugEnviron))
    debugEnviron = process.env.NODE_DEBUG || '';
  set = set.toUpperCase();
  if (!debugs[set]) {
    if (new RegExp('\\b' + set + '\\b', 'i').test(debugEnviron)) {
      var pid = process.pid;
      debugs[set] = function() {
        var msg = exports.format.apply(exports, arguments);
        console.error('%s %d: %s', set, pid, msg);
      };
    } else {
      debugs[set] = function() {};
    }
  }
  return debugs[set];
};


/**
 * Echos the value of a value. Trys to print the value out
 * in the best way possible given the different types.
 *
 * @param {Object} obj The object to print out.
 * @param {Object} opts Optional options object that alters the output.
 */
/* legacy: obj, showHidden, depth, colors*/
function inspect(obj, opts) {
  // default options
  var ctx = {
    seen: [],
    stylize: stylizeNoColor
  };
  // legacy...
  if (arguments.length >= 3) ctx.depth = arguments[2];
  if (arguments.length >= 4) ctx.colors = arguments[3];
  if (isBoolean(opts)) {
    // legacy...
    ctx.showHidden = opts;
  } else if (opts) {
    // got an "options" object
    exports._extend(ctx, opts);
  }
  // set default options
  if (isUndefined(ctx.showHidden)) ctx.showHidden = false;
  if (isUndefined(ctx.depth)) ctx.depth = 2;
  if (isUndefined(ctx.colors)) ctx.colors = false;
  if (isUndefined(ctx.customInspect)) ctx.customInspect = true;
  if (ctx.colors) ctx.stylize = stylizeWithColor;
  return formatValue(ctx, obj, ctx.depth);
}
exports.inspect = inspect;


// http://en.wikipedia.org/wiki/ANSI_escape_code#graphics
inspect.colors = {
  'bold' : [1, 22],
  'italic' : [3, 23],
  'underline' : [4, 24],
  'inverse' : [7, 27],
  'white' : [37, 39],
  'grey' : [90, 39],
  'black' : [30, 39],
  'blue' : [34, 39],
  'cyan' : [36, 39],
  'green' : [32, 39],
  'magenta' : [35, 39],
  'red' : [31, 39],
  'yellow' : [33, 39]
};

// Don't use 'blue' not visible on cmd.exe
inspect.styles = {
  'special': 'cyan',
  'number': 'yellow',
  'boolean': 'yellow',
  'undefined': 'grey',
  'null': 'bold',
  'string': 'green',
  'date': 'magenta',
  // "name": intentionally not styling
  'regexp': 'red'
};


function stylizeWithColor(str, styleType) {
  var style = inspect.styles[styleType];

  if (style) {
    return '\u001b[' + inspect.colors[style][0] + 'm' + str +
           '\u001b[' + inspect.colors[style][1] + 'm';
  } else {
    return str;
  }
}


function stylizeNoColor(str, styleType) {
  return str;
}


function arrayToHash(array) {
  var hash = {};

  array.forEach(function(val, idx) {
    hash[val] = true;
  });

  return hash;
}


function formatValue(ctx, value, recurseTimes) {
  // Provide a hook for user-specified inspect functions.
  // Check that value is an object with an inspect function on it
  if (ctx.customInspect &&
      value &&
      isFunction(value.inspect) &&
      // Filter out the util module, it's inspect function is special
      value.inspect !== exports.inspect &&
      // Also filter out any prototype objects using the circular check.
      !(value.constructor && value.constructor.prototype === value)) {
    var ret = value.inspect(recurseTimes, ctx);
    if (!isString(ret)) {
      ret = formatValue(ctx, ret, recurseTimes);
    }
    return ret;
  }

  // Primitive types cannot have properties
  var primitive = formatPrimitive(ctx, value);
  if (primitive) {
    return primitive;
  }

  // Look up the keys of the object.
  var keys = Object.keys(value);
  var visibleKeys = arrayToHash(keys);

  if (ctx.showHidden) {
    keys = Object.getOwnPropertyNames(value);
  }

  // IE doesn't make error fields non-enumerable
  // http://msdn.microsoft.com/en-us/library/ie/dww52sbt(v=vs.94).aspx
  if (isError(value)
      && (keys.indexOf('message') >= 0 || keys.indexOf('description') >= 0)) {
    return formatError(value);
  }

  // Some type of object without properties can be shortcutted.
  if (keys.length === 0) {
    if (isFunction(value)) {
      var name = value.name ? ': ' + value.name : '';
      return ctx.stylize('[Function' + name + ']', 'special');
    }
    if (isRegExp(value)) {
      return ctx.stylize(RegExp.prototype.toString.call(value), 'regexp');
    }
    if (isDate(value)) {
      return ctx.stylize(Date.prototype.toString.call(value), 'date');
    }
    if (isError(value)) {
      return formatError(value);
    }
  }

  var base = '', array = false, braces = ['{', '}'];

  // Make Array say that they are Array
  if (isArray(value)) {
    array = true;
    braces = ['[', ']'];
  }

  // Make functions say that they are functions
  if (isFunction(value)) {
    var n = value.name ? ': ' + value.name : '';
    base = ' [Function' + n + ']';
  }

  // Make RegExps say that they are RegExps
  if (isRegExp(value)) {
    base = ' ' + RegExp.prototype.toString.call(value);
  }

  // Make dates with properties first say the date
  if (isDate(value)) {
    base = ' ' + Date.prototype.toUTCString.call(value);
  }

  // Make error with message first say the error
  if (isError(value)) {
    base = ' ' + formatError(value);
  }

  if (keys.length === 0 && (!array || value.length == 0)) {
    return braces[0] + base + braces[1];
  }

  if (recurseTimes < 0) {
    if (isRegExp(value)) {
      return ctx.stylize(RegExp.prototype.toString.call(value), 'regexp');
    } else {
      return ctx.stylize('[Object]', 'special');
    }
  }

  ctx.seen.push(value);

  var output;
  if (array) {
    output = formatArray(ctx, value, recurseTimes, visibleKeys, keys);
  } else {
    output = keys.map(function(key) {
      return formatProperty(ctx, value, recurseTimes, visibleKeys, key, array);
    });
  }

  ctx.seen.pop();

  return reduceToSingleString(output, base, braces);
}


function formatPrimitive(ctx, value) {
  if (isUndefined(value))
    return ctx.stylize('undefined', 'undefined');
  if (isString(value)) {
    var simple = '\'' + JSON.stringify(value).replace(/^"|"$/g, '')
                                             .replace(/'/g, "\\'")
                                             .replace(/\\"/g, '"') + '\'';
    return ctx.stylize(simple, 'string');
  }
  if (isNumber(value))
    return ctx.stylize('' + value, 'number');
  if (isBoolean(value))
    return ctx.stylize('' + value, 'boolean');
  // For some reason typeof null is "object", so special case here.
  if (isNull(value))
    return ctx.stylize('null', 'null');
}


function formatError(value) {
  return '[' + Error.prototype.toString.call(value) + ']';
}


function formatArray(ctx, value, recurseTimes, visibleKeys, keys) {
  var output = [];
  for (var i = 0, l = value.length; i < l; ++i) {
    if (hasOwnProperty(value, String(i))) {
      output.push(formatProperty(ctx, value, recurseTimes, visibleKeys,
          String(i), true));
    } else {
      output.push('');
    }
  }
  keys.forEach(function(key) {
    if (!key.match(/^\d+$/)) {
      output.push(formatProperty(ctx, value, recurseTimes, visibleKeys,
          key, true));
    }
  });
  return output;
}


function formatProperty(ctx, value, recurseTimes, visibleKeys, key, array) {
  var name, str, desc;
  desc = Object.getOwnPropertyDescriptor(value, key) || { value: value[key] };
  if (desc.get) {
    if (desc.set) {
      str = ctx.stylize('[Getter/Setter]', 'special');
    } else {
      str = ctx.stylize('[Getter]', 'special');
    }
  } else {
    if (desc.set) {
      str = ctx.stylize('[Setter]', 'special');
    }
  }
  if (!hasOwnProperty(visibleKeys, key)) {
    name = '[' + key + ']';
  }
  if (!str) {
    if (ctx.seen.indexOf(desc.value) < 0) {
      if (isNull(recurseTimes)) {
        str = formatValue(ctx, desc.value, null);
      } else {
        str = formatValue(ctx, desc.value, recurseTimes - 1);
      }
      if (str.indexOf('\n') > -1) {
        if (array) {
          str = str.split('\n').map(function(line) {
            return '  ' + line;
          }).join('\n').substr(2);
        } else {
          str = '\n' + str.split('\n').map(function(line) {
            return '   ' + line;
          }).join('\n');
        }
      }
    } else {
      str = ctx.stylize('[Circular]', 'special');
    }
  }
  if (isUndefined(name)) {
    if (array && key.match(/^\d+$/)) {
      return str;
    }
    name = JSON.stringify('' + key);
    if (name.match(/^"([a-zA-Z_][a-zA-Z_0-9]*)"$/)) {
      name = name.substr(1, name.length - 2);
      name = ctx.stylize(name, 'name');
    } else {
      name = name.replace(/'/g, "\\'")
                 .replace(/\\"/g, '"')
                 .replace(/(^"|"$)/g, "'");
      name = ctx.stylize(name, 'string');
    }
  }

  return name + ': ' + str;
}


function reduceToSingleString(output, base, braces) {
  var numLinesEst = 0;
  var length = output.reduce(function(prev, cur) {
    numLinesEst++;
    if (cur.indexOf('\n') >= 0) numLinesEst++;
    return prev + cur.replace(/\u001b\[\d\d?m/g, '').length + 1;
  }, 0);

  if (length > 60) {
    return braces[0] +
           (base === '' ? '' : base + '\n ') +
           ' ' +
           output.join(',\n  ') +
           ' ' +
           braces[1];
  }

  return braces[0] + base + ' ' + output.join(', ') + ' ' + braces[1];
}


// NOTE: These type checking functions intentionally don't use `instanceof`
// because it is fragile and can be easily faked with `Object.create()`.
function isArray(ar) {
  return Array.isArray(ar);
}
exports.isArray = isArray;

function isBoolean(arg) {
  return typeof arg === 'boolean';
}
exports.isBoolean = isBoolean;

function isNull(arg) {
  return arg === null;
}
exports.isNull = isNull;

function isNullOrUndefined(arg) {
  return arg == null;
}
exports.isNullOrUndefined = isNullOrUndefined;

function isNumber(arg) {
  return typeof arg === 'number';
}
exports.isNumber = isNumber;

function isString(arg) {
  return typeof arg === 'string';
}
exports.isString = isString;

function isSymbol(arg) {
  return typeof arg === 'symbol';
}
exports.isSymbol = isSymbol;

function isUndefined(arg) {
  return arg === void 0;
}
exports.isUndefined = isUndefined;

function isRegExp(re) {
  return isObject(re) && objectToString(re) === '[object RegExp]';
}
exports.isRegExp = isRegExp;

function isObject(arg) {
  return typeof arg === 'object' && arg !== null;
}
exports.isObject = isObject;

function isDate(d) {
  return isObject(d) && objectToString(d) === '[object Date]';
}
exports.isDate = isDate;

function isError(e) {
  return isObject(e) &&
      (objectToString(e) === '[object Error]' || e instanceof Error);
}
exports.isError = isError;

function isFunction(arg) {
  return typeof arg === 'function';
}
exports.isFunction = isFunction;

function isPrimitive(arg) {
  return arg === null ||
         typeof arg === 'boolean' ||
         typeof arg === 'number' ||
         typeof arg === 'string' ||
         typeof arg === 'symbol' ||  // ES6 symbol
         typeof arg === 'undefined';
}
exports.isPrimitive = isPrimitive;

exports.isBuffer = require('./support/isBuffer');

function objectToString(o) {
  return Object.prototype.toString.call(o);
}


function pad(n) {
  return n < 10 ? '0' + n.toString(10) : n.toString(10);
}


var months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep',
              'Oct', 'Nov', 'Dec'];

// 26 Feb 16:19:34
function timestamp() {
  var d = new Date();
  var time = [pad(d.getHours()),
              pad(d.getMinutes()),
              pad(d.getSeconds())].join(':');
  return [d.getDate(), months[d.getMonth()], time].join(' ');
}


// log is just a thin wrapper to console.log that prepends a timestamp
exports.log = function() {
  console.log('%s - %s', timestamp(), exports.format.apply(exports, arguments));
};


/**
 * Inherit the prototype methods from one constructor into another.
 *
 * The Function.prototype.inherits from lang.js rewritten as a standalone
 * function (not on Function.prototype). NOTE: If this file is to be loaded
 * during bootstrapping this function needs to be rewritten using some native
 * functions as prototype setup using normal JavaScript does not work as
 * expected during bootstrapping (see mirror.js in r114903).
 *
 * @param {function} ctor Constructor function which needs to inherit the
 *     prototype.
 * @param {function} superCtor Constructor function to inherit prototype from.
 */
exports.inherits = require('inherits');

exports._extend = function(origin, add) {
  // Don't do anything if add isn't an object
  if (!add || !isObject(add)) return origin;

  var keys = Object.keys(add);
  var i = keys.length;
  while (i--) {
    origin[keys[i]] = add[keys[i]];
  }
  return origin;
};

function hasOwnProperty(obj, prop) {
  return Object.prototype.hasOwnProperty.call(obj, prop);
}

}).call(this,require('_process'),typeof global !== "undefined" ? global : typeof self !== "undefined" ? self : typeof window !== "undefined" ? window : {})
},{"./support/isBuffer":16,"_process":10,"inherits":9}]},{},[1]);
