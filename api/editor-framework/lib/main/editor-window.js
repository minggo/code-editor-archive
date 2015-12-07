'use strict';

const EventEmitter = require('events');
const BrowserWindow = require('browser-window');
const Screen = require('screen');
const Url = require('fire-url');
const Ipc = require('ipc');
const Fs = require('fire-fs');
const _ = require('lodash');

let _windows = [];
let _windowLayouts = {};

/**
 * @module Editor
 */

/**
 * Window class for operating editor window
 * @class Window
 * @extends EventEmitter
 * @constructor
 * @param {string} name - The window name
 * @param {object} options - The options use [BrowserWindow's options](https://github.com/atom/electron/blob/master/docs/api/browser-window.md#new-browserwindowoptions)
 * with the following additional field:
 * @param {string} options.'window-type' - Can be one of the list:
 *  - `dockable`: Indicate the window contains a dockable panel
 *  - `float`: Indicate the window is standalone, and float on top.
 *  - `fixed-size`: Indicate the window is standalone, float on top and non-resizable.
 *  - `quick`: Indicate the window will never destroyed, it only hides itself when it close which make it quick to show the next time.
 * @param {boolean} options.save - Save window position and size
 */
class EditorWindow extends EventEmitter {
  constructor ( name, options ) {
    super();
    options = options || {};

    // set default value for options
    _.defaultsDeep(options, {
      'window-type': 'dockable',
      width: 400,
      height: 300,
      'web-preferences': {
        preload: Editor.url('editor-framework://lib/renderer/index.js'),
      },
    });

    this._loaded = false;
    this._nextSessionId = 0;
    this._replyCallbacks = {};

    // init options
    this.name = name;
    this.hideWhenBlur = false; // control by options['hide-when-blur'] or winType === 'quick';
    this.windowType = options['window-type'];
    this.save = options.save;

    if ( typeof this.save !== 'boolean' ) {
      this.save = true;
    }

    switch ( this.windowType ) {
      case 'dockable':
        options.resizable = true;
        options['always-on-top'] = false;
        break;

      case 'float':
        options.resizable = true;
        options['always-on-top'] = true;
        break;

      case 'fixed-size':
        options.resizable = false;
        options['always-on-top'] = true;
        break;

      case 'quick':
        options.resizable = true;
        options['always-on-top'] = true;
        this.hideWhenBlur = true;
        break;
    }

    this.nativeWin = new BrowserWindow(options);

    if ( this.hideWhenBlur ) {
      this.nativeWin.setAlwaysOnTop(true);
    }

    // ======================
    // BrowserWindow events
    // ======================

    this.nativeWin.on('focus', () => {
      if ( !Editor.focused ) {
        Editor.focused = true;
        Editor.events.emit('focus');
      }
    });

    this.nativeWin.on('blur', () => {
      // BUG: this is an atom-shell bug,
      //      it can not get focused window at the same frame
      // https://github.com/atom/atom-shell/issues/984
      setImmediate(() => {
        if ( !BrowserWindow.getFocusedWindow() ) {
          Editor.focused = false;
          Editor.events.emit('blur');
        }
      });

      if ( this.hideWhenBlur ) {
        // this.nativeWin.close();
        this.nativeWin.hide();
      }
    });

    this.nativeWin.on('close', event => {
      // quick window never close, it just hide
      if ( this.windowType === 'quick' ) {
        event.preventDefault();
        this.nativeWin.hide();
      }

      // NOTE: I can not put these in 'closed' event. In Windows, the getBounds will return
      //       zero width and height in 'closed' event
      Editor.Panel._onWindowClose(this);
      EditorWindow.commitWindowStates();
      EditorWindow.saveWindowStates();
    });

    this.nativeWin.on('closed', () => {
      Editor.Panel._onWindowClosed(this);

      // if we still have sendRequestToPage callbacks,
      // just call them directly to prevent request endless waiting
      for ( let sessionId in this._replyCallbacks ) {
        let cb = this._replyCallbacks[sessionId];
        if (cb) {
          cb();
        }
      }
      this._replyCallbacks = {};

      if ( this.isMainWindow ) {
        EditorWindow.removeWindow(this);
        Editor.mainWindow = null;
        Editor._quit();
      } else {
        EditorWindow.removeWindow(this);
      }

      this.dispose();
    });

    // ======================
    // WebContents events
    // ======================

    // order: dom-ready -> did-frame-finish-load -> did-finish-load

    // this.nativeWin.webContents.on('dom-ready', event => {
    //   Editor.log('dom-ready');
    // });

    // this.nativeWin.webContents.on('did-frame-finish-load', () => {
    //   Editor.log('did-frame-finish-load');
    // });

    this.nativeWin.webContents.on('did-finish-load', () => {
      this._loaded = true;

      // TODO: do we really need this?
      // Editor.sendToCore('window:reloaded', this);
    });

    // NOTE: window must be add after nativeWin assigned
    EditorWindow.addWindow(this);
  }

