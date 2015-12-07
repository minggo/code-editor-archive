var BrowserWindow = require('browser-window');
var Spawn = require('child_process').spawn;

/**
 * The `core-level` debugger utils, when you turn on the debugger,
 * it actually run a [node-inspector](https://github.com/node-inspector/node-inspector)
 * process in the low-level, and you can use your chrome browser debug the core module.
 * @module Editor.Debugger
 */
var Debugger = {};

var dbgProcess;

/**
 * Toggle on or off the `core-level` debugger
 * @method toggle
 */
Debugger.toggle = function () {
    if ( dbgProcess ) {
        Debugger.close();
    }
    else {
        Debugger.open();
    }
};

/**
 * Turn on the `core-level` debugger
 * @method open
 */
Debugger.open = function () {
    try {
        dbgProcess = Spawn('node-inspector', ['--debug-port=' + Editor.debugPort], {stdio: 'inherit'});
    } catch ( err ) {
        Editor.failed ( 'Failed to start Core Debugger: %s', err.message );
        return;
    }

    Editor.MainMenu.set( 'Developer/Debug Core', {
        checked: true
    });
    Editor.info('Visit http://127.0.0.1:8080/debug?ws=127.0.0.1:8080&port=%s to start debugging', Editor.debugPort);

    // DISABLE FIXME: not work in this way
    // var debuggerWin = new BrowserWindow({
    //     'web-preferences': {
    //         'experimental-features': true,
    //         'experimental-canvas-features': true,
    //     }
    // });
    // var url = 'http://127.0.0.1:8080/debug?ws=127.0.0.1:8080&port=4040';
    // debuggerWin.loadUrl(url);
    // debuggerWin.on ( 'closed', function () {
    //     dbgProcess.kill();
    //     Editor.info('debugger process closed');
    // });
};

/**
 * Turn off the `core-level` debugger
 * @method close
 */
Debugger.close = function () {
    if ( dbgProcess ) {
        dbgProcess.kill();
        dbgProcess = null;

        Editor.MainMenu.set( 'Developer/Debug Core', {
            checked: false
        });
        Editor.info('Core Debugger closed');
    }
};

module.exports = Debugger;
