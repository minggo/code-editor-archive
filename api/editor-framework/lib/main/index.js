'use strict';

global.unused = () => {};

/**
 * Editor is a module contains app-wide core editor functionality. You can access properties or methods of Editor module anytime, anywhere in Fireball
 * @module Editor
 * @main
 */
global.Editor = {};

// require modules
const App = require('app');
const Chalk = require('chalk');
const Path = require('fire-path');
const Fs = require('fire-fs');
const _ = require('lodash');

// ---------------------------
// node setup
// ---------------------------

// this will prevent default atom-shell uncaughtException
process.removeAllListeners('uncaughtException');
process.on('uncaughtException', err => {
  if ( Editor && Editor.error ) {
    Editor.error(err.stack || err);
    return;
  }
  console.log( Chalk.red.inverse.bold('Uncaught Exception: ') + Chalk.red( err.stack || err ) );
});

// add builtin node_modules search path for core-level
require('module').globalPaths.push(Path.join(App.getAppPath(),'node_modules'));

// ---------------------------
// Init Editor.App
// ---------------------------

/**
 * The Editor.App is your app.js module. Read more details in
 * [Define your application](https://github.com/fireball-x/editor-framework/blob/master/docs/manual/define-your-app.md).
 * @property App
 * @type object
 */
Editor.App = {
  /**
   * The name of your app. It is defined in the `name` field in package.json
   * @property name
   * @type string
   */
  name: App.getName(),

  /**
   * your app version
   * @property version
   * @type string
   */
  version: App.getVersion(),

  /**
   * The current app.js running directory.
   * @property path
   * @type string
   */
  path: App.getAppPath(),

  /**
   * Your application's data path. Usually it is `~/.{your-app-name}`
   * @property home
   * @type string
   */
  home: Path.join(App.getPath('home'), '.' + App.getName()),

  /**
   * Extends Editor.App
   * @property extend
   * @type function
   */
  extend: function ( proto ) {
    _.assign( this, proto );
  },
};

// ---------------------------
// initialize minimal Editor
// ---------------------------

// load your-app-path/editor-framework/package.json
const _frameworkPath = Path.dirname(Path.dirname(__dirname));
const _frameworkPackageJson = JSON.parse(Fs.readFileSync(Path.join(_frameworkPath,'package.json')));

/**
 * versions of your app and submodules
 * @property versions
 * @type Object
 */
Editor.versions = {
  'editor-framework': _frameworkPackageJson.version,
  [Editor.App.name]: Editor.App.version,
};

/**
 * The editor framework module path. Usually it is `{your-app}/editor-framework/`
 * @property frameworkPath
 * @type string
 */
Editor.frameworkPath = _frameworkPath;

// make sure ~/.{app-name} exists
Fs.ensureDirSync(Editor.App.home);

// make sure ~/.{app-name}/local/ exists
Fs.ensureDirSync(Path.join(Editor.App.home, 'local'));

const EventEmitter = require('events');
Editor.events = new EventEmitter();

// ---------------------------
// initialize logs/
// ---------------------------

const Winston = require('winston');

// MacOSX: ~/Library/Logs/{app-name}
// Windows: %APPDATA%, some where like 'C:\Users\{your user name}\AppData\Local\...'

// get log path
let _logpath = '';
if ( process.platform === 'darwin' ) {
  _logpath = Path.join(App.getPath('home'), 'Library/Logs/' + Editor.App.name );
} else {
  _logpath = Path.join(App.getPath('appData'), Editor.App.name);
}

Fs.ensureDirSync(_logpath);

const _logfile = Path.join(_logpath, Editor.App.name + '.log');
const winstonLevels = {
  normal   : 0,
  success  : 1,
  failed   : 2,
  info     : 3,
  warn     : 4,
  error    : 5,
  fatal    : 6,
  uncaught : 7,
};
Winston.setLevels(winstonLevels);

const chalkPID = Chalk.bgBlue;
const chalkSuccess = Chalk.green;
const chalkWarn = Chalk.yellow;
const chalkError = Chalk.red;
const chalkInfo = Chalk.cyan;

const levelToFormat = {
  normal ( text ) {
    let pid = chalkPID(`[${process.pid}]`) + ' ';
    return pid + text;
  },

  success ( text ) {
    let pid = chalkPID(`[${process.pid}]`) + ' ';
    return pid + chalkSuccess(text);
  },

  failed ( text ) {
    let pid = chalkPID(`[${process.pid}]`) + ' ';
    return pid + chalkError(text);
  },

  info ( text ) {
    let pid = chalkPID(`[${process.pid}]`) + ' ';
    return pid + chalkInfo(text);
  },

  warn ( text ) {
    let pid = chalkPID(`[${process.pid}]`) + ' ';
    return pid + chalkWarn.inverse.bold('Warning:') + ' ' + chalkWarn(text);
  },

  error ( text ) {
    let pid = chalkPID(`[${process.pid}]`) + ' ';
    return pid + chalkError.inverse.bold('Error:') + ' ' + chalkError(text);
  },

  fatal ( text ) {
    let pid = chalkPID(`[${process.pid}]`) + ' ';
    return pid + chalkError.inverse.bold('Fatal Error:') + ' ' + chalkError(text);
  },

  uncaught ( text ) {
    let pid = chalkPID(`[${process.id}]`) + ' ';
    return pid + chalkError.inverse.bold('Uncaught Exception:') + ' ' + chalkError(text);
  },
};

// ---------------------------
// register App events
// ---------------------------

