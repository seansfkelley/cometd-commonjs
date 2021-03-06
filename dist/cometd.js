(function(f){if(typeof exports==="object"&&typeof module!=="undefined"){module.exports=f()}else if(typeof define==="function"&&define.amd){define([],f)}else{var g;if(typeof window!=="undefined"){g=window}else if(typeof global!=="undefined"){g=global}else if(typeof self!=="undefined"){g=self}else{g=this}g.CometD = f()}})(function(){var define,module,exports;return (function e(t,n,r){function s(o,u){if(!n[o]){if(!t[o]){var a=typeof require=="function"&&require;if(!u&&a)return a(o,!0);if(i)return i(o,!0);var f=new Error("Cannot find module '"+o+"'");throw f.code="MODULE_NOT_FOUND",f}var l=n[o]={exports:{}};t[o][0].call(l.exports,function(e){var n=t[o][1][e];return s(n?n:e)},l,l.exports,e,t,n,r)}return n[o].exports}var i=typeof require=="function"&&require;for(var o=0;o<r.length;o++)s(r[o]);return s})({1:[function(require,module,exports){
'use strict';

Object.defineProperty(exports, "__esModule", {
    value: true
});

var _typeof = typeof Symbol === "function" && typeof Symbol.iterator === "symbol" ? function (obj) { return typeof obj; } : function (obj) { return obj && typeof Symbol === "function" && obj.constructor === Symbol ? "symbol" : typeof obj; };

exports.default = CometD;

var _Utils = require('./Utils');

var _Utils2 = _interopRequireDefault(_Utils);

var _TransportRegistry = require('./TransportRegistry');

var _TransportRegistry2 = _interopRequireDefault(_TransportRegistry);

function _interopRequireDefault(obj) { return obj && obj.__esModule ? obj : { default: obj }; }

/**
 * The constructor for a CometD object, identified by an optional name.
 * The default name is the string 'default'.
 * In the rare case a page needs more than one Bayeux conversation,
 * a new instance can be created via:
 * <pre>
 * var bayeuxUrl2 = ...;
 *
 * // Dojo style
 * var cometd2 = new dojox.CometD('another_optional_name');
 *
 * // jQuery style
 * var cometd2 = new $.CometD('another_optional_name');
 *
 * cometd2.init({url: bayeuxUrl2});
 * </pre>
 * @param name the optional name of this cometd object
 */

function CometD(name) {
    var _cometd = this;
    var _name = name || 'default';
    var _crossDomain = false;
    var _transports = new _TransportRegistry2.default();
    var _transport;
    var _status = 'disconnected';
    var _messageId = 0;
    var _clientId = null;
    var _batch = 0;
    var _messageQueue = [];
    var _internalBatch = false;
    var _listeners = {};
    var _backoff = 0;
    var _scheduledSend = null;
    var _extensions = [];
    var _advice = {};
    var _handshakeProps;
    var _handshakeCallback;
    var _callbacks = {};
    var _remoteCalls = {};
    var _reestablish = false;
    var _connected = false;
    var _unconnectTime = 0;
    var _handshakeMessages = 0;
    var _config = {
        protocol: null,
        stickyReconnect: true,
        connectTimeout: 0,
        maxConnections: 2,
        backoffIncrement: 1000,
        maxBackoff: 60000,
        logLevel: 'info',
        reverseIncomingExtensions: true,
        maxNetworkDelay: 10000,
        requestHeaders: {},
        appendMessageTypeToURL: true,
        autoBatch: false,
        urls: {},
        maxURILength: 2000,
        advice: {
            timeout: 60000,
            interval: 0,
            reconnect: undefined,
            maxInterval: 0
        }
    };

    function _fieldValue(object, name) {
        try {
            return object[name];
        } catch (x) {
            return undefined;
        }
    }

    /**
     * Mixes in the given objects into the target object by copying the properties.
     * @param deep if the copy must be deep
     * @param target the target object
     * @param objects the objects whose properties are copied into the target
     */
    this._mixin = function (deep, target, objects) {
        var result = target || {};

        // Skip first 2 parameters (deep and target), and loop over the others
        for (var i = 2; i < arguments.length; ++i) {
            var object = arguments[i];

            if (object === undefined || object === null) {
                continue;
            }

            for (var propName in object) {
                if (object.hasOwnProperty(propName)) {
                    var prop = _fieldValue(object, propName);
                    var targ = _fieldValue(result, propName);

                    // Avoid infinite loops
                    if (prop === target) {
                        continue;
                    }
                    // Do not mixin undefined values
                    if (prop === undefined) {
                        continue;
                    }

                    if (deep && (typeof prop === 'undefined' ? 'undefined' : _typeof(prop)) === 'object' && prop !== null) {
                        if (prop instanceof Array) {
                            result[propName] = this._mixin(deep, targ instanceof Array ? targ : [], prop);
                        } else {
                            var source = (typeof targ === 'undefined' ? 'undefined' : _typeof(targ)) === 'object' && !(targ instanceof Array) ? targ : {};
                            result[propName] = this._mixin(deep, source, prop);
                        }
                    } else {
                        result[propName] = prop;
                    }
                }
            }
        }

        return result;
    };

    function _isString(value) {
        return _Utils2.default.isString(value);
    }

    function _isFunction(value) {
        if (value === undefined || value === null) {
            return false;
        }
        return typeof value === 'function';
    }

    function _zeroPad(value, length) {
        var result = '';
        while (--length > 0) {
            if (value >= Math.pow(10, length)) {
                break;
            }
            result += '0';
        }
        result += value;
        return result;
    }

    function _log(level, args) {
        if (window.console) {
            var logger = window.console[level];
            if (_isFunction(logger)) {
                var now = new Date();
                [].splice.call(args, 0, 0, _zeroPad(now.getHours(), 2) + ':' + _zeroPad(now.getMinutes(), 2) + ':' + _zeroPad(now.getSeconds(), 2) + '.' + _zeroPad(now.getMilliseconds(), 3));
                logger.apply(window.console, args);
            }
        }
    }

    this._warn = function () {
        _log('warn', arguments);
    };

    this._info = function () {
        if (_config.logLevel !== 'warn') {
            _log('info', arguments);
        }
    };

    this._debug = function () {
        if (_config.logLevel === 'debug') {
            _log('debug', arguments);
        }
    };

    function _splitURL(url) {
        // [1] = protocol://,
        // [2] = host:port,
        // [3] = host,
        // [4] = IPv6_host,
        // [5] = IPv4_host,
        // [6] = :port,
        // [7] = port,
        // [8] = uri,
        // [9] = rest (query / fragment)
        return (/(^https?:\/\/)?(((\[[^\]]+\])|([^:\/\?#]+))(:(\d+))?)?([^\?#]*)(.*)?/.exec(url)
        );
    }

    /**
     * Returns whether the given hostAndPort is cross domain.
     * The default implementation checks against window.location.host
     * but this function can be overridden to make it work in non-browser
     * environments.
     *
     * @param hostAndPort the host and port in format host:port
     * @return whether the given hostAndPort is cross domain
     */
    this._isCrossDomain = function (hostAndPort) {
        return hostAndPort && hostAndPort !== window.location.host;
    };

    function _configure(configuration) {
        _cometd._debug('Configuring cometd object with', configuration);
        // Support old style param, where only the Bayeux server URL was passed
        if (_isString(configuration)) {
            configuration = { url: configuration };
        }
        if (!configuration) {
            configuration = {};
        }

        _config = _cometd._mixin(false, _config, configuration);

        var url = _cometd.getURL();
        if (!url) {
            throw 'Missing required configuration parameter \'url\' specifying the Bayeux server URL';
        }

        // Check if we're cross domain.
        var urlParts = _splitURL(url);
        var hostAndPort = urlParts[2];
        var uri = urlParts[8];
        var afterURI = urlParts[9];
        _crossDomain = _cometd._isCrossDomain(hostAndPort);

        // Check if appending extra path is supported
        if (_config.appendMessageTypeToURL) {
            if (afterURI !== undefined && afterURI.length > 0) {
                _cometd._info('Appending message type to URI ' + uri + afterURI + ' is not supported, disabling \'appendMessageTypeToURL\' configuration');
                _config.appendMessageTypeToURL = false;
            } else {
                var uriSegments = uri.split('/');
                var lastSegmentIndex = uriSegments.length - 1;
                if (uri.match(/\/$/)) {
                    lastSegmentIndex -= 1;
                }
                if (uriSegments[lastSegmentIndex].indexOf('.') >= 0) {
                    // Very likely the CometD servlet's URL pattern is mapped to an extension, such as *.cometd
                    // It will be difficult to add the extra path in this case
                    _cometd._info('Appending message type to URI ' + uri + ' is not supported, disabling \'appendMessageTypeToURL\' configuration');
                    _config.appendMessageTypeToURL = false;
                }
            }
        }
    }

    function _removeListener(subscription) {
        if (subscription) {
            var subscriptions = _listeners[subscription.channel];
            if (subscriptions && subscriptions[subscription.id]) {
                delete subscriptions[subscription.id];
                _cometd._debug('Removed', subscription.listener ? 'listener' : 'subscription', subscription);
            }
        }
    }

    function _removeSubscription(subscription) {
        if (subscription && !subscription.listener) {
            _removeListener(subscription);
        }
    }

    function _clearSubscriptions() {
        for (var channel in _listeners) {
            if (_listeners.hasOwnProperty(channel)) {
                var subscriptions = _listeners[channel];
                if (subscriptions) {
                    for (var i = 0; i < subscriptions.length; ++i) {
                        _removeSubscription(subscriptions[i]);
                    }
                }
            }
        }
    }

    function _setStatus(newStatus) {
        if (_status !== newStatus) {
            _cometd._debug('Status', _status, '->', newStatus);
            _status = newStatus;
        }
    }

    function _isDisconnected() {
        return _status === 'disconnecting' || _status === 'disconnected';
    }

    function _nextMessageId() {
        var result = ++_messageId;
        return '' + result;
    }

    function _applyExtension(scope, callback, name, message, outgoing) {
        try {
            return callback.call(scope, message);
        } catch (x) {
            var handler = _cometd.onExtensionException;
            if (_isFunction(handler)) {
                _cometd._debug('Invoking extension exception handler', name, x);
                try {
                    handler.call(_cometd, x, name, outgoing, message);
                } catch (xx) {
                    _cometd._info('Exception during execution of extension exception handler', name, xx);
                }
            } else {
                _cometd._info('Exception during execution of extension', name, x);
            }
            return message;
        }
    }

    function _applyIncomingExtensions(message) {
        for (var i = 0; i < _extensions.length; ++i) {
            if (message === undefined || message === null) {
                break;
            }

            var index = _config.reverseIncomingExtensions ? _extensions.length - 1 - i : i;
            var extension = _extensions[index];
            var callback = extension.extension.incoming;
            if (_isFunction(callback)) {
                var result = _applyExtension(extension.extension, callback, extension.name, message, false);
                message = result === undefined ? message : result;
            }
        }
        return message;
    }

    function _applyOutgoingExtensions(message) {
        for (var i = 0; i < _extensions.length; ++i) {
            if (message === undefined || message === null) {
                break;
            }

            var extension = _extensions[i];
            var callback = extension.extension.outgoing;
            if (_isFunction(callback)) {
                var result = _applyExtension(extension.extension, callback, extension.name, message, true);
                message = result === undefined ? message : result;
            }
        }
        return message;
    }

    function _notify(channel, message) {
        var subscriptions = _listeners[channel];
        if (subscriptions && subscriptions.length > 0) {
            for (var i = 0; i < subscriptions.length; ++i) {
                var subscription = subscriptions[i];
                // Subscriptions may come and go, so the array may have 'holes'
                if (subscription) {
                    try {
                        subscription.callback.call(subscription.scope, message);
                    } catch (x) {
                        var handler = _cometd.onListenerException;
                        if (_isFunction(handler)) {
                            _cometd._debug('Invoking listener exception handler', subscription, x);
                            try {
                                handler.call(_cometd, x, subscription, subscription.listener, message);
                            } catch (xx) {
                                _cometd._info('Exception during execution of listener exception handler', subscription, xx);
                            }
                        } else {
                            _cometd._info('Exception during execution of listener', subscription, message, x);
                        }
                    }
                }
            }
        }
    }

    function _notifyListeners(channel, message) {
        // Notify direct listeners
        _notify(channel, message);

        // Notify the globbing listeners
        var channelParts = channel.split('/');
        var last = channelParts.length - 1;
        for (var i = last; i > 0; --i) {
            var channelPart = channelParts.slice(0, i).join('/') + '/*';
            // We don't want to notify /foo/* if the channel is /foo/bar/baz,
            // so we stop at the first non recursive globbing
            if (i === last) {
                _notify(channelPart, message);
            }
            // Add the recursive globber and notify
            channelPart += '*';
            _notify(channelPart, message);
        }
    }

    function _cancelDelayedSend() {
        if (_scheduledSend !== null) {
            _Utils2.default.clearTimeout(_scheduledSend);
        }
        _scheduledSend = null;
    }

    function _delayedSend(operation, delay) {
        _cancelDelayedSend();
        var time = _advice.interval + delay;
        _cometd._debug('Function scheduled in', time, 'ms, interval =', _advice.interval, 'backoff =', _backoff, operation);
        _scheduledSend = _Utils2.default.setTimeout(_cometd, operation, time);
    }

    // Needed to break cyclic dependencies between function definitions
    var _handleMessages;
    var _handleFailure;

    /**
     * Delivers the messages to the CometD server
     * @param sync whether the send is synchronous
     * @param messages the array of messages to send
     * @param metaConnect true if this send is on /meta/connect
     * @param extraPath an extra path to append to the Bayeux server URL
     */
    function _send(sync, messages, metaConnect, extraPath) {
        // We must be sure that the messages have a clientId.
        // This is not guaranteed since the handshake may take time to return
        // (and hence the clientId is not known yet) and the application
        // may create other messages.
        for (var i = 0; i < messages.length; ++i) {
            var message = messages[i];
            var messageId = message.id;

            if (_clientId) {
                message.clientId = _clientId;
            }

            message = _applyOutgoingExtensions(message);
            if (message !== undefined && message !== null) {
                // Extensions may have modified the message id, but we need to own it.
                message.id = messageId;
                messages[i] = message;
            } else {
                delete _callbacks[messageId];
                messages.splice(i--, 1);
            }
        }

        if (messages.length === 0) {
            return;
        }

        var url = _cometd.getURL();
        if (_config.appendMessageTypeToURL) {
            // If url does not end with '/', then append it
            if (!url.match(/\/$/)) {
                url = url + '/';
            }
            if (extraPath) {
                url = url + extraPath;
            }
        }

        var envelope = {
            url: url,
            sync: sync,
            messages: messages,
            onSuccess: function onSuccess(rcvdMessages) {
                try {
                    _handleMessages.call(_cometd, rcvdMessages);
                } catch (x) {
                    _cometd._info('Exception during handling of messages', x);
                }
            },
            onFailure: function onFailure(conduit, messages, failure) {
                try {
                    var transport = _cometd.getTransport();
                    failure.connectionType = transport ? transport.getType() : "unknown";
                    _handleFailure.call(_cometd, conduit, messages, failure);
                } catch (x) {
                    _cometd._info('Exception during handling of failure', x);
                }
            }
        };
        _cometd._debug('Send', envelope);
        _transport.send(envelope, metaConnect);
    }

    function _queueSend(message) {
        if (_batch > 0 || _internalBatch === true) {
            _messageQueue.push(message);
        } else {
            _send(false, [message], false);
        }
    }

    /**
     * Sends a complete bayeux message.
     * This method is exposed as a public so that extensions may use it
     * to send bayeux message directly, for example in case of re-sending
     * messages that have already been sent but that for some reason must
     * be resent.
     */
    this.send = _queueSend;

    function _resetBackoff() {
        _backoff = 0;
    }

    function _increaseBackoff() {
        if (_backoff < _config.maxBackoff) {
            _backoff += _config.backoffIncrement;
        }
        return _backoff;
    }

    /**
     * Starts a the batch of messages to be sent in a single request.
     * @see #_endBatch(sendMessages)
     */
    function _startBatch() {
        ++_batch;
        _cometd._debug('Starting batch, depth', _batch);
    }

    function _flushBatch() {
        var messages = _messageQueue;
        _messageQueue = [];
        if (messages.length > 0) {
            _send(false, messages, false);
        }
    }

    /**
     * Ends the batch of messages to be sent in a single request,
     * optionally sending messages present in the message queue depending
     * on the given argument.
     * @see #_startBatch()
     */
    function _endBatch() {
        --_batch;
        _cometd._debug('Ending batch, depth', _batch);
        if (_batch < 0) {
            throw 'Calls to startBatch() and endBatch() are not paired';
        }

        if (_batch === 0 && !_isDisconnected() && !_internalBatch) {
            _flushBatch();
        }
    }

    /**
     * Sends the connect message
     */
    function _connect() {
        if (!_isDisconnected()) {
            var bayeuxMessage = {
                id: _nextMessageId(),
                channel: '/meta/connect',
                connectionType: _transport.getType()
            };

            // In case of reload or temporary loss of connection
            // we want the next successful connect to return immediately
            // instead of being held by the server, so that connect listeners
            // can be notified that the connection has been re-established
            if (!_connected) {
                bayeuxMessage.advice = { timeout: 0 };
            }

            _setStatus('connecting');
            _cometd._debug('Connect sent', bayeuxMessage);
            _send(false, [bayeuxMessage], true, 'connect');
            _setStatus('connected');
        }
    }

    function _delayedConnect(delay) {
        _setStatus('connecting');
        _delayedSend(function () {
            _connect();
        }, delay);
    }

    function _updateAdvice(newAdvice) {
        if (newAdvice) {
            _advice = _cometd._mixin(false, {}, _config.advice, newAdvice);
            _cometd._debug('New advice', _advice);
        }
    }

    function _disconnect(abort) {
        _cancelDelayedSend();
        if (abort && _transport) {
            _transport.abort();
        }
        _clientId = null;
        _setStatus('disconnected');
        _batch = 0;
        _resetBackoff();
        _transport = null;

        // Fail any existing queued message
        if (_messageQueue.length > 0) {
            var messages = _messageQueue;
            _messageQueue = [];
            _handleFailure.call(_cometd, undefined, messages, {
                reason: 'Disconnected'
            });
        }
    }

    function _notifyTransportException(oldTransport, newTransport, failure) {
        var handler = _cometd.onTransportException;
        if (_isFunction(handler)) {
            _cometd._debug('Invoking transport exception handler', oldTransport, newTransport, failure);
            try {
                handler.call(_cometd, failure, oldTransport, newTransport);
            } catch (x) {
                _cometd._info('Exception during execution of transport exception handler', x);
            }
        }
    }

    /**
     * Sends the initial handshake message
     */
    function _handshake(handshakeProps, handshakeCallback) {
        if (_isFunction(handshakeProps)) {
            handshakeCallback = handshakeProps;
            handshakeProps = undefined;
        }

        _clientId = null;

        _clearSubscriptions();

        // Reset the transports if we're not retrying the handshake
        if (_isDisconnected()) {
            _transports.reset(true);
            _updateAdvice(_config.advice);
        }

        _batch = 0;

        // Mark the start of an internal batch.
        // This is needed because handshake and connect are async.
        // It may happen that the application calls init() then subscribe()
        // and the subscribe message is sent before the connect message, if
        // the subscribe message is not held until the connect message is sent.
        // So here we start a batch to hold temporarily any message until
        // the connection is fully established.
        _internalBatch = true;

        // Save the properties provided by the user, so that
        // we can reuse them during automatic re-handshake
        _handshakeProps = handshakeProps;
        _handshakeCallback = handshakeCallback;

        var version = '1.0';

        // Figure out the transports to send to the server
        var url = _cometd.getURL();
        var transportTypes = _transports.findTransportTypes(version, _crossDomain, url);

        var bayeuxMessage = {
            id: _nextMessageId(),
            version: version,
            minimumVersion: version,
            channel: '/meta/handshake',
            supportedConnectionTypes: transportTypes,
            advice: {
                timeout: _advice.timeout,
                interval: _advice.interval
            }
        };
        // Do not allow the user to override important fields.
        var message = _cometd._mixin(false, {}, _handshakeProps, bayeuxMessage);

        // Save the callback.
        _cometd._putCallback(message.id, handshakeCallback);

        // Pick up the first available transport as initial transport
        // since we don't know if the server supports it
        if (!_transport) {
            _transport = _transports.negotiateTransport(transportTypes, version, _crossDomain, url);
            if (!_transport) {
                var failure = 'Could not find initial transport among: ' + _transports.getTransportTypes();
                _cometd._warn(failure);
                throw failure;
            }
        }

        _cometd._debug('Initial transport is', _transport.getType());

        // We started a batch to hold the application messages,
        // so here we must bypass it and send immediately.
        _setStatus('handshaking');
        _cometd._debug('Handshake sent', message);
        _send(false, [message], false, 'handshake');
    }

    function _delayedHandshake(delay) {
        _setStatus('handshaking');

        // We will call _handshake() which will reset _clientId, but we want to avoid
        // that between the end of this method and the call to _handshake() someone may
        // call publish() (or other methods that call _queueSend()).
        _internalBatch = true;

        _delayedSend(function () {
            _handshake(_handshakeProps, _handshakeCallback);
        }, delay);
    }

    function _notifyCallback(callback, message) {
        try {
            callback.call(_cometd, message);
        } catch (x) {
            var handler = _cometd.onCallbackException;
            if (_isFunction(handler)) {
                _cometd._debug('Invoking callback exception handler', x);
                try {
                    handler.call(_cometd, x, message);
                } catch (xx) {
                    _cometd._info('Exception during execution of callback exception handler', xx);
                }
            } else {
                _cometd._info('Exception during execution of message callback', x);
            }
        }
    }

    this._getCallback = function (messageId) {
        return _callbacks[messageId];
    };

    this._putCallback = function (messageId, callback) {
        var result = this._getCallback(messageId);
        if (_isFunction(callback)) {
            _callbacks[messageId] = callback;
        }
        return result;
    };

    function _handleCallback(message) {
        var callback = _cometd._getCallback([message.id]);
        if (_isFunction(callback)) {
            delete _callbacks[message.id];
            _notifyCallback(callback, message);
        }
    }

    function _handleRemoteCall(message) {
        var context = _remoteCalls[message.id];
        delete _remoteCalls[message.id];
        if (context) {
            _cometd._debug('Handling remote call response for', message, 'with context', context);

            // Clear the timeout, if present.
            var timeout = context.timeout;
            if (timeout) {
                _Utils2.default.clearTimeout(timeout);
            }

            var callback = context.callback;
            if (_isFunction(callback)) {
                _notifyCallback(callback, message);
                return true;
            }
        }
        return false;
    }

    this.onTransportFailure = function (message, failureInfo, failureHandler) {
        this._debug('Transport failure', failureInfo, 'for', message);

        var transports = this.getTransportRegistry();
        var url = this.getURL();
        var crossDomain = this._isCrossDomain(_splitURL(url)[2]);
        var version = '1.0';
        var transportTypes = transports.findTransportTypes(version, crossDomain, url);

        if (failureInfo.action === 'none') {
            if (message.channel === '/meta/handshake') {
                if (!failureInfo.transport) {
                    var failure = 'Could not negotiate transport, client=[' + transportTypes + '], server=[' + message.supportedConnectionTypes + ']';
                    this._warn(failure);
                    _notifyTransportException(_transport.getType(), null, {
                        reason: failure,
                        connectionType: _transport.getType(),
                        transport: _transport
                    });
                }
            }
        } else {
            failureInfo.delay = this.getBackoffPeriod();
            // Different logic depending on whether we are handshaking or connecting.
            if (message.channel === '/meta/handshake') {
                if (!failureInfo.transport) {
                    // The transport is invalid, try to negotiate again.
                    var newTransport = transports.negotiateTransport(transportTypes, version, crossDomain, url);
                    if (!newTransport) {
                        this._warn('Could not negotiate transport, client=[' + transportTypes + ']');
                        _notifyTransportException(_transport.getType(), null, message.failure);
                        failureInfo.action = 'none';
                    } else {
                        this._debug('Transport', _transport.getType(), '->', newTransport.getType());
                        _notifyTransportException(_transport.getType(), newTransport.getType(), message.failure);
                        failureInfo.action = 'handshake';
                        failureInfo.transport = newTransport;
                    }
                }

                if (failureInfo.action !== 'none') {
                    this.increaseBackoffPeriod();
                }
            } else {
                var now = new Date().getTime();

                if (_unconnectTime === 0) {
                    _unconnectTime = now;
                }

                if (failureInfo.action === 'retry') {
                    failureInfo.delay = this.increaseBackoffPeriod();
                    // Check whether we may switch to handshaking.
                    var maxInterval = _advice.maxInterval;
                    if (maxInterval > 0) {
                        var expiration = _advice.timeout + _advice.interval + maxInterval;
                        var unconnected = now - _unconnectTime;
                        if (unconnected + _backoff > expiration) {
                            failureInfo.action = 'handshake';
                        }
                    }
                }

                if (failureInfo.action === 'handshake') {
                    failureInfo.delay = 0;
                    transports.reset(false);
                    this.resetBackoffPeriod();
                }
            }
        }

        failureHandler.call(_cometd, failureInfo);
    };

    function _handleTransportFailure(failureInfo) {
        _cometd._debug('Transport failure handling', failureInfo);

        if (failureInfo.transport) {
            _transport = failureInfo.transport;
        }

        if (failureInfo.url) {
            _transport.setURL(failureInfo.url);
        }

        var action = failureInfo.action;
        var delay = failureInfo.delay || 0;
        switch (action) {
            case 'handshake':
                _delayedHandshake(delay);
                break;
            case 'retry':
                _delayedConnect(delay);
                break;
            case 'none':
                _disconnect(true);
                break;
            default:
                throw 'Unknown action ' + action;
        }
    }

    function _failHandshake(message, failureInfo) {
        _handleCallback(message);
        _notifyListeners('/meta/handshake', message);
        _notifyListeners('/meta/unsuccessful', message);

        // The listeners may have disconnected.
        if (_isDisconnected()) {
            failureInfo.action = 'none';
        }

        _cometd.onTransportFailure.call(_cometd, message, failureInfo, _handleTransportFailure);
    }

    function _handshakeResponse(message) {
        var url = _cometd.getURL();
        if (message.successful) {
            var crossDomain = _cometd._isCrossDomain(_splitURL(url)[2]);
            var newTransport = _transports.negotiateTransport(message.supportedConnectionTypes, message.version, crossDomain, url);
            if (newTransport === null) {
                message.successful = false;
                _failHandshake(message, {
                    cause: 'negotiation',
                    action: 'none',
                    transport: null
                });
                return;
            } else if (_transport !== newTransport) {
                _cometd._debug('Transport', _transport.getType(), '->', newTransport.getType());
                _transport = newTransport;
            }

            _clientId = message.clientId;

            // End the internal batch and allow held messages from the application
            // to go to the server (see _handshake() where we start the internal batch).
            _internalBatch = false;
            _flushBatch();

            // Here the new transport is in place, as well as the clientId, so
            // the listeners can perform a publish() if they want.
            // Notify the listeners before the connect below.
            message.reestablish = _reestablish;
            _reestablish = true;

            _handleCallback(message);
            _notifyListeners('/meta/handshake', message);

            _handshakeMessages = message['x-messages'] || 0;

            var action = _isDisconnected() ? 'none' : _advice.reconnect || 'retry';
            switch (action) {
                case 'retry':
                    _resetBackoff();
                    if (_handshakeMessages === 0) {
                        _delayedConnect(0);
                    } else {
                        _cometd._debug('Processing', _handshakeMessages, 'handshake-delivered messages');
                    }
                    break;
                case 'none':
                    _disconnect(true);
                    break;
                default:
                    throw 'Unrecognized advice action ' + action;
            }
        } else {
            _failHandshake(message, {
                cause: 'unsuccessful',
                action: _advice.reconnect || 'handshake',
                transport: _transport
            });
        }
    }

    function _handshakeFailure(message) {
        _failHandshake(message, {
            cause: 'failure',
            action: 'handshake',
            transport: null
        });
    }

    function _failConnect(message, failureInfo) {
        // Notify the listeners after the status change but before the next action.
        _notifyListeners('/meta/connect', message);
        _notifyListeners('/meta/unsuccessful', message);

        // The listeners may have disconnected.
        if (_isDisconnected()) {
            failureInfo.action = 'none';
        }

        _cometd.onTransportFailure.call(_cometd, message, failureInfo, _handleTransportFailure);
    }

    function _connectResponse(message) {
        _connected = message.successful;

        if (_connected) {
            _notifyListeners('/meta/connect', message);

            // Normally, the advice will say "reconnect: 'retry', interval: 0"
            // and the server will hold the request, so when a response returns
            // we immediately call the server again (long polling).
            // Listeners can call disconnect(), so check the state after they run.
            var action = _isDisconnected() ? 'none' : _advice.reconnect || 'retry';
            switch (action) {
                case 'retry':
                    _resetBackoff();
                    _delayedConnect(_backoff);
                    break;
                case 'none':
                    _disconnect(false);
                    break;
                default:
                    throw 'Unrecognized advice action ' + action;
            }
        } else {
            _failConnect(message, {
                cause: 'unsuccessful',
                action: _advice.reconnect || 'retry',
                transport: _transport
            });
        }
    }

    function _connectFailure(message) {
        _connected = false;

        _failConnect(message, {
            cause: 'failure',
            action: 'retry',
            transport: null
        });
    }

    function _failDisconnect(message) {
        _disconnect(true);
        _handleCallback(message);
        _notifyListeners('/meta/disconnect', message);
        _notifyListeners('/meta/unsuccessful', message);
    }

    function _disconnectResponse(message) {
        if (message.successful) {
            // Wait for the /meta/connect to arrive.
            _disconnect(false);
            _handleCallback(message);
            _notifyListeners('/meta/disconnect', message);
        } else {
            _failDisconnect(message);
        }
    }

    function _disconnectFailure(message) {
        _failDisconnect(message);
    }

    function _failSubscribe(message) {
        var subscriptions = _listeners[message.subscription];
        if (subscriptions) {
            for (var i = subscriptions.length - 1; i >= 0; --i) {
                var subscription = subscriptions[i];
                if (subscription && !subscription.listener) {
                    delete subscriptions[i];
                    _cometd._debug('Removed failed subscription', subscription);
                    break;
                }
            }
        }
        _handleCallback(message);
        _notifyListeners('/meta/subscribe', message);
        _notifyListeners('/meta/unsuccessful', message);
    }

    function _subscribeResponse(message) {
        if (message.successful) {
            _handleCallback(message);
            _notifyListeners('/meta/subscribe', message);
        } else {
            _failSubscribe(message);
        }
    }

    function _subscribeFailure(message) {
        _failSubscribe(message);
    }

    function _failUnsubscribe(message) {
        _handleCallback(message);
        _notifyListeners('/meta/unsubscribe', message);
        _notifyListeners('/meta/unsuccessful', message);
    }

    function _unsubscribeResponse(message) {
        if (message.successful) {
            _handleCallback(message);
            _notifyListeners('/meta/unsubscribe', message);
        } else {
            _failUnsubscribe(message);
        }
    }

    function _unsubscribeFailure(message) {
        _failUnsubscribe(message);
    }

    function _failMessage(message) {
        if (!_handleRemoteCall(message)) {
            _handleCallback(message);
            _notifyListeners('/meta/publish', message);
            _notifyListeners('/meta/unsuccessful', message);
        }
    }

    function _messageResponse(message) {
        if (message.data !== undefined) {
            if (!_handleRemoteCall(message)) {
                _notifyListeners(message.channel, message);
                if (_handshakeMessages > 0) {
                    --_handshakeMessages;
                    if (_handshakeMessages === 0) {
                        _cometd._debug('Processed last handshake-delivered message');
                        _delayedConnect(0);
                    }
                }
            }
        } else {
            if (message.successful === undefined) {
                _cometd._warn('Unknown Bayeux Message', message);
            } else {
                if (message.successful) {
                    _handleCallback(message);
                    _notifyListeners('/meta/publish', message);
                } else {
                    _failMessage(message);
                }
            }
        }
    }

    function _messageFailure(failure) {
        _failMessage(failure);
    }

    function _receive(message) {
        _unconnectTime = 0;

        message = _applyIncomingExtensions(message);
        if (message === undefined || message === null) {
            return;
        }

        _updateAdvice(message.advice);

        var channel = message.channel;
        switch (channel) {
            case '/meta/handshake':
                _handshakeResponse(message);
                break;
            case '/meta/connect':
                _connectResponse(message);
                break;
            case '/meta/disconnect':
                _disconnectResponse(message);
                break;
            case '/meta/subscribe':
                _subscribeResponse(message);
                break;
            case '/meta/unsubscribe':
                _unsubscribeResponse(message);
                break;
            default:
                _messageResponse(message);
                break;
        }
    }

    /**
     * Receives a message.
     * This method is exposed as a public so that extensions may inject
     * messages simulating that they had been received.
     */
    this.receive = _receive;

    _handleMessages = function _handleMessages(rcvdMessages) {
        _cometd._debug('Received', rcvdMessages);

        for (var i = 0; i < rcvdMessages.length; ++i) {
            var message = rcvdMessages[i];
            _receive(message);
        }
    };

    _handleFailure = function _handleFailure(conduit, messages, failure) {
        _cometd._debug('handleFailure', conduit, messages, failure);

        failure.transport = conduit;
        for (var i = 0; i < messages.length; ++i) {
            var message = messages[i];
            var failureMessage = {
                id: message.id,
                successful: false,
                channel: message.channel,
                failure: failure
            };
            failure.message = message;
            switch (message.channel) {
                case '/meta/handshake':
                    _handshakeFailure(failureMessage);
                    break;
                case '/meta/connect':
                    _connectFailure(failureMessage);
                    break;
                case '/meta/disconnect':
                    _disconnectFailure(failureMessage);
                    break;
                case '/meta/subscribe':
                    failureMessage.subscription = message.subscription;
                    _subscribeFailure(failureMessage);
                    break;
                case '/meta/unsubscribe':
                    failureMessage.subscription = message.subscription;
                    _unsubscribeFailure(failureMessage);
                    break;
                default:
                    _messageFailure(failureMessage);
                    break;
            }
        }
    };

    function _hasSubscriptions(channel) {
        var subscriptions = _listeners[channel];
        if (subscriptions) {
            for (var i = 0; i < subscriptions.length; ++i) {
                if (subscriptions[i]) {
                    return true;
                }
            }
        }
        return false;
    }

    function _resolveScopedCallback(scope, callback) {
        var delegate = {
            scope: scope,
            method: callback
        };
        if (_isFunction(scope)) {
            delegate.scope = undefined;
            delegate.method = scope;
        } else {
            if (_isString(callback)) {
                if (!scope) {
                    throw 'Invalid scope ' + scope;
                }
                delegate.method = scope[callback];
                if (!_isFunction(delegate.method)) {
                    throw 'Invalid callback ' + callback + ' for scope ' + scope;
                }
            } else if (!_isFunction(callback)) {
                throw 'Invalid callback ' + callback;
            }
        }
        return delegate;
    }

    function _addListener(channel, scope, callback, isListener) {
        // The data structure is a map<channel, subscription[]>, where each subscription
        // holds the callback to be called and its scope.

        var delegate = _resolveScopedCallback(scope, callback);
        _cometd._debug('Adding', isListener ? 'listener' : 'subscription', 'on', channel, 'with scope', delegate.scope, 'and callback', delegate.method);

        var subscription = {
            channel: channel,
            scope: delegate.scope,
            callback: delegate.method,
            listener: isListener
        };

        var subscriptions = _listeners[channel];
        if (!subscriptions) {
            subscriptions = [];
            _listeners[channel] = subscriptions;
        }

        // Pushing onto an array appends at the end and returns the id associated with the element increased by 1.
        // Note that if:
        // a.push('a'); var hb=a.push('b'); delete a[hb-1]; var hc=a.push('c');
        // then:
        // hc==3, a.join()=='a',,'c', a.length==3
        subscription.id = subscriptions.push(subscription) - 1;

        _cometd._debug('Added', isListener ? 'listener' : 'subscription', subscription);

        // For backward compatibility: we used to return [channel, subscription.id]
        subscription[0] = channel;
        subscription[1] = subscription.id;

        return subscription;
    }

    //
    // PUBLIC API
    //

    /**
     * Registers the given transport under the given transport type.
     * The optional index parameter specifies the "priority" at which the
     * transport is registered (where 0 is the max priority).
     * If a transport with the same type is already registered, this function
     * does nothing and returns false.
     * @param type the transport type
     * @param transport the transport object
     * @param index the index at which this transport is to be registered
     * @return true if the transport has been registered, false otherwise
     * @see #unregisterTransport(type)
     */
    this.registerTransport = function (type, transport, index) {
        var result = _transports.add(type, transport, index);
        if (result) {
            this._debug('Registered transport', type);

            if (_isFunction(transport.registered)) {
                transport.registered(type, this);
            }
        }
        return result;
    };

    /**
     * Unregisters the transport with the given transport type.
     * @param type the transport type to unregister
     * @return the transport that has been unregistered,
     * or null if no transport was previously registered under the given transport type
     */
    this.unregisterTransport = function (type) {
        var transport = _transports.remove(type);
        if (transport !== null) {
            this._debug('Unregistered transport', type);

            if (_isFunction(transport.unregistered)) {
                transport.unregistered();
            }
        }
        return transport;
    };

    this.unregisterTransports = function () {
        _transports.clear();
    };

    /**
     * @return an array of all registered transport types
     */
    this.getTransportTypes = function () {
        return _transports.getTransportTypes();
    };

    this.findTransport = function (name) {
        return _transports.find(name);
    };

    /**
     * @returns the TransportRegistry object
     */
    this.getTransportRegistry = function () {
        return _transports;
    };

    /**
     * Configures the initial Bayeux communication with the Bayeux server.
     * Configuration is passed via an object that must contain a mandatory field <code>url</code>
     * of type string containing the URL of the Bayeux server.
     * @param configuration the configuration object
     */
    this.configure = function (configuration) {
        _configure.call(this, configuration);
    };

    /**
     * Configures and establishes the Bayeux communication with the Bayeux server
     * via a handshake and a subsequent connect.
     * @param configuration the configuration object
     * @param handshakeProps an object to be merged with the handshake message
     * @see #configure(configuration)
     * @see #handshake(handshakeProps)
     */
    this.init = function (configuration, handshakeProps) {
        this.configure(configuration);
        this.handshake(handshakeProps);
    };

    /**
     * Establishes the Bayeux communication with the Bayeux server
     * via a handshake and a subsequent connect.
     * @param handshakeProps an object to be merged with the handshake message
     * @param handshakeCallback a function to be invoked when the handshake is acknowledged
     */
    this.handshake = function (handshakeProps, handshakeCallback) {
        _setStatus('disconnected');
        _reestablish = false;
        _handshake(handshakeProps, handshakeCallback);
    };

    /**
     * Disconnects from the Bayeux server.
     * It is possible to suggest to attempt a synchronous disconnect, but this feature
     * may only be available in certain transports (for example, long-polling may support
     * it, callback-polling certainly does not).
     * @param sync whether attempt to perform a synchronous disconnect
     * @param disconnectProps an object to be merged with the disconnect message
     * @param disconnectCallback a function to be invoked when the disconnect is acknowledged
     */
    this.disconnect = function (sync, disconnectProps, disconnectCallback) {
        if (_isDisconnected()) {
            return;
        }

        if (typeof sync !== 'boolean') {
            disconnectCallback = disconnectProps;
            disconnectProps = sync;
            sync = false;
        }
        if (_isFunction(disconnectProps)) {
            disconnectCallback = disconnectProps;
            disconnectProps = undefined;
        }

        var bayeuxMessage = {
            id: _nextMessageId(),
            channel: '/meta/disconnect'
        };
        // Do not allow the user to override important fields.
        var message = this._mixin(false, {}, disconnectProps, bayeuxMessage);

        // Save the callback.
        _cometd._putCallback(message.id, disconnectCallback);

        _setStatus('disconnecting');
        _send(sync === true, [message], false, 'disconnect');
    };

    /**
     * Marks the start of a batch of application messages to be sent to the server
     * in a single request, obtaining a single response containing (possibly) many
     * application reply messages.
     * Messages are held in a queue and not sent until {@link #endBatch()} is called.
     * If startBatch() is called multiple times, then an equal number of endBatch()
     * calls must be made to close and send the batch of messages.
     * @see #endBatch()
     */
    this.startBatch = function () {
        _startBatch();
    };

    /**
     * Marks the end of a batch of application messages to be sent to the server
     * in a single request.
     * @see #startBatch()
     */
    this.endBatch = function () {
        _endBatch();
    };

    /**
     * Executes the given callback in the given scope, surrounded by a {@link #startBatch()}
     * and {@link #endBatch()} calls.
     * @param scope the scope of the callback, may be omitted
     * @param callback the callback to be executed within {@link #startBatch()} and {@link #endBatch()} calls
     */
    this.batch = function (scope, callback) {
        var delegate = _resolveScopedCallback(scope, callback);
        this.startBatch();
        try {
            delegate.method.call(delegate.scope);
            this.endBatch();
        } catch (x) {
            this._info('Exception during execution of batch', x);
            this.endBatch();
            throw x;
        }
    };

    /**
     * Adds a listener for bayeux messages, performing the given callback in the given scope
     * when a message for the given channel arrives.
     * @param channel the channel the listener is interested to
     * @param scope the scope of the callback, may be omitted
     * @param callback the callback to call when a message is sent to the channel
     * @returns the subscription handle to be passed to {@link #removeListener(object)}
     * @see #removeListener(subscription)
     */
    this.addListener = function (channel, scope, callback) {
        if (arguments.length < 2) {
            throw 'Illegal arguments number: required 2, got ' + arguments.length;
        }
        if (!_isString(channel)) {
            throw 'Illegal argument type: channel must be a string';
        }

        return _addListener(channel, scope, callback, true);
    };

    /**
     * Removes the subscription obtained with a call to {@link #addListener(string, object, function)}.
     * @param subscription the subscription to unsubscribe.
     * @see #addListener(channel, scope, callback)
     */
    this.removeListener = function (subscription) {
        // Beware of subscription.id == 0, which is falsy => cannot use !subscription.id
        if (!subscription || !subscription.channel || !("id" in subscription)) {
            throw 'Invalid argument: expected subscription, not ' + subscription;
        }

        _removeListener(subscription);
    };

    /**
     * Removes all listeners registered with {@link #addListener(channel, scope, callback)} or
     * {@link #subscribe(channel, scope, callback)}.
     */
    this.clearListeners = function () {
        _listeners = {};
    };

    /**
     * Subscribes to the given channel, performing the given callback in the given scope
     * when a message for the channel arrives.
     * @param channel the channel to subscribe to
     * @param scope the scope of the callback, may be omitted
     * @param callback the callback to call when a message is sent to the channel
     * @param subscribeProps an object to be merged with the subscribe message
     * @param subscribeCallback a function to be invoked when the subscription is acknowledged
     * @return the subscription handle to be passed to {@link #unsubscribe(object)}
     */
    this.subscribe = function (channel, scope, callback, subscribeProps, subscribeCallback) {
        if (arguments.length < 2) {
            throw 'Illegal arguments number: required 2, got ' + arguments.length;
        }
        if (!_isString(channel)) {
            throw 'Illegal argument type: channel must be a string';
        }
        if (_isDisconnected()) {
            throw 'Illegal state: already disconnected';
        }

        // Normalize arguments
        if (_isFunction(scope)) {
            subscribeCallback = subscribeProps;
            subscribeProps = callback;
            callback = scope;
            scope = undefined;
        }
        if (_isFunction(subscribeProps)) {
            subscribeCallback = subscribeProps;
            subscribeProps = undefined;
        }

        // Only send the message to the server if this client has not yet subscribed to the channel
        var send = !_hasSubscriptions(channel);

        var subscription = _addListener(channel, scope, callback, false);

        if (send) {
            // Send the subscription message after the subscription registration to avoid
            // races where the server would send a message to the subscribers, but here
            // on the client the subscription has not been added yet to the data structures
            var bayeuxMessage = {
                id: _nextMessageId(),
                channel: '/meta/subscribe',
                subscription: channel
            };
            // Do not allow the user to override important fields.
            var message = this._mixin(false, {}, subscribeProps, bayeuxMessage);

            // Save the callback.
            _cometd._putCallback(message.id, subscribeCallback);

            _queueSend(message);
        }

        return subscription;
    };

    /**
     * Unsubscribes the subscription obtained with a call to {@link #subscribe(string, object, function)}.
     * @param subscription the subscription to unsubscribe.
     * @param unsubscribeProps an object to be merged with the unsubscribe message
     * @param unsubscribeCallback a function to be invoked when the unsubscription is acknowledged
     */
    this.unsubscribe = function (subscription, unsubscribeProps, unsubscribeCallback) {
        if (arguments.length < 1) {
            throw 'Illegal arguments number: required 1, got ' + arguments.length;
        }
        if (_isDisconnected()) {
            throw 'Illegal state: already disconnected';
        }

        if (_isFunction(unsubscribeProps)) {
            unsubscribeCallback = unsubscribeProps;
            unsubscribeProps = undefined;
        }

        // Remove the local listener before sending the message
        // This ensures that if the server fails, this client does not get notifications
        this.removeListener(subscription);

        var channel = subscription.channel;
        // Only send the message to the server if this client unsubscribes the last subscription
        if (!_hasSubscriptions(channel)) {
            var bayeuxMessage = {
                id: _nextMessageId(),
                channel: '/meta/unsubscribe',
                subscription: channel
            };
            // Do not allow the user to override important fields.
            var message = this._mixin(false, {}, unsubscribeProps, bayeuxMessage);

            // Save the callback.
            _cometd._putCallback(message.id, unsubscribeCallback);

            _queueSend(message);
        }
    };

    this.resubscribe = function (subscription, subscribeProps) {
        _removeSubscription(subscription);
        if (subscription) {
            return this.subscribe(subscription.channel, subscription.scope, subscription.callback, subscribeProps);
        }
        return undefined;
    };

    /**
     * Removes all subscriptions added via {@link #subscribe(channel, scope, callback, subscribeProps)},
     * but does not remove the listeners added via {@link addListener(channel, scope, callback)}.
     */
    this.clearSubscriptions = function () {
        _clearSubscriptions();
    };

    /**
     * Publishes a message on the given channel, containing the given content.
     * @param channel the channel to publish the message to
     * @param content the content of the message
     * @param publishProps an object to be merged with the publish message
     * @param publishCallback a function to be invoked when the publish is acknowledged by the server
     */
    this.publish = function (channel, content, publishProps, publishCallback) {
        if (arguments.length < 1) {
            throw 'Illegal arguments number: required 1, got ' + arguments.length;
        }
        if (!_isString(channel)) {
            throw 'Illegal argument type: channel must be a string';
        }
        if (/^\/meta\//.test(channel)) {
            throw 'Illegal argument: cannot publish to meta channels';
        }
        if (_isDisconnected()) {
            throw 'Illegal state: already disconnected';
        }

        if (_isFunction(content)) {
            publishCallback = content;
            content = publishProps = {};
        } else if (_isFunction(publishProps)) {
            publishCallback = publishProps;
            publishProps = {};
        }

        var bayeuxMessage = {
            id: _nextMessageId(),
            channel: channel,
            data: content
        };
        // Do not allow the user to override important fields.
        var message = this._mixin(false, {}, publishProps, bayeuxMessage);

        // Save the callback.
        _cometd._putCallback(message.id, publishCallback);

        _queueSend(message);
    };

    this.remoteCall = function (target, content, timeout, callback) {
        if (arguments.length < 1) {
            throw 'Illegal arguments number: required 1, got ' + arguments.length;
        }
        if (!_isString(target)) {
            throw 'Illegal argument type: target must be a string';
        }
        if (_isDisconnected()) {
            throw 'Illegal state: already disconnected';
        }

        if (_isFunction(content)) {
            callback = content;
            content = {};
            timeout = _config.maxNetworkDelay;
        } else if (_isFunction(timeout)) {
            callback = timeout;
            timeout = _config.maxNetworkDelay;
        }

        if (typeof timeout !== 'number') {
            throw 'Illegal argument type: timeout must be a number';
        }

        if (!target.match(/^\//)) {
            target = '/' + target;
        }
        var channel = '/service' + target;

        var bayeuxMessage = {
            id: _nextMessageId(),
            channel: channel,
            data: content
        };

        var context = {
            callback: callback
        };
        if (timeout > 0) {
            context.timeout = _Utils2.default.setTimeout(_cometd, function () {
                _cometd._debug('Timing out remote call', bayeuxMessage, 'after', timeout, 'ms');
                _failMessage({
                    id: bayeuxMessage.id,
                    error: '406::timeout',
                    successful: false,
                    failure: {
                        message: bayeuxMessage,
                        reason: 'Remote Call Timeout'
                    }
                });
            }, timeout);
            _cometd._debug('Scheduled remote call timeout', bayeuxMessage, 'in', timeout, 'ms');
        }
        _remoteCalls[bayeuxMessage.id] = context;

        _queueSend(bayeuxMessage);
    };

    /**
     * Returns a string representing the status of the bayeux communication with the Bayeux server.
     */
    this.getStatus = function () {
        return _status;
    };

    /**
     * Returns whether this instance has been disconnected.
     */
    this.isDisconnected = _isDisconnected;

    /**
     * Sets the backoff period used to increase the backoff time when retrying an unsuccessful or failed message.
     * Default value is 1 second, which means if there is a persistent failure the retries will happen
     * after 1 second, then after 2 seconds, then after 3 seconds, etc. So for example with 15 seconds of
     * elapsed time, there will be 5 retries (at 1, 3, 6, 10 and 15 seconds elapsed).
     * @param period the backoff period to set
     * @see #getBackoffIncrement()
     */
    this.setBackoffIncrement = function (period) {
        _config.backoffIncrement = period;
    };

    /**
     * Returns the backoff period used to increase the backoff time when retrying an unsuccessful or failed message.
     * @see #setBackoffIncrement(period)
     */
    this.getBackoffIncrement = function () {
        return _config.backoffIncrement;
    };

    /**
     * Returns the backoff period to wait before retrying an unsuccessful or failed message.
     */
    this.getBackoffPeriod = function () {
        return _backoff;
    };

    /**
     * Increases the backoff period up to the maximum value configured.
     * @returns the backoff period after increment
     * @see getBackoffIncrement
     */
    this.increaseBackoffPeriod = function () {
        return _increaseBackoff();
    };

    /**
     * Resets the backoff period to zero.
     */
    this.resetBackoffPeriod = function () {
        _resetBackoff();
    };

    /**
     * Sets the log level for console logging.
     * Valid values are the strings 'error', 'warn', 'info' and 'debug', from
     * less verbose to more verbose.
     * @param level the log level string
     */
    this.setLogLevel = function (level) {
        _config.logLevel = level;
    };

    /**
     * Registers an extension whose callbacks are called for every incoming message
     * (that comes from the server to this client implementation) and for every
     * outgoing message (that originates from this client implementation for the
     * server).
     * The format of the extension object is the following:
     * <pre>
     * {
     *     incoming: function(message) { ... },
     *     outgoing: function(message) { ... }
     * }
     * </pre>
     * Both properties are optional, but if they are present they will be called
     * respectively for each incoming message and for each outgoing message.
     * @param name the name of the extension
     * @param extension the extension to register
     * @return true if the extension was registered, false otherwise
     * @see #unregisterExtension(name)
     */
    this.registerExtension = function (name, extension) {
        if (arguments.length < 2) {
            throw 'Illegal arguments number: required 2, got ' + arguments.length;
        }
        if (!_isString(name)) {
            throw 'Illegal argument type: extension name must be a string';
        }

        var existing = false;
        for (var i = 0; i < _extensions.length; ++i) {
            var existingExtension = _extensions[i];
            if (existingExtension.name === name) {
                existing = true;
                break;
            }
        }
        if (!existing) {
            _extensions.push({
                name: name,
                extension: extension
            });
            this._debug('Registered extension', name);

            // Callback for extensions
            if (_isFunction(extension.registered)) {
                extension.registered(name, this);
            }

            return true;
        } else {
            this._info('Could not register extension with name', name, 'since another extension with the same name already exists');
            return false;
        }
    };

    /**
     * Unregister an extension previously registered with
     * {@link #registerExtension(name, extension)}.
     * @param name the name of the extension to unregister.
     * @return true if the extension was unregistered, false otherwise
     */
    this.unregisterExtension = function (name) {
        if (!_isString(name)) {
            throw 'Illegal argument type: extension name must be a string';
        }

        var unregistered = false;
        for (var i = 0; i < _extensions.length; ++i) {
            var extension = _extensions[i];
            if (extension.name === name) {
                _extensions.splice(i, 1);
                unregistered = true;
                this._debug('Unregistered extension', name);

                // Callback for extensions
                var ext = extension.extension;
                if (_isFunction(ext.unregistered)) {
                    ext.unregistered();
                }

                break;
            }
        }
        return unregistered;
    };

    /**
     * Find the extension registered with the given name.
     * @param name the name of the extension to find
     * @return the extension found or null if no extension with the given name has been registered
     */
    this.getExtension = function (name) {
        for (var i = 0; i < _extensions.length; ++i) {
            var extension = _extensions[i];
            if (extension.name === name) {
                return extension.extension;
            }
        }
        return null;
    };

    /**
     * Returns the name assigned to this CometD object, or the string 'default'
     * if no name has been explicitly passed as parameter to the constructor.
     */
    this.getName = function () {
        return _name;
    };

    /**
     * Returns the clientId assigned by the Bayeux server during handshake.
     */
    this.getClientId = function () {
        return _clientId;
    };

    /**
     * Returns the URL of the Bayeux server.
     */
    this.getURL = function () {
        if (_transport) {
            var url = _transport.getURL();
            if (url) {
                return url;
            }
            url = _config.urls[_transport.getType()];
            if (url) {
                return url;
            }
        }
        return _config.url;
    };

    this.getTransport = function () {
        return _transport;
    };

    this.getConfiguration = function () {
        return this._mixin(true, {}, _config);
    };

    this.getAdvice = function () {
        return this._mixin(true, {}, _advice);
    };
};

},{"./TransportRegistry":2,"./Utils":3}],2:[function(require,module,exports){
'use strict';

Object.defineProperty(exports, "__esModule", {
    value: true
});
exports.default = TransportRegistry;
/**
 * A registry for transports used by the CometD object.
 */
function TransportRegistry() {
    var _types = [];
    var _transports = {};

    this.getTransportTypes = function () {
        return _types.slice(0);
    };

    this.findTransportTypes = function (version, crossDomain, url) {
        var result = [];
        for (var i = 0; i < _types.length; ++i) {
            var type = _types[i];
            if (_transports[type].accept(version, crossDomain, url) === true) {
                result.push(type);
            }
        }
        return result;
    };

    this.negotiateTransport = function (types, version, crossDomain, url) {
        for (var i = 0; i < _types.length; ++i) {
            var type = _types[i];
            for (var j = 0; j < types.length; ++j) {
                if (type === types[j]) {
                    var transport = _transports[type];
                    if (transport.accept(version, crossDomain, url) === true) {
                        return transport;
                    }
                }
            }
        }
        return null;
    };

    this.add = function (type, transport, index) {
        var existing = false;
        for (var i = 0; i < _types.length; ++i) {
            if (_types[i] === type) {
                existing = true;
                break;
            }
        }

        if (!existing) {
            if (typeof index !== 'number') {
                _types.push(type);
            } else {
                _types.splice(index, 0, type);
            }
            _transports[type] = transport;
        }

        return !existing;
    };

    this.find = function (type) {
        for (var i = 0; i < _types.length; ++i) {
            if (_types[i] === type) {
                return _transports[type];
            }
        }
        return null;
    };

    this.remove = function (type) {
        for (var i = 0; i < _types.length; ++i) {
            if (_types[i] === type) {
                _types.splice(i, 1);
                var transport = _transports[type];
                delete _transports[type];
                return transport;
            }
        }
        return null;
    };

    this.clear = function () {
        _types = [];
        _transports = {};
    };

    this.reset = function (init) {
        for (var i = 0; i < _types.length; ++i) {
            _transports[_types[i]].reset(init);
        }
    };
};

},{}],3:[function(require,module,exports){
'use strict';

Object.defineProperty(exports, "__esModule", {
    value: true
});
exports.isString = isString;
exports.isArray = isArray;
exports.inArray = inArray;
exports.setTimeout = setTimeout;
exports.clearTimeout = clearTimeout;
function isString(value) {
    if (value === undefined || value === null) {
        return false;
    }
    return typeof value === 'string' || value instanceof String;
};

function isArray(value) {
    if (value === undefined || value === null) {
        return false;
    }
    return value instanceof Array;
};

/**
 * Returns whether the given element is contained into the given array.
 * @param element the element to check presence for
 * @param array the array to check for the element presence
 * @return the index of the element, if present, or a negative index if the element is not present
 */
function inArray(element, array) {
    for (var i = 0; i < array.length; ++i) {
        if (element === array[i]) {
            return i;
        }
    }
    return -1;
};

function setTimeout(cometd, funktion, delay) {
    return window.setTimeout(function () {
        try {
            cometd._debug('Invoking timed function', funktion);
            funktion();
        } catch (x) {
            cometd._debug('Exception invoking timed function', funktion, x);
        }
    }, delay);
};

function clearTimeout(timeoutHandle) {
    window.clearTimeout(timeoutHandle);
};

exports.default = {
    isString: isString,
    isArray: isArray,
    inArray: inArray,
    setTimeout: setTimeout,
    clearTimeout: clearTimeout
};

},{}],4:[function(require,module,exports){
'use strict';

Object.defineProperty(exports, "__esModule", {
    value: true
});

var _typeof = typeof Symbol === "function" && typeof Symbol.iterator === "symbol" ? function (obj) { return typeof obj; } : function (obj) { return obj && typeof Symbol === "function" && obj.constructor === Symbol ? "symbol" : typeof obj; }; /**
                                                                                                                                                                                                                                                   * This client-side extension enables the client to acknowledge to the server
                                                                                                                                                                                                                                                   * the messages that the client has received.
                                                                                                                                                                                                                                                   * For the acknowledgement to work, the server must be configured with the
                                                                                                                                                                                                                                                   * correspondent server-side ack extension. If both client and server support
                                                                                                                                                                                                                                                   * the ack extension, then the ack functionality will take place automatically.
                                                                                                                                                                                                                                                   * By enabling this extension, all messages arriving from the server will arrive
                                                                                                                                                                                                                                                   * via /meta/connect, so the comet communication will be slightly chattier.
                                                                                                                                                                                                                                                   * The fact that all messages will return via /meta/connect means also that the
                                                                                                                                                                                                                                                   * messages will arrive with total order, which is not guaranteed if messages
                                                                                                                                                                                                                                                   * can arrive via both /meta/connect and normal response.
                                                                                                                                                                                                                                                   * Messages are not acknowledged one by one, but instead a batch of messages is
                                                                                                                                                                                                                                                   * acknowledged when the /meta/connect returns.
                                                                                                                                                                                                                                                   */


exports.default = function () {
    var _cometd;
    var _serverSupportsAcks = false;
    var _transientBatch;
    var _size;
    var _batch;

    function _debug(text, args) {
        _cometd._debug(text, args);
    }

    this.registered = function (name, cometd) {
        _cometd = cometd;
        _debug('AckExtension: executing registration callback');
    };

    this.unregistered = function () {
        _debug('AckExtension: executing unregistration callback');
        _cometd = null;
    };

    this.incoming = function (message) {
        var channel = message.channel;
        var ext = message.ext;
        if (channel === '/meta/handshake') {
            if (ext) {
                var ackField = ext.ack;
                if ((typeof ackField === 'undefined' ? 'undefined' : _typeof(ackField)) === 'object') {
                    // New format.
                    _serverSupportsAcks = ackField.enabled === true;
                    var batch = ackField.batch;
                    var size = ackField.size;
                    if (typeof batch === 'number' && typeof size === 'number') {
                        _transientBatch = batch;
                        _size = size;
                    }
                } else {
                    // Old format.
                    _serverSupportsAcks = ackField === true;
                }
            }
            _debug('AckExtension: server supports acknowledgements', _serverSupportsAcks);
        } else if (channel === '/meta/connect' && message.successful && _serverSupportsAcks) {
            if (ext && typeof ext.ack === 'number') {
                _batch = ext.ack;
                _debug('AckExtension: server sent batch', _batch);
            }
        } else if (!/^\/meta\//.test(channel)) {
            if (_size > 0) {
                --_size;
                if (_size == 0) {
                    _batch = _transientBatch;
                    _transientBatch = 0;
                }
            }
        }
        return message;
    };

    this.outgoing = function (message) {
        var channel = message.channel;
        if (!message.ext) {
            message.ext = {};
        }
        if (channel == '/meta/handshake') {
            message.ext.ack = _cometd && _cometd.ackEnabled !== false;
            _serverSupportsAcks = false;
            _transientBatch = 0;
            _batch = 0;
            _size = 0;
        } else if (channel == '/meta/connect') {
            if (_serverSupportsAcks) {
                message.ext.ack = _batch;
                _debug('AckExtension: client sending batch', _batch);
            }
        }
        return message;
    };
};

;

},{}],5:[function(require,module,exports){
'use strict';

Object.defineProperty(exports, "__esModule", {
    value: true
});

exports.default = function (configuration) {
    var _cometd;
    var _debug;
    var _state = {};
    var _name = 'org.cometd.reload';
    var _batch = false;
    var _reloading = false;

    function _reload(config) {
        if (_state.handshakeResponse) {
            _reloading = true;
            var transport = _cometd.getTransport();
            if (transport) {
                transport.abort();
            }
            _configure(config);
            var state = JSON.stringify(_state);
            _debug('Reload extension saving state', state);
            window.sessionStorage.setItem(_name, state);
        }
    }

    function _similarState(oldState) {
        // We want to check here that the CometD object
        // did not change much between reloads.
        // We just check the URL for now, but in future
        // further checks may involve the transport type
        // and other configuration parameters.
        return _state.url == oldState.url;
    }

    function _configure(config) {
        if (config) {
            if (typeof config.name === 'string') {
                _name = config.name;
            }
        }
    }

    this.configure = _configure;

    this.registered = function (name, cometd) {
        _cometd = cometd;
        _cometd.reload = _reload;
        _debug = _cometd._debug;
    };

    this.unregistered = function () {
        delete _cometd.reload;
        _cometd = null;
    };

    this.outgoing = function (message) {
        switch (message.channel) {
            case '/meta/handshake':
                {
                    _state = {};
                    _state.url = _cometd.getURL();

                    var state = window.sessionStorage.getItem(_name);
                    _debug('Reload extension found state', state);
                    // Is there a saved handshake response from a prior load ?
                    if (state) {
                        try {
                            var oldState = JSON.parse(state);

                            // Remove the state, not needed anymore
                            window.sessionStorage.removeItem(_name);

                            if (oldState.handshakeResponse && _similarState(oldState)) {
                                _debug('Reload extension restoring state', oldState);

                                // Since we are going to abort this message,
                                // we must save an eventual callback to restore
                                // it when we replay the handshake response.
                                var callback = _cometd._getCallback(message.id);

                                setTimeout(function () {
                                    _debug('Reload extension replaying handshake response', oldState.handshakeResponse);
                                    _state.handshakeResponse = oldState.handshakeResponse;
                                    _state.transportType = oldState.transportType;

                                    // Restore the callback.
                                    _cometd._putCallback(message.id, callback);

                                    var response = _cometd._mixin(true, {}, _state.handshakeResponse, {
                                        // Keep the response message id the same as the request.
                                        id: message.id,
                                        // Tells applications this is a handshake replayed by the reload extension.
                                        ext: {
                                            reload: true
                                        }
                                    });
                                    // Use the same transport as before.
                                    response.supportedConnectionTypes = [_state.transportType];

                                    _cometd.receive(response);
                                    _debug('Reload extension replayed handshake response', response);
                                }, 0);

                                // Delay any sends until first connect is complete.
                                // This avoids that there is an old /meta/connect pending on server
                                // that will be resumed to send messages to the client, when the
                                // client has already closed the connection, thereby losing the messages.
                                if (!_batch) {
                                    _batch = true;
                                    _cometd.startBatch();
                                }

                                // This handshake is aborted, as we will replay the prior handshake response
                                return null;
                            } else {
                                _debug('Reload extension could not restore state', oldState);
                            }
                        } catch (x) {
                            _debug('Reload extension error while trying to restore state', x);
                        }
                    }
                    break;
                }
            case '/meta/connect':
                {
                    if (_reloading === true) {
                        // The reload causes the failure of the outstanding /meta/connect,
                        // which CometD will react to by sending another. Here we avoid
                        // that /meta/connect messages are sent between the reload and
                        // the destruction of the JavaScript context, so that we are sure
                        // that the first /meta/connect is the one triggered after the
                        // replay of the /meta/handshake by this extension.
                        _debug('Reload extension aborting /meta/connect during reload');
                        return null;
                    }

                    if (!_state.transportType) {
                        _state.transportType = message.connectionType;
                        _debug('Reload extension tracked transport type', _state.transportType);
                    }
                    break;
                }
            case '/meta/disconnect':
                {
                    _state = {};
                    break;
                }
            default:
                {
                    break;
                }
        }
        return message;
    };

    this.incoming = function (message) {
        if (message.successful) {
            switch (message.channel) {
                case '/meta/handshake':
                    {
                        // If the handshake response is already present, then we're replaying it.
                        // Since the replay may have modified the handshake response, do not record it here.
                        if (!_state.handshakeResponse) {
                            // Save successful handshake response
                            _state.handshakeResponse = message;
                            _debug('Reload extension tracked handshake response', message);
                        }
                        break;
                    }
                case '/meta/connect':
                    {
                        if (_batch) {
                            _batch = false;
                            _cometd.endBatch();
                        }
                        break;
                    }
                case '/meta/disconnect':
                    {
                        _state = {};
                        break;
                    }
                default:
                    {
                        break;
                    }
            }
        }
        return message;
    };

    _configure(configuration);
};

; /**
   * The reload extension allows a page to be loaded (or reloaded)
   * without having to re-handshake in the new (or reloaded) page,
   * therefore resuming the existing CometD connection.
   *
   * When the reload() method is called, the state of the CometD
   * connection is stored in the window.sessionStorage object.
   * The reload() method must therefore be called by page unload
   * handlers, often provided by JavaScript toolkits.
   *
   * When the page is (re)loaded, this extension checks the
   * window.sessionStorage and restores the CometD connection,
   * maintaining the same CometD clientId.
   */

},{}],6:[function(require,module,exports){
"use strict";

Object.defineProperty(exports, "__esModule", {
    value: true
});

exports.default = function () {
    this.outgoing = function (message) {
        message.timestamp = new Date().toUTCString();
        return message;
    };
};

; /**
   * The timestamp extension adds the optional timestamp field to all outgoing messages.
   */

},{}],7:[function(require,module,exports){
'use strict';

Object.defineProperty(exports, "__esModule", {
    value: true
});

exports.default = function (configuration) {
    var _cometd;
    var _maxSamples = configuration && configuration.maxSamples || 10;
    var _lags = [];
    var _offsets = [];
    var _lag = 0;
    var _offset = 0;

    function _debug(text, args) {
        _cometd._debug(text, args);
    }

    this.registered = function (name, cometd) {
        _cometd = cometd;
        _debug('TimeSyncExtension: executing registration callback');
    };

    this.unregistered = function () {
        _debug('TimeSyncExtension: executing unregistration callback');
        _cometd = null;
        _lags = [];
        _offsets = [];
    };

    this.incoming = function (message) {
        var channel = message.channel;
        if (channel && channel.indexOf('/meta/') === 0) {
            if (message.ext && message.ext.timesync) {
                var timesync = message.ext.timesync;
                _debug('TimeSyncExtension: server sent timesync', timesync);

                var now = new Date().getTime();
                var l2 = (now - timesync.tc - timesync.p) / 2;
                var o2 = timesync.ts - timesync.tc - l2;

                _lags.push(l2);
                _offsets.push(o2);
                if (_offsets.length > _maxSamples) {
                    _offsets.shift();
                    _lags.shift();
                }

                var samples = _offsets.length;
                var lagsSum = 0;
                var offsetsSum = 0;
                for (var i = 0; i < samples; ++i) {
                    lagsSum += _lags[i];
                    offsetsSum += _offsets[i];
                }
                _lag = parseInt((lagsSum / samples).toFixed());
                _offset = parseInt((offsetsSum / samples).toFixed());
                _debug('TimeSyncExtension: network lag', _lag, 'ms, time offset with server', _offset, 'ms', _lag, _offset);
            }
        }
        return message;
    };

    this.outgoing = function (message) {
        var channel = message.channel;
        if (channel && channel.indexOf('/meta/') === 0) {
            if (!message.ext) {
                message.ext = {};
            }
            message.ext.timesync = {
                tc: new Date().getTime(),
                l: _lag,
                o: _offset
            };
            _debug('TimeSyncExtension: client sending timesync', message.ext.timesync);
        }
        return message;
    };

    /**
     * Get the estimated offset in ms from the clients clock to the
     * servers clock.  The server time is the client time plus the offset.
     */
    this.getTimeOffset = function () {
        return _offset;
    };

    /**
     * Get an array of multiple offset samples used to calculate
     * the offset.
     */
    this.getTimeOffsetSamples = function () {
        return _offsets;
    };

    /**
     * Get the estimated network lag in ms from the client to the server.
     */
    this.getNetworkLag = function () {
        return _lag;
    };

    /**
     * Get the estimated server time in ms since the epoch.
     */
    this.getServerTime = function () {
        return new Date().getTime() + _offset;
    };

    /**
     *
     * Get the estimated server time as a Date object
     */
    this.getServerDate = function () {
        return new Date(this.getServerTime());
    };

    /**
     * Set a timeout to expire at given time on the server.
     * @param callback The function to call when the timer expires
     * @param atServerTimeOrDate a js Time or Date object representing the
     * server time at which the timeout should expire
     */
    this.setTimeout = function (callback, atServerTimeOrDate) {
        var ts = atServerTimeOrDate instanceof Date ? atServerTimeOrDate.getTime() : 0 + atServerTimeOrDate;
        var tc = ts - _offset;
        var interval = tc - new Date().getTime();
        if (interval <= 0) {
            interval = 1;
        }
        return org_cometd.Utils.setTimeout(_cometd, callback, interval);
    };
};

; /**
   * With each handshake or connect, the extension sends timestamps within the
   * ext field like: <code>{ext:{timesync:{tc:12345567890,l:23,o:4567},...},...}</code>
   * where:<ul>
   *  <li>tc is the client timestamp in ms since 1970 of when the message was sent.
   *  <li>l is the network lag that the client has calculated.
   *  <li>o is the clock offset that the client has calculated.
   * </ul>
   *
   * <p>
   * A cometd server that supports timesync, can respond with an ext
   * field like: <code>{ext:{timesync:{tc:12345567890,ts:1234567900,p:123,a:3},...},...}</code>
   * where:<ul>
   *  <li>tc is the client timestamp of when the message was sent,
   *  <li>ts is the server timestamp of when the message was received
   *  <li>p is the poll duration in ms - ie the time the server took before sending the response.
   *  <li>a is the measured accuracy of the calculated offset and lag sent by the client
   * </ul>
   *
   * <p>
   * The relationship between tc, ts & l is given by <code>ts=tc+o+l</code> (the
   * time the server received the messsage is the client time plus the offset plus the
   * network lag).   Thus the accuracy of the o and l settings can be determined with
   * <code>a=(tc+o+l)-ts</code>.
   * </p>
   * <p>
   * When the client has received the response, it can make a more accurate estimate
   * of the lag as <code>l2=(now-tc-p)/2</code> (assuming symmetric lag).
   * A new offset can then be calculated with the relationship on the client
   * that <code>ts=tc+o2+l2</code>, thus <code>o2=ts-tc-l2</code>.
   * </p>
   * <p>
   * Since the client also receives the a value calculated on the server, it
   * should be possible to analyse this and compensate for some asymmetry
   * in the lag. But the current client does not do this.
   * </p>
   *
   * @param configuration
   */

},{}],8:[function(require,module,exports){
'use strict';

Object.defineProperty(exports, "__esModule", {
  value: true
});

var _AckExtension = require('./AckExtension');

Object.defineProperty(exports, 'AckExtension', {
  enumerable: true,
  get: function get() {
    return _interopRequireDefault(_AckExtension).default;
  }
});

var _ReloadExtension = require('./ReloadExtension');

Object.defineProperty(exports, 'ReloadExtension', {
  enumerable: true,
  get: function get() {
    return _interopRequireDefault(_ReloadExtension).default;
  }
});

var _TimeStampExtension = require('./TimeStampExtension');

Object.defineProperty(exports, 'TimeStampExtension', {
  enumerable: true,
  get: function get() {
    return _interopRequireDefault(_TimeStampExtension).default;
  }
});

var _TimeSyncExtension = require('./TimeSyncExtension');

Object.defineProperty(exports, 'TimeSyncExtension', {
  enumerable: true,
  get: function get() {
    return _interopRequireDefault(_TimeSyncExtension).default;
  }
});

function _interopRequireDefault(obj) { return obj && obj.__esModule ? obj : { default: obj }; }

},{"./AckExtension":4,"./ReloadExtension":5,"./TimeStampExtension":6,"./TimeSyncExtension":7}],9:[function(require,module,exports){
'use strict';

Object.defineProperty(exports, "__esModule", {
  value: true
});

var _CometD = require('./CometD');

Object.defineProperty(exports, 'CometD', {
  enumerable: true,
  get: function get() {
    return _interopRequireDefault(_CometD).default;
  }
});

var _TransportRegistry = require('./TransportRegistry');

Object.defineProperty(exports, 'TransportRegistry', {
  enumerable: true,
  get: function get() {
    return _interopRequireDefault(_TransportRegistry).default;
  }
});

var _extensions = require('./extensions');

var _loop = function _loop(_key3) {
  if (_key3 === "default") return 'continue';
  Object.defineProperty(exports, _key3, {
    enumerable: true,
    get: function get() {
      return _extensions[_key3];
    }
  });
};

for (var _key3 in _extensions) {
  var _ret = _loop(_key3);

  if (_ret === 'continue') continue;
}

var _transports = require('./transports');

var _loop2 = function _loop2(_key4) {
  if (_key4 === "default") return 'continue';
  Object.defineProperty(exports, _key4, {
    enumerable: true,
    get: function get() {
      return _transports[_key4];
    }
  });
};

for (var _key4 in _transports) {
  var _ret2 = _loop2(_key4);

  if (_ret2 === 'continue') continue;
}

function _interopRequireDefault(obj) { return obj && obj.__esModule ? obj : { default: obj }; }

},{"./CometD":1,"./TransportRegistry":2,"./extensions":8,"./transports":15}],10:[function(require,module,exports){
'use strict';

Object.defineProperty(exports, "__esModule", {
    value: true
});
exports.default = CallbackPollingTransport;

var _Transport = require('./Transport');

var _Transport2 = _interopRequireDefault(_Transport);

var _RequestTransport = require('./RequestTransport');

var _RequestTransport2 = _interopRequireDefault(_RequestTransport);

function _interopRequireDefault(obj) { return obj && obj.__esModule ? obj : { default: obj }; }

function CallbackPollingTransport() {
    var _super = new _RequestTransport2.default();
    var _self = (0, _Transport.derive)(_super);

    _self.accept = function (version, crossDomain, url) {
        return true;
    };

    _self.jsonpSend = function (packet) {
        throw 'Abstract';
    };

    function _failTransportFn(envelope, request, x) {
        var self = this;
        return function () {
            self.transportFailure(envelope, request, 'error', x);
        };
    }

    _self.transportSend = function (envelope, request) {
        var self = this;

        // Microsoft Internet Explorer has a 2083 URL max length
        // We must ensure that we stay within that length
        var start = 0;
        var length = envelope.messages.length;
        var lengths = [];
        while (length > 0) {
            // Encode the messages because all brackets, quotes, commas, colons, etc
            // present in the JSON will be URL encoded, taking many more characters
            var json = JSON.stringify(envelope.messages.slice(start, start + length));
            var urlLength = envelope.url.length + encodeURI(json).length;

            var maxLength = this.getConfiguration().maxURILength;
            if (urlLength > maxLength) {
                if (length === 1) {
                    var x = 'Bayeux message too big (' + urlLength + ' bytes, max is ' + maxLength + ') ' + 'for transport ' + this.getType();
                    // Keep the semantic of calling response callbacks asynchronously after the request
                    this.setTimeout(_failTransportFn.call(this, envelope, request, x), 0);
                    return;
                }

                --length;
                continue;
            }

            lengths.push(length);
            start += length;
            length = envelope.messages.length - start;
        }

        // Here we are sure that the messages can be sent within the URL limit

        var envelopeToSend = envelope;
        if (lengths.length > 1) {
            var begin = 0;
            var end = lengths[0];
            this._debug('Transport', this.getType(), 'split', envelope.messages.length, 'messages into', lengths.join(' + '));
            envelopeToSend = this._mixin(false, {}, envelope);
            envelopeToSend.messages = envelope.messages.slice(begin, end);
            envelopeToSend.onSuccess = envelope.onSuccess;
            envelopeToSend.onFailure = envelope.onFailure;

            for (var i = 1; i < lengths.length; ++i) {
                var nextEnvelope = this._mixin(false, {}, envelope);
                begin = end;
                end += lengths[i];
                nextEnvelope.messages = envelope.messages.slice(begin, end);
                nextEnvelope.onSuccess = envelope.onSuccess;
                nextEnvelope.onFailure = envelope.onFailure;
                this.send(nextEnvelope, request.metaConnect);
            }
        }

        this._debug('Transport', this.getType(), 'sending request', request.id, 'envelope', envelopeToSend);

        try {
            var sameStack = true;
            this.jsonpSend({
                transport: this,
                url: envelopeToSend.url,
                sync: envelopeToSend.sync,
                headers: this.getConfiguration().requestHeaders,
                body: JSON.stringify(envelopeToSend.messages),
                onSuccess: function onSuccess(responses) {
                    var success = false;
                    try {
                        var received = self.convertToMessages(responses);
                        if (received.length === 0) {
                            self.transportFailure(envelopeToSend, request, {
                                httpCode: 204
                            });
                        } else {
                            success = true;
                            self.transportSuccess(envelopeToSend, request, received);
                        }
                    } catch (x) {
                        self._debug(x);
                        if (!success) {
                            self.transportFailure(envelopeToSend, request, {
                                exception: x
                            });
                        }
                    }
                },
                onError: function onError(reason, exception) {
                    var failure = {
                        reason: reason,
                        exception: exception
                    };
                    if (sameStack) {
                        // Keep the semantic of calling response callbacks asynchronously after the request
                        self.setTimeout(function () {
                            self.transportFailure(envelopeToSend, request, failure);
                        }, 0);
                    } else {
                        self.transportFailure(envelopeToSend, request, failure);
                    }
                }
            });
            sameStack = false;
        } catch (xx) {
            // Keep the semantic of calling response callbacks asynchronously after the request
            this.setTimeout(function () {
                self.transportFailure(envelopeToSend, request, {
                    exception: xx
                });
            }, 0);
        }
    };

    return _self;
};

},{"./RequestTransport":12,"./Transport":13}],11:[function(require,module,exports){
'use strict';

Object.defineProperty(exports, "__esModule", {
    value: true
});
exports.default = LongPollingTransport;

var _Transport = require('./Transport');

var _Transport2 = _interopRequireDefault(_Transport);

var _RequestTransport = require('./RequestTransport');

var _RequestTransport2 = _interopRequireDefault(_RequestTransport);

function _interopRequireDefault(obj) { return obj && obj.__esModule ? obj : { default: obj }; }

function LongPollingTransport() {
    var _super = new _RequestTransport2.default();
    var _self = (0, _Transport.derive)(_super);
    // By default, support cross domain
    var _supportsCrossDomain = true;

    _self.accept = function (version, crossDomain, url) {
        return _supportsCrossDomain || !crossDomain;
    };

    _self.xhrSend = function (packet) {
        throw 'Abstract';
    };

    _self.transportSend = function (envelope, request) {
        this._debug('Transport', this.getType(), 'sending request', request.id, 'envelope', envelope);

        var self = this;
        try {
            var sameStack = true;
            request.xhr = this.xhrSend({
                transport: this,
                url: envelope.url,
                sync: envelope.sync,
                headers: this.getConfiguration().requestHeaders,
                body: JSON.stringify(envelope.messages),
                onSuccess: function onSuccess(response) {
                    self._debug('Transport', self.getType(), 'received response', response);
                    var success = false;
                    try {
                        var received = self.convertToMessages(response);
                        if (received.length === 0) {
                            _supportsCrossDomain = false;
                            self.transportFailure(envelope, request, {
                                httpCode: 204
                            });
                        } else {
                            success = true;
                            self.transportSuccess(envelope, request, received);
                        }
                    } catch (x) {
                        self._debug(x);
                        if (!success) {
                            _supportsCrossDomain = false;
                            var failure = {
                                exception: x
                            };
                            failure.httpCode = self.xhrStatus(request.xhr);
                            self.transportFailure(envelope, request, failure);
                        }
                    }
                },
                onError: function onError(reason, exception) {
                    self._debug('Transport', self.getType(), 'received error', reason, exception);
                    _supportsCrossDomain = false;
                    var failure = {
                        reason: reason,
                        exception: exception
                    };
                    failure.httpCode = self.xhrStatus(request.xhr);
                    if (sameStack) {
                        // Keep the semantic of calling response callbacks asynchronously after the request
                        self.setTimeout(function () {
                            self.transportFailure(envelope, request, failure);
                        }, 0);
                    } else {
                        self.transportFailure(envelope, request, failure);
                    }
                }
            });
            sameStack = false;
        } catch (x) {
            _supportsCrossDomain = false;
            // Keep the semantic of calling response callbacks asynchronously after the request
            this.setTimeout(function () {
                self.transportFailure(envelope, request, {
                    exception: x
                });
            }, 0);
        }
    };

    _self.reset = function (init) {
        _super.reset(init);
        _supportsCrossDomain = true;
    };

    return _self;
};

},{"./RequestTransport":12,"./Transport":13}],12:[function(require,module,exports){
'use strict';

Object.defineProperty(exports, "__esModule", {
    value: true
});
exports.default = RequestTransport;

var _Utils = require('../Utils');

var _Utils2 = _interopRequireDefault(_Utils);

var _Transport = require('./Transport');

var _Transport2 = _interopRequireDefault(_Transport);

function _interopRequireDefault(obj) { return obj && obj.__esModule ? obj : { default: obj }; }

/**
 * Base object with the common functionality for transports based on requests.
 * The key responsibility is to allow at most 2 outstanding requests to the server,
 * to avoid that requests are sent behind a long poll.
 * To achieve this, we have one reserved request for the long poll, and all other
 * requests are serialized one after the other.
 */
function RequestTransport() {
    var _super = new _Transport2.default();
    var _self = (0, _Transport.derive)(_super);
    var _requestIds = 0;
    var _metaConnectRequest = null;
    var _requests = [];
    var _envelopes = [];

    function _coalesceEnvelopes(envelope) {
        while (_envelopes.length > 0) {
            var envelopeAndRequest = _envelopes[0];
            var newEnvelope = envelopeAndRequest[0];
            var newRequest = envelopeAndRequest[1];
            if (newEnvelope.url === envelope.url && newEnvelope.sync === envelope.sync) {
                _envelopes.shift();
                envelope.messages = envelope.messages.concat(newEnvelope.messages);
                this._debug('Coalesced', newEnvelope.messages.length, 'messages from request', newRequest.id);
                continue;
            }
            break;
        }
    }

    function _transportSend(envelope, request) {
        this.transportSend(envelope, request);
        request.expired = false;

        if (!envelope.sync) {
            var maxDelay = this.getConfiguration().maxNetworkDelay;
            var delay = maxDelay;
            if (request.metaConnect === true) {
                delay += this.getAdvice().timeout;
            }

            this._debug('Transport', this.getType(), 'waiting at most', delay, 'ms for the response, maxNetworkDelay', maxDelay);

            var self = this;
            request.timeout = this.setTimeout(function () {
                request.expired = true;
                var errorMessage = 'Request ' + request.id + ' of transport ' + self.getType() + ' exceeded ' + delay + ' ms max network delay';
                var failure = {
                    reason: errorMessage
                };
                var xhr = request.xhr;
                failure.httpCode = self.xhrStatus(xhr);
                self.abortXHR(xhr);
                self._debug(errorMessage);
                self.complete(request, false, request.metaConnect);
                envelope.onFailure(xhr, envelope.messages, failure);
            }, delay);
        }
    }

    function _queueSend(envelope) {
        var requestId = ++_requestIds;
        var request = {
            id: requestId,
            metaConnect: false,
            envelope: envelope
        };

        // Consider the metaConnect requests which should always be present
        if (_requests.length < this.getConfiguration().maxConnections - 1) {
            _requests.push(request);
            _transportSend.call(this, envelope, request);
        } else {
            this._debug('Transport', this.getType(), 'queueing request', requestId, 'envelope', envelope);
            _envelopes.push([envelope, request]);
        }
    }

    function _metaConnectComplete(request) {
        var requestId = request.id;
        this._debug('Transport', this.getType(), 'metaConnect complete, request', requestId);
        if (_metaConnectRequest !== null && _metaConnectRequest.id !== requestId) {
            throw 'Longpoll request mismatch, completing request ' + requestId;
        }

        // Reset metaConnect request
        _metaConnectRequest = null;
    }

    function _complete(request, success) {
        var index = _Utils2.default.inArray(request, _requests);
        // The index can be negative if the request has been aborted
        if (index >= 0) {
            _requests.splice(index, 1);
        }

        if (_envelopes.length > 0) {
            var envelopeAndRequest = _envelopes.shift();
            var nextEnvelope = envelopeAndRequest[0];
            var nextRequest = envelopeAndRequest[1];
            this._debug('Transport dequeued request', nextRequest.id);
            if (success) {
                if (this.getConfiguration().autoBatch) {
                    _coalesceEnvelopes.call(this, nextEnvelope);
                }
                _queueSend.call(this, nextEnvelope);
                this._debug('Transport completed request', request.id, nextEnvelope);
            } else {
                // Keep the semantic of calling response callbacks asynchronously after the request
                var self = this;
                this.setTimeout(function () {
                    self.complete(nextRequest, false, nextRequest.metaConnect);
                    var failure = {
                        reason: 'Previous request failed'
                    };
                    var xhr = nextRequest.xhr;
                    failure.httpCode = self.xhrStatus(xhr);
                    nextEnvelope.onFailure(xhr, nextEnvelope.messages, failure);
                }, 0);
            }
        }
    }

    _self.complete = function (request, success, metaConnect) {
        if (metaConnect) {
            _metaConnectComplete.call(this, request);
        } else {
            _complete.call(this, request, success);
        }
    };

    /**
     * Performs the actual send depending on the transport type details.
     * @param envelope the envelope to send
     * @param request the request information
     */
    _self.transportSend = function (envelope, request) {
        throw 'Abstract';
    };

    _self.transportSuccess = function (envelope, request, responses) {
        if (!request.expired) {
            this.clearTimeout(request.timeout);
            this.complete(request, true, request.metaConnect);
            if (responses && responses.length > 0) {
                envelope.onSuccess(responses);
            } else {
                envelope.onFailure(request.xhr, envelope.messages, {
                    httpCode: 204
                });
            }
        }
    };

    _self.transportFailure = function (envelope, request, failure) {
        if (!request.expired) {
            this.clearTimeout(request.timeout);
            this.complete(request, false, request.metaConnect);
            envelope.onFailure(request.xhr, envelope.messages, failure);
        }
    };

    function _metaConnectSend(envelope) {
        if (_metaConnectRequest !== null) {
            throw 'Concurrent metaConnect requests not allowed, request id=' + _metaConnectRequest.id + ' not yet completed';
        }

        var requestId = ++_requestIds;
        this._debug('Transport', this.getType(), 'metaConnect send, request', requestId, 'envelope', envelope);
        var request = {
            id: requestId,
            metaConnect: true,
            envelope: envelope
        };
        _transportSend.call(this, envelope, request);
        _metaConnectRequest = request;
    }

    _self.send = function (envelope, metaConnect) {
        if (metaConnect) {
            _metaConnectSend.call(this, envelope);
        } else {
            _queueSend.call(this, envelope);
        }
    };

    _self.abort = function () {
        _super.abort();
        for (var i = 0; i < _requests.length; ++i) {
            var request = _requests[i];
            if (request) {
                this._debug('Aborting request', request);
                if (!this.abortXHR(request.xhr)) {
                    this.transportFailure(request.envelope, request, { reason: 'abort' });
                }
            }
        }
        if (_metaConnectRequest) {
            this._debug('Aborting metaConnect request', _metaConnectRequest);
            if (!this.abortXHR(_metaConnectRequest.xhr)) {
                this.transportFailure(_metaConnectRequest.envelope, _metaConnectRequest, { reason: 'abort' });
            }
        }
        this.reset(true);
    };

    _self.reset = function (init) {
        _super.reset(init);
        _metaConnectRequest = null;
        _requests = [];
        _envelopes = [];
    };

    _self.abortXHR = function (xhr) {
        if (xhr) {
            try {
                var state = xhr.readyState;
                xhr.abort();
                return state !== XMLHttpRequest.UNSENT;
            } catch (x) {
                this._debug(x);
            }
        }
        return false;
    };

    _self.xhrStatus = function (xhr) {
        if (xhr) {
            try {
                return xhr.status;
            } catch (x) {
                this._debug(x);
            }
        }
        return -1;
    };

    return _self;
};

},{"../Utils":3,"./Transport":13}],13:[function(require,module,exports){
'use strict';

Object.defineProperty(exports, "__esModule", {
    value: true
});

var _typeof = typeof Symbol === "function" && typeof Symbol.iterator === "symbol" ? function (obj) { return typeof obj; } : function (obj) { return obj && typeof Symbol === "function" && obj.constructor === Symbol ? "symbol" : typeof obj; };

exports.default = Transport;
exports.derive = derive;

var _Utils = require('../Utils');

var _Utils2 = _interopRequireDefault(_Utils);

function _interopRequireDefault(obj) { return obj && obj.__esModule ? obj : { default: obj }; }

/**
 * Base object with the common functionality for transports.
 */
function Transport() {
    var _type;
    var _cometd;
    var _url;

    /**
     * Function invoked just after a transport has been successfully registered.
     * @param type the type of transport (for example 'long-polling')
     * @param cometd the cometd object this transport has been registered to
     * @see #unregistered()
     */
    this.registered = function (type, cometd) {
        _type = type;
        _cometd = cometd;
    };

    /**
     * Function invoked just after a transport has been successfully unregistered.
     * @see #registered(type, cometd)
     */
    this.unregistered = function () {
        _type = null;
        _cometd = null;
    };

    this._debug = function () {
        _cometd._debug.apply(_cometd, arguments);
    };

    this._mixin = function () {
        return _cometd._mixin.apply(_cometd, arguments);
    };

    this.getConfiguration = function () {
        return _cometd.getConfiguration();
    };

    this.getAdvice = function () {
        return _cometd.getAdvice();
    };

    this.setTimeout = function (funktion, delay) {
        return _Utils2.default.setTimeout(_cometd, funktion, delay);
    };

    this.clearTimeout = function (handle) {
        _Utils2.default.clearTimeout(handle);
    };

    /**
     * Converts the given response into an array of bayeux messages
     * @param response the response to convert
     * @return an array of bayeux messages obtained by converting the response
     */
    this.convertToMessages = function (response) {
        if (_Utils2.default.isString(response)) {
            try {
                return JSON.parse(response);
            } catch (x) {
                this._debug('Could not convert to JSON the following string', '"' + response + '"');
                throw x;
            }
        }
        if (_Utils2.default.isArray(response)) {
            return response;
        }
        if (response === undefined || response === null) {
            return [];
        }
        if (response instanceof Object) {
            return [response];
        }
        throw 'Conversion Error ' + response + ', typeof ' + (typeof response === 'undefined' ? 'undefined' : _typeof(response));
    };

    /**
     * Returns whether this transport can work for the given version and cross domain communication case.
     * @param version a string indicating the transport version
     * @param crossDomain a boolean indicating whether the communication is cross domain
     * @param url the URL to connect to
     * @return true if this transport can work for the given version and cross domain communication case,
     * false otherwise
     */
    this.accept = function (version, crossDomain, url) {
        throw 'Abstract';
    };

    /**
     * Returns the type of this transport.
     * @see #registered(type, cometd)
     */
    this.getType = function () {
        return _type;
    };

    this.getURL = function () {
        return _url;
    };

    this.setURL = function (url) {
        _url = url;
    };

    this.send = function (envelope, metaConnect) {
        throw 'Abstract';
    };

    this.reset = function (init) {
        this._debug('Transport', _type, 'reset', init ? 'initial' : 'retry');
    };

    this.abort = function () {
        this._debug('Transport', _type, 'aborted');
    };

    this.toString = function () {
        return this.getType();
    };
};

function derive(baseObject) {
    function F() {}

    F.prototype = baseObject;
    return new F();
};

},{"../Utils":3}],14:[function(require,module,exports){
'use strict';

Object.defineProperty(exports, "__esModule", {
    value: true
});
exports.default = WebSocketTransport;

var _Utils = require('../Utils');

var _Utils2 = _interopRequireDefault(_Utils);

var _Transport = require('./Transport');

var _Transport2 = _interopRequireDefault(_Transport);

function _interopRequireDefault(obj) { return obj && obj.__esModule ? obj : { default: obj }; }

function WebSocketTransport() {
    var _super = new _Transport2.default();
    var _self = (0, _Transport.derive)(_super);
    var _cometd;
    // By default WebSocket is supported
    var _webSocketSupported = true;
    // Whether we were able to establish a WebSocket connection
    var _webSocketConnected = false;
    var _stickyReconnect = true;
    // The context contains the envelopes that have been sent
    // and the timeouts for the messages that have been sent.
    var _context = null;
    var _connecting = null;
    var _connected = false;
    var _successCallback = null;

    _self.reset = function (init) {
        _super.reset(init);
        _webSocketSupported = true;
        if (init) {
            _webSocketConnected = false;
        }
        _stickyReconnect = true;
        _context = null;
        _connecting = null;
        _connected = false;
    };

    function _forceClose(context, event) {
        if (context) {
            this.webSocketClose(context, event.code, event.reason);
            // Force immediate failure of pending messages to trigger reconnect.
            // This is needed because the server may not reply to our close()
            // and therefore the onclose function is never called.
            this.onClose(context, event);
        }
    }

    function _sameContext(context) {
        return context === _connecting || context === _context;
    }

    function _storeEnvelope(context, envelope, metaConnect) {
        var messageIds = [];
        for (var i = 0; i < envelope.messages.length; ++i) {
            var message = envelope.messages[i];
            if (message.id) {
                messageIds.push(message.id);
            }
        }
        context.envelopes[messageIds.join(',')] = [envelope, metaConnect];
        this._debug('Transport', this.getType(), 'stored envelope, envelopes', context.envelopes);
    }

    function _websocketConnect(context) {
        // We may have multiple attempts to open a WebSocket
        // connection, for example a /meta/connect request that
        // may take time, along with a user-triggered publish.
        // Early return if we are already connecting.
        if (_connecting) {
            return;
        }

        // Mangle the URL, changing the scheme from 'http' to 'ws'.
        var url = _cometd.getURL().replace(/^http/, 'ws');
        this._debug('Transport', this.getType(), 'connecting to URL', url);

        try {
            var protocol = _cometd.getConfiguration().protocol;
            context.webSocket = protocol ? new window.WebSocket(url, protocol) : new window.WebSocket(url);
            _connecting = context;
        } catch (x) {
            _webSocketSupported = false;
            this._debug('Exception while creating WebSocket object', x);
            throw x;
        }

        // By default use sticky reconnects.
        _stickyReconnect = _cometd.getConfiguration().stickyReconnect !== false;

        var self = this;
        var connectTimeout = _cometd.getConfiguration().connectTimeout;
        if (connectTimeout > 0) {
            context.connectTimer = this.setTimeout(function () {
                _cometd._debug('Transport', self.getType(), 'timed out while connecting to URL', url, ':', connectTimeout, 'ms');
                // The connection was not opened, close anyway.
                _forceClose.call(self, context, { code: 1000, reason: 'Connect Timeout' });
            }, connectTimeout);
        }

        var onopen = function onopen() {
            _cometd._debug('WebSocket onopen', context);
            if (context.connectTimer) {
                self.clearTimeout(context.connectTimer);
            }

            if (_sameContext(context)) {
                _connecting = null;
                _context = context;
                _webSocketConnected = true;
                self.onOpen(context);
            } else {
                // We have a valid connection already, close this one.
                _cometd._warn('Closing extra WebSocket connection', this, 'active connection', _context);
                _forceClose.call(self, context, { code: 1000, reason: 'Extra Connection' });
            }
        };

        // This callback is invoked when the server sends the close frame.
        // The close frame for a connection may arrive *after* another
        // connection has been opened, so we must make sure that actions
        // are performed only if it's the same connection.
        var onclose = function onclose(event) {
            event = event || { code: 1000 };
            _cometd._debug('WebSocket onclose', context, event, 'connecting', _connecting, 'current', _context);

            if (context.connectTimer) {
                self.clearTimeout(context.connectTimer);
            }

            self.onClose(context, event);
        };

        var onmessage = function onmessage(wsMessage) {
            _cometd._debug('WebSocket onmessage', wsMessage, context);
            self.onMessage(context, wsMessage);
        };

        context.webSocket.onopen = onopen;
        context.webSocket.onclose = onclose;
        context.webSocket.onerror = function () {
            // Clients should call onclose(), but if they do not we do it here for safety.
            onclose({ code: 1000, reason: 'Error' });
        };
        context.webSocket.onmessage = onmessage;

        this._debug('Transport', this.getType(), 'configured callbacks on', context);
    }

    function _webSocketSend(context, envelope, metaConnect) {
        var json = JSON.stringify(envelope.messages);
        context.webSocket.send(json);
        this._debug('Transport', this.getType(), 'sent', envelope, 'metaConnect =', metaConnect);

        // Manage the timeout waiting for the response.
        var maxDelay = this.getConfiguration().maxNetworkDelay;
        var delay = maxDelay;
        if (metaConnect) {
            delay += this.getAdvice().timeout;
            _connected = true;
        }

        var self = this;
        var messageIds = [];
        for (var i = 0; i < envelope.messages.length; ++i) {
            (function () {
                var message = envelope.messages[i];
                if (message.id) {
                    messageIds.push(message.id);
                    context.timeouts[message.id] = this.setTimeout(function () {
                        _cometd._debug('Transport', self.getType(), 'timing out message', message.id, 'after', delay, 'on', context);
                        _forceClose.call(self, context, { code: 1000, reason: 'Message Timeout' });
                    }, delay);
                }
            }).call(this);
        }

        this._debug('Transport', this.getType(), 'waiting at most', delay, 'ms for messages', messageIds, 'maxNetworkDelay', maxDelay, ', timeouts:', context.timeouts);
    }

    _self._notifySuccess = function (fn, messages) {
        fn.call(this, messages);
    };

    _self._notifyFailure = function (fn, context, messages, failure) {
        fn.call(this, context, messages, failure);
    };

    function _send(context, envelope, metaConnect) {
        try {
            if (context === null) {
                context = _connecting || {
                    envelopes: {},
                    timeouts: {}
                };
                _storeEnvelope.call(this, context, envelope, metaConnect);
                _websocketConnect.call(this, context);
            } else {
                _storeEnvelope.call(this, context, envelope, metaConnect);
                _webSocketSend.call(this, context, envelope, metaConnect);
            }
        } catch (x) {
            // Keep the semantic of calling response callbacks asynchronously after the request.
            var self = this;
            this.setTimeout(function () {
                _forceClose.call(self, context, {
                    code: 1000,
                    reason: 'Exception',
                    exception: x
                });
            }, 0);
        }
    }

    _self.onOpen = function (context) {
        var envelopes = context.envelopes;
        this._debug('Transport', this.getType(), 'opened', context, 'pending messages', envelopes);
        for (var key in envelopes) {
            if (envelopes.hasOwnProperty(key)) {
                var element = envelopes[key];
                var envelope = element[0];
                var metaConnect = element[1];
                // Store the success callback, which is independent from the envelope,
                // so that it can be used to notify arrival of messages.
                _successCallback = envelope.onSuccess;
                _webSocketSend.call(this, context, envelope, metaConnect);
            }
        }
    };

    _self.onMessage = function (context, wsMessage) {
        this._debug('Transport', this.getType(), 'received websocket message', wsMessage, context);

        var close = false;
        var messages = this.convertToMessages(wsMessage.data);
        var messageIds = [];
        for (var i = 0; i < messages.length; ++i) {
            var message = messages[i];

            // Detect if the message is a response to a request we made.
            // If it's a meta message, for sure it's a response; otherwise it's
            // a publish message and publish responses don't have the data field.
            if (/^\/meta\//.test(message.channel) || message.data === undefined) {
                if (message.id) {
                    messageIds.push(message.id);

                    var timeout = context.timeouts[message.id];
                    if (timeout) {
                        this.clearTimeout(timeout);
                        delete context.timeouts[message.id];
                        this._debug('Transport', this.getType(), 'removed timeout for message', message.id, ', timeouts', context.timeouts);
                    }
                }
            }

            if ('/meta/connect' === message.channel) {
                _connected = false;
            }
            if ('/meta/disconnect' === message.channel && !_connected) {
                close = true;
            }
        }

        // Remove the envelope corresponding to the messages.
        var removed = false;
        var envelopes = context.envelopes;
        for (var j = 0; j < messageIds.length; ++j) {
            var id = messageIds[j];
            for (var key in envelopes) {
                if (envelopes.hasOwnProperty(key)) {
                    var ids = key.split(',');
                    var index = _Utils2.default.inArray(id, ids);
                    if (index >= 0) {
                        removed = true;
                        ids.splice(index, 1);
                        var envelope = envelopes[key][0];
                        var metaConnect = envelopes[key][1];
                        delete envelopes[key];
                        if (ids.length > 0) {
                            envelopes[ids.join(',')] = [envelope, metaConnect];
                        }
                        break;
                    }
                }
            }
        }
        if (removed) {
            this._debug('Transport', this.getType(), 'removed envelope, envelopes', envelopes);
        }

        this._notifySuccess(_successCallback, messages);

        if (close) {
            this.webSocketClose(context, 1000, 'Disconnect');
        }
    };

    _self.onClose = function (context, event) {
        this._debug('Transport', this.getType(), 'closed', context, event);

        if (_sameContext(context)) {
            // Remember if we were able to connect.
            // This close event could be due to server shutdown,
            // and if it restarts we want to try websocket again.
            _webSocketSupported = _stickyReconnect && _webSocketConnected;
            _connecting = null;
            _context = null;
        }

        var timeouts = context.timeouts;
        context.timeouts = {};
        for (var id in timeouts) {
            if (timeouts.hasOwnProperty(id)) {
                this.clearTimeout(timeouts[id]);
            }
        }

        var envelopes = context.envelopes;
        context.envelopes = {};
        for (var key in envelopes) {
            if (envelopes.hasOwnProperty(key)) {
                var envelope = envelopes[key][0];
                var metaConnect = envelopes[key][1];
                if (metaConnect) {
                    _connected = false;
                }
                var failure = {
                    websocketCode: event.code,
                    reason: event.reason
                };
                if (event.exception) {
                    failure.exception = event.exception;
                }
                this._notifyFailure(envelope.onFailure, context, envelope.messages, failure);
            }
        }
    };

    _self.registered = function (type, cometd) {
        _super.registered(type, cometd);
        _cometd = cometd;
    };

    _self.accept = function (version, crossDomain, url) {
        this._debug('Transport', this.getType(), 'accept, supported:', _webSocketSupported);
        // Using !! to return a boolean (and not the WebSocket object).
        return _webSocketSupported && !!window.WebSocket && _cometd.websocketEnabled !== false;
    };

    _self.send = function (envelope, metaConnect) {
        this._debug('Transport', this.getType(), 'sending', envelope, 'metaConnect =', metaConnect);
        _send.call(this, _context, envelope, metaConnect);
    };

    _self.webSocketClose = function (context, code, reason) {
        try {
            if (context.webSocket) {
                context.webSocket.close(code, reason);
            }
        } catch (x) {
            this._debug(x);
        }
    };

    _self.abort = function () {
        _super.abort();
        _forceClose.call(this, _context, { code: 1000, reason: 'Abort' });
        this.reset(true);
    };

    return _self;
};

},{"../Utils":3,"./Transport":13}],15:[function(require,module,exports){
'use strict';

Object.defineProperty(exports, "__esModule", {
  value: true
});

var _Transport = require('./Transport');

Object.defineProperty(exports, 'Transport', {
  enumerable: true,
  get: function get() {
    return _interopRequireDefault(_Transport).default;
  }
});
Object.defineProperty(exports, 'derive', {
  enumerable: true,
  get: function get() {
    return _Transport.derive;
  }
});

var _RequestTransport = require('./RequestTransport');

Object.defineProperty(exports, 'RequestTransport', {
  enumerable: true,
  get: function get() {
    return _interopRequireDefault(_RequestTransport).default;
  }
});

var _CallbackPollingTransport = require('./CallbackPollingTransport');

Object.defineProperty(exports, 'CallbackPollingTransport', {
  enumerable: true,
  get: function get() {
    return _interopRequireDefault(_CallbackPollingTransport).default;
  }
});

var _LongPollingTransport = require('./LongPollingTransport');

Object.defineProperty(exports, 'LongPollingTransport', {
  enumerable: true,
  get: function get() {
    return _interopRequireDefault(_LongPollingTransport).default;
  }
});

var _WebSocketTransport = require('./WebSocketTransport');

Object.defineProperty(exports, 'WebSocketTransport', {
  enumerable: true,
  get: function get() {
    return _interopRequireDefault(_WebSocketTransport).default;
  }
});

function _interopRequireDefault(obj) { return obj && obj.__esModule ? obj : { default: obj }; }

},{"./CallbackPollingTransport":10,"./LongPollingTransport":11,"./RequestTransport":12,"./Transport":13,"./WebSocketTransport":14}]},{},[9])(9)
});