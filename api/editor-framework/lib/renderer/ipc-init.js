(() => {
  'use strict';

  const Ipc = require('ipc');

  let _nextSessionId = 1000;
  let _replyCallbacks = {};
  let _channel2replyInfo = {};

  require('../share/ipc-init');

  // Messages

  Ipc.on('editor:sendreq2core:reply', function (sessionId, args) {
    let cb = _replyCallbacks[sessionId];
    if (cb) {
      cb.apply(null, args);
      delete _replyCallbacks[sessionId];
    }
  });

  Ipc.on('editor:send2panel', function () {
    Editor.Panel.dispatch.apply( Editor.Panel, arguments );
  });

  Ipc.on('editor:sendreq2page', function (request, sessionId, args) {
    let called = false;

    function _replyCallback () {
      if ( called ) {
        Editor.error(`The callback which reply to "${request}" can only be called once!`);
        return;
      }

      called = true;
      Ipc.send( 'editor:sendreq2page:reply', sessionId, [].slice.call(arguments) );
    }

    args.unshift(request, _replyCallback);
    if ( !Ipc.emit.apply(Ipc, args) ) {
      Editor.error(`The listener of request "${request}" is not yet registered!`);
    }
  });

  // Communication Patterns

  /**
   * Send message to core-level synchronized and return a result which is responded from core-level
   * @method sendToCoreSync
   * @param {string} message - the message to send
   * @param {...*} [arg] - whatever arguments the message needs
   * @return results
   */
  Editor.sendToCoreSync = function ( message ) {
    if ( typeof message !== 'string' ) {
      Editor.error('The message must be provided');
      return;
    }

    let args = [].slice.call(arguments);
    return Ipc.sendSync.apply( Ipc, [message].concat(args) );
  };

  /**
   * Send message to editor-core, which is so called as main app, or atom shell's browser side.
   * @method sendToCore
   * @param {string} message - the message to send
   * @param {...*} [arg] - whatever arguments the message needs
   */
  Editor.sendToCore = function ( message ) {
    if ( typeof message !== 'string' ) {
      Editor.error('The message must be provided');
      return;
    }

    let args = [].slice.call(arguments);
    Ipc.send.apply( Ipc, ['editor:send2core'].concat( args ) );
  };

  /**
   * Broadcast message to all pages.
   * The page is so called as atom shell's web side. Each application window is an independent page and has its own JavaScript context.
   * @method sendToWindows
   * @param {string} message - the message to send
   * @param {...*} [arg] - whatever arguments the message needs
   * @param {object} [options] - you can indicate the options such as Editor.selfExcluded
   */
  Editor.sendToWindows = function ( message ) {
    if ( typeof message !== 'string' ) {
      Editor.error('The message must be provided');
      return;
    }

    let args = [].slice.call(arguments);
    Ipc.send.apply( Ipc, ['editor:send2wins'].concat( args ) );
  };

  /**
   * Broadcast message to main page.
   * The page is so called as atom shell's web side. Each application window is an independent page and has its own JavaScript context.
   * @method sendToMainWindow
   * @param {string} message - the message to send
   * @param {...*} [arg] - whatever arguments the message needs
   */
  Editor.sendToMainWindow = function ( message ) {
    if ( typeof message !== 'string' ) {
      Editor.error('The message must be provided');
      return;
    }

    let args = [].slice.call(arguments);
    Ipc.send.apply( Ipc, ['editor:send2mainwin'].concat( args ) );
  };

  /**
   * Broadcast message to all pages and editor-core
   * @method sendToAll
   * @param {string} message - the message to send
   * @param {...*} [arg] - whatever arguments the message needs
   * @param {object} [options] - you can indicate the options such as Editor.selfExcluded
   */
  Editor.sendToAll = function ( message ) {
    if ( typeof message !== 'string' ) {
      Editor.error('The message must be provided');
      return;
    }

    let args = [].slice.call(arguments);
    Ipc.send.apply( Ipc, ['editor:send2all'].concat( args ) );
  };

  /**
   * Send message to specific panel
   * @method sendToPanel
   * @param {string} panelID - the panel id
   * @param {string} message - the message to send
   * @param {...*} [arg] - whatever arguments the message needs
   */
  Editor.sendToPanel = function ( panelID, message ) {
    if ( typeof message !== 'string' ) {
      Editor.error('The message must be provided');
      return;
    }

    let args = [].slice.call(arguments);
    Ipc.send.apply( Ipc, ['editor:send2panel'].concat( args ) );
  };

  /**
   * Send `args...` to core via `channel` in asynchronous message, and waiting for the `core-level`
   * to reply the message through `callback`.
   * @method sendRequestToCore
   * @param {string} channel - the request message channel
   * @param {...*} [arg] - whatever arguments the request needs
   * @param {function} reply - the callback used to handle replied arguments
   * @return {number} - session id, can be used in Editor.cancelRequestToCore
   */
  Editor.sendRequestToCore = function (request) {
    if (typeof request !== 'string') {
      Editor.error('The request must be of type string');
      return null;
    }

    let args = [].slice.call(arguments,1);
    if ( args.length < 1 ) {
      Editor.error('Invalid arguments, reply function not found!');
      return null;
    }

    let reply = args[args.length - 1];
    if (typeof reply !== 'function') {
      Editor.error('Invalid arguments, reply function not found!');
      return null;
    }

    args.pop();

    let sessionId = _nextSessionId++;
    _replyCallbacks[sessionId] = reply;

    Ipc.send('editor:sendreq2core', request, sessionId, args);
    return sessionId;
  };

  /**
   * Cancel request sent to core by sessionId
   * @method cancelRequestToCore
   */
  Editor.cancelRequestToCore = function (sessionId) {
    delete _replyCallbacks[sessionId];
  };

  /**
   * Send `args...` to core via `channel` in asynchronous message, and waiting for reply
   * to reply the message through `callback`.
   * @method waitForReply
   * @param {string} channel - the request message channel
   * @param {...*} [arg] - whatever arguments the request needs
   * @param {function} reply - the callback used to handle replied arguments
   * @param {number} [timeout] - timeout for the reply, if timeout = -1, it will never get expired
   * @return {number} - session id, can be used in Editor.cancelRequestToCore
   */
  Editor.waitForReply = function (request) {
    if (typeof request !== 'string') {
      Editor.error('The request must be of type string');
      return null;
    }

    // arguments check
    let args = [].slice.call(arguments, 1);
    let reply, timeout;

    if ( args.length < 1 ) {
      Editor.error('Invalid arguments, reply function not found!');
      return null;
    }

    let lastArg = args[args.length - 1];
    if (typeof lastArg === 'number') {
      if ( args.length < 2 ) {
        Editor.error('Invalid arguments, reply function not found!');
        return null;
      }

      timeout = lastArg;
      args.pop();

      lastArg = args[args.length - 1];
      if (typeof lastArg !== 'function') {
        Editor.error('Invalid arguments, reply function not found!');
        return null;
      }

      reply = lastArg;
      args.pop();
    } else {
      if (typeof lastArg !== 'function') {
        Editor.error('Invalid arguments, reply function not found!');
        return null;
      }

      reply = lastArg;
      timeout = 50;
      args.pop();
    }

    var info = _channel2replyInfo[request];
    if ( !info ) {
      info = {
        nextSessionId: 1000,
        callbacks: {},
      };
      _channel2replyInfo[request] = info;
      Ipc.on( request+':reply', function ( sessionId ) {
        let cb = info.callbacks[sessionId];
        if (cb) {
          let args = [].slice.call(arguments, 1);
          cb.apply(null, args);
          delete info.callbacks[sessionId];
        }
      });
    }

    //
    let sessionId = info.nextSessionId++;
    info.callbacks[sessionId] = reply;

    if ( timeout !== -1 ) {
      setTimeout(function () {
        delete info.callbacks[sessionId];
      },timeout);
    }

    args.unshift(sessionId);
    args.unshift(request);
    Ipc.send.apply( Ipc, ['editor:send2all'].concat( args ) );

    return sessionId;
  };

  /**
   * Cancel wait for reply by channel and sessionId
   * @method cancelWaitForReply
   */
  Editor.cancelWaitForReply = function (channel, sessionId) {
    let info = _channel2replyInfo[channel];
    if ( !info ) {
      return;
    }

    delete info.callbacks[sessionId];
  };

})();