  /**
   * Dereference the native window.
   */
  dispose () {
    // NOTE: Important to dereference the window object to allow for GC
    this.nativeWin = null;
  }

  /**
   * load page by url, and send argv in query property of the url. The page level will parse
   * the argv when the page is ready and save it in Editor.argv in page level
   * @method load
   * @param {string} url
   * @param {object} argv
   */
  load ( editorUrl, argv ) {
    var resultUrl = Editor.url(editorUrl);
    if ( !resultUrl ) {
      Editor.error( `Failed to load page ${editorUrl} for window "${this.name}"` );
      return;
    }

    this._loaded = false;
    var url = Url.format({
      protocol: 'file',
      pathname: resultUrl,
      slashes: true,
      hash: argv ? encodeURIComponent(JSON.stringify(argv)) : undefined
    });
    this.nativeWin.loadUrl(url);
  }

  /**
   * Show the window
   * @method show
   */
  show () {
    this.nativeWin.show();
  }

  /**
   * Close the window
   * @method close
   */
  close () {
    this._loaded = false;
    this.nativeWin.close();
  }

  /**
   * Focus on the window
   * @method focus
   */
  focus () {
    this.nativeWin.focus();
  }

  /**
   * Minimize the window
   * @method minimize
   */
  minimize () {
    this.nativeWin.minimize();
  }

  /**
   * Restore the window
   * @method restore
   */
  restore () {
    this.nativeWin.restore();
  }

  /**
   * Open the dev-tools
   * @method openDevTools
   * @param {object} options
   * @param {Boolean} options.detach - If open the dev-tools in a new window
   */
  openDevTools (options) {
    this.nativeWin.openDevTools(options);
  }

  /**
   * Try to adjust the window to fit the position and size we give
   * @method adjust
   * @param {number} x
   * @param {number} y
   * @param {number} w
   * @param {number} h
   */
  adjust ( x, y, w, h ) {
    var adjustToCenter = false;
    if ( typeof x !== 'number' ) {
      adjustToCenter = true;
      x = 0;
    }
    if ( typeof y !== 'number' ) {
      adjustToCenter = true;
      y = 0;
    }
    if ( typeof w !== 'number' || w <= 0 ) {
      adjustToCenter = true;
      w = 800;
    }
    if ( typeof h !== 'number' || h <= 0 ) {
      adjustToCenter = true;
      h = 600;
    }

    var display = Screen.getDisplayMatching( { x: x, y: y, width: w, height: h } );
    this.nativeWin.setSize(w,h);
    this.nativeWin.setPosition( display.workArea.x, display.workArea.y );

    if ( adjustToCenter ) {
      this.nativeWin.center();
    }
    else {
      this.nativeWin.setPosition( x, y );
    }
  }

  /**
   * Commit the current window state
   * @method commitWindowState
   * @param {object} layoutInfo
   */
  commitWindowState ( layoutInfo ) {
    // don't do anything if we do not want to save the window
    if ( !this.save )
      return;

    var nativeWin = this.nativeWin;
    var winBounds = nativeWin.getBounds();
    if ( !winBounds.width ) {
      Editor.warn('Failed to commit window state. Invalid window width: %s', winBounds.width);
      winBounds.width = 800;
    }
    if ( !winBounds.height ) {
      Editor.warn('Failed to commit window state. Invalid window height %s', winBounds.height);
      winBounds.height = 600;
    }

    // store windows layout
    var winInfo = _windowLayouts[this.name];
    winInfo = _.assign( winInfo || {}, winBounds);
    if ( layoutInfo ) {
      winInfo.layout = layoutInfo;
    }

    _windowLayouts[this.name] = winInfo;
  }