// DISABLE: http cache only happends afterwhile, not satisefy our demand (which need to happend immediately).
// App.commandLine.appendSwitch('disable-http-cache');
// App.commandLine.appendSwitch('disable-direct-write');

// DISABLE: we have main-window
// // quit when all windows are closed.
// App.on('window-all-closed', function( event ) {
//     App.quit();
// });

//
App.on('will-finish-launching', () => {
  if ( !Editor.isDev ) {
    let crashReporter = require('crash-reporter');
    crashReporter.start({
      productName: Editor.App.name,
      companyName: 'Firebox Technology',
      submitUrl: 'https://fireball-x.com/crash-report',
      autoSubmit: false,
    });
  }
});

//
App.on('gpu-process-crashed', () => {
  if ( Editor && Editor.sendToWindows ) {
    Editor.sendToWindows('console:error', 'GPU Process Crashed!');
  }
  Winston.uncaught('GPU Process Crashed!');
});

//
App.on('ready', () => {
  const Commander = require('commander');
  const Async = require('async');

  let runMode = 'normal';
  let actionPath = '';
  let actionOpts = {};

  // ---------------------------
  // initialize Commander
  // ---------------------------

  // NOTE: commander only get things done barely in core level,
  //       it doesn't touch the page level, so it should not put into App.on('ready')
  Commander
    .version(App.getVersion())
    // for debug
    .option('--dev', 'Run in development environment')
    .option('--dev-mode <mode>', 'Run in specific dev-mode')
    .option('--show-devtools', 'Open devtools automatically when main window loaded')
    .option('--debug <port>', 'Open in browser context debug mode', parseInt )
    .option('--debug-brk <port>', 'Open in browser context debug mode, and break at first.', parseInt)
    ;

    // for test
  Commander
    .command('test [path]')
    .description('Run tests')
    .option('--renderer', 'Run tests in renderer' )
    .option('--package', 'Run specific package tests')
    .option('--detail', 'Run test in debug mode (It will not quit the test, and open the devtools to help you debug it)' )
    .option('--reporter <name>', 'Mocha reporter, default is \'spec\'' )
    .action((path,opts) => {
      runMode = 'test';
      actionPath = path;
      actionOpts = opts;
    })
    ;

    // for build
  Commander
    .command('build [path]')
    .description('Build specific pacakge')
    .action((path,opts) => {
      runMode = 'build';
      actionPath = path;
      actionOpts = opts;
    })
    ;

  // init app's command
  if ( Editor.App.beforeInit ) {
    Editor.App.beforeInit(Commander);
  }

  // run commander
  Commander.parse(process.argv);

  // ---------------------------
  // initialize Editor
  // ---------------------------

  Winston.remove(Winston.transports.Console);

  if ( runMode !== 'test' ) {
    if ( Fs.existsSync(_logfile) ) {
      Fs.unlinkSync(_logfile);
    }

    Winston.add(Winston.transports.File, {
      level: 'normal',
      filename: _logfile,
      json: false,
    });

    console.log( Chalk.magenta('===== Initializing Editor =====') );
  }

  if ( runMode !== 'test' || actionOpts.detail ) {
    Winston.add( Winston.transports.Console, {
      level: 'normal',
      formatter: function (options) {
        let text = '';
        if ( options.message !== undefined ) {
          text += options.message;
        }
        if ( options.meta && Object.keys(options.meta).length ) {
          text += ' ' + JSON.stringify(options.meta);
        }

        // output log by different level
        let formatter = levelToFormat[options.level];
        if ( formatter ) {
          return formatter(text);
        }

        return text;
      }
    });
  }

  // apply arguments to Editor
  Editor.runMode = runMode;
  Editor.isDev = Commander.dev;
  Editor.devMode = Commander.devMode;
  Editor.showDevtools = Commander.showDevtools;
  Editor.debugPort = Commander.debug;

  //
  require('./editor-init');

  // ---------------------------
  // run editor
  // ---------------------------

  Editor.reset();

  // before run the app, we start load and watch all packages
  Async.series([
    // init app
    next => {
      // init user App
      if ( !Editor.App.init ) {
        Editor.error('Can not find function "init" in your App');
        App.terminate();
        return;
      }

      try {
        Editor.App.init(Commander, next);
      } catch ( err ) {
        Editor.error(err.stack || err);
        App.terminate();
        return;
      }
    },

    // run test ( and quit if that happen )
    next => {
      if ( runMode === 'normal' ) {
        next ();
        return;
      }

      if ( runMode === 'test' ) {
        // NOTE: DO NOT call next() when we decided to run test
        const Tester = require('../tester');
        Tester.run(actionPath,actionOpts);
      } else if ( runMode === 'build' ) {
        const Builder = require('../builder');
        Builder.run(actionPath,actionOpts);
      }
    },

    // load packages
    next => {
      Editor.log('Loading packages');
      Editor.loadAllPackages( next );
    },

    // watch packages
    next => {
      if ( Editor.isDev ) {
        Editor.log('Prepare for watching packages');
        Editor.watchPackages( next );
        return;
      }

      next();
    },

    // run app
    next => {
      Editor.success('Watch ready');

      // load windows layout after local profile registered
      Editor.Window.loadLayouts();

      // connect to console to sending ipc to it
      Editor.connectToConsole();

      // run user App
      if ( !Editor.App.run ) {
        Editor.error('Can not find function "run" in your App');
        App.terminate();
        return;
      }

      try {
        Editor.App.run();
        next();
      } catch ( err ) {
        Editor.error(err.stack || err);
        App.terminate();
        return;
      }
    },
  ], err => {
    if ( err ) {
      Editor.error(err.stack || err);
      App.terminate();
    }
  });
});