  /**
   * Restore window's position and size from the `local` profile `layout.windows.json`
   * @method restorePositionAndSize
   */
  restorePositionAndSize () {
    // restore window size and position
    var size = this.nativeWin.getSize();
    var winPosX, winPosY, winSizeX = size[0], winSizeY = size[1];

    var profile = Editor.loadProfile('layout.windows', 'local');
    if ( profile.windows && profile.windows[this.name] ) {
      var winInfo = profile.windows[this.name];
      winPosX = winInfo.x;
      winPosY = winInfo.y;
      winSizeX = winInfo.width;
      winSizeY = winInfo.height;
    }
    this.adjust( winPosX, winPosY, winSizeX, winSizeY );
  }

  // ========================================
  // Ipc
  // ========================================

  /**
   * Send ipc messages to page
   * @method sendToPage
   * @param {string} channel
   * @param {...*} [arg] - whatever arguments the request needs
   */
  sendToPage () {
    var webContents = this.nativeWin.webContents;
    if (webContents) {
      webContents.send.apply( webContents, arguments );
      return;
    }

    Editor.error(`Failed to send "${arguments[0]}" to ${this.name} because web contents not yet loaded`);
  }

  /**
   * Send request to page and wait for the reply
   * [Editor.Window.cancelRequestToPage]
   * @method sendRequestToPage
   * @param {string} request - the request to send
   * @param {...*} [arg] - whatever arguments the request needs
   * @param {function} reply - the callback used to handle replied arguments
   * @return {number} The session id can be used in Editor.Window.cancelRequestToPage
   */
  sendRequestToPage (request) {
    if (typeof request !== 'string') {
      Editor.error('The request must be of type string');
      return -1;
    }

    let reply = arguments[arguments.length - 1];
    if (typeof reply !== 'function') {
      Editor.error('The reply must be of type function');
      return -1;
    }

    let args = [].slice.call(arguments, 1);
    args.pop();

    let sessionId = this._nextSessionId++;
    this._replyCallbacks[sessionId] = reply;

    this.sendToPage('editor:sendreq2page', request, sessionId, args);
    return sessionId;
  }

  /**
   * Cancel request via sessionId
   * @method cancelRequestToPage
   * @param {number} sessionId
   */
  cancelRequestToPage (sessionId) {
    delete this._replyCallbacks[sessionId];
  }

  _reply (args,sessionId) {
    var cb = this._replyCallbacks[sessionId];
    if (cb) {
      cb.apply(null, args);
      delete this._replyCallbacks[sessionId];
    }
  }

  // ========================================
  // static window operation
  // ========================================

  static get windows () {
    return _windows.slice();
  }

  // NOTE: this will in case save-layout not invoke,
  //       and it will missing info for current window
  static loadLayouts () {
    _windowLayouts = {};

    var profile = Editor.loadProfile( 'layout.windows', 'local', {
      windows: {},
    });

    for ( var name in profile.windows ) {
      var info = profile.windows[name];
      _windowLayouts[name] = info;
    }
  }

  /**
   * Find window by name or by BrowserWindow instance
   * @method find
   * @static
   * @param {string|BrowserWindow} param
   * @return {Editor.Window}
   */
  static find ( param ) {
    var i, win;

    if ( typeof param === 'string' ) {
      for ( i = 0; i < _windows.length; ++i ) {
        win = _windows[i];
        if ( win.name === param )
          return win;
      }

      return null;
    }

    if ( param instanceof BrowserWindow ) {
      for ( i = 0; i < _windows.length; ++i ) {
        win = _windows[i];
        if ( win.nativeWin === param )
          return win;
      }

      return null;
    }

    return null;
  }

  /**
   * Add an editor window
   * @method addWindow
   * @static
   * @param {Editor.Window} win
   */
  static addWindow ( win ) {
    _windows.push(win);
  }

  /**
   * Remove an editor window
   * @method removeWindow
   * @static
   * @param {Editor.Window} win
   */
  static removeWindow ( win ) {
    var idx = _windows.indexOf(win);
    if ( idx === -1 ) {
      Editor.warn( 'Can not find window ' + win.name );
      return;
    }
    _windows.splice(idx,1);

    win.dispose();
  }

  /**
   * Commit all opened window states
   * @method commitWindowStates
   * @static
   */
  static commitWindowStates () {
    for ( var i = 0; i < _windows.length; ++i ) {
      var editorWin = _windows[i];
      editorWin.commitWindowState();
    }
  }

  /**
   * Save current windows' states to profile `layout.windows.json` at `local`
   * @method saveWindowStates
   * @static
   */
  static saveWindowStates () {
    // do not save layout in test environment
    if ( Editor.runMode === 'test' )
      return;

    // we've quit the app, do not save layout after that.
    if ( !Editor.mainWindow )
      return;

    var profile = Editor.loadProfile( 'layout.windows', 'local' );
    profile.windows = {};
    for ( var i = 0; i < _windows.length; ++i ) {
      var editorWin = _windows[i];
      profile.windows[editorWin.name] = _windowLayouts[editorWin.name];
    }
    profile.save();
  }
} // end class EditorWindow

// ========================================
// properties
// ========================================

/**
 * If this is a main window
 * @property {Boolean} isMainWindow
 */
Object.defineProperty(EditorWindow.prototype, 'isMainWindow', {
  enumerable: true,
  get() {
    return Editor.mainWindow === this;
  }
});

  /**
   * If the window is focused
   * @property {Boolean} isFocused
   */
Object.defineProperty(EditorWindow.prototype, 'isFocused', {
  enumerable: true,
  get () {
    return this.nativeWin.isFocused();
  }
});

/**
 * If the window is minimized
 * @property {Boolean} isMinimized
 */
Object.defineProperty(EditorWindow.prototype, 'isMinimized', {
  enumerable: true,
  get () {
    return this.nativeWin.isMinimized();
  }
});

/**
 * If the window is loaded
 * @property {Boolean} isLoaded
 */
Object.defineProperty(EditorWindow.prototype, 'isLoaded', {
  enumerable: true,
  get () {
    return this._loaded;
  }
});

// ========================================
// Ipc
// ========================================

Ipc.on('editor:sendreq2page:reply', function (event, sessionId, args) {
  let win = BrowserWindow.fromWebContents( event.sender );
  let editorWin = Editor.Window.find(win);
  if ( !editorWin ) {
    Editor.warn('editor:sendreq2page:reply failed: Can not find the window.' );
    return;
  }

  editorWin._reply(args,sessionId);
});

Ipc.on('window:open', function ( name, url, options ) {
  let editorWin = new Editor.Window(name, options);
  editorWin.nativeWin.setMenuBarVisibility(false);
  editorWin.load(url, options.argv);
  editorWin.show();
});

Ipc.on('window:query-layout', function ( event, reply ) {
  let win = BrowserWindow.fromWebContents( event.sender );
  let editorWin = Editor.Window.find(win);
  if ( !editorWin ) {
    Editor.warn('Failed to query layout, can not find the window.');
    reply();
    return;
  }

  let layout = null;
  let needReset = false;

  let winInfo = _windowLayouts[editorWin.name];
  if ( winInfo && winInfo.layout ) {
    layout = winInfo.layout;
  }

  // if no layout found, and it is main window, reload layout
  if ( editorWin.isMainWindow && !layout ) {
    if ( Fs.existsSync(Editor._defaultLayout) ) {
      try {
        layout = JSON.parse(Fs.readFileSync(Editor._defaultLayout));
        needReset = true;
      } catch (err) {
        Editor.error( 'Failed to load default layout: %s', err.message );
        layout = null;
      }
    }
  }

  //
  reply(layout, needReset);
});

Ipc.on('window:save-layout', function ( event, layoutInfo ) {
  let win = BrowserWindow.fromWebContents( event.sender );
  let editorWin = Editor.Window.find(win);
  if ( !editorWin ) {
    Editor.warn('Failed to save layout, can not find the window.');
    return;
  }
  editorWin.commitWindowState(layoutInfo);

  // save windows layout
  EditorWindow.saveWindowStates();
});

Ipc.on('window:focus', function ( event ) {
  let win = BrowserWindow.fromWebContents( event.sender );
  let editorWin = Editor.Window.find(win);
  if ( !editorWin ) {
    Editor.warn('Failed to focus, can not find the window.');
    return;
  }

  if ( !editorWin.isFocused ) {
    editorWin.focus();
  }
});

Ipc.on('window:inspect-at', function ( event, x, y ) {
  let nativeWin = BrowserWindow.fromWebContents( event.sender );
  if ( !nativeWin ) {
    Editor.warn('Failed to inspect at %d, %d, can not find the window.', x, y );
    return;
  }

  nativeWin.inspectElement( x, y );
});

module.exports = EditorWindow;
