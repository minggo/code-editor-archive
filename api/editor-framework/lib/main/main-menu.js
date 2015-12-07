'use strict';

const Ipc = require('ipc');
const BrowserWindow = require('browser-window');
const Menu = require('menu');
const Fs = require('fire-fs');

function _getDefaultMainMenu () {
  return [
    // Help
    {
      label: 'Help',
      id: 'help',
      submenu: [
      ]
    },

    // Fireball
    {
      label: 'Editor Framework',
      position: 'before=help',
      submenu: [
        {
          label: 'Hide',
          accelerator: 'CmdOrCtrl+H',
          selector: 'hide:'
        },
        {
          label: 'Hide Others',
          accelerator: 'CmdOrCtrl+Shift+H',
          selector: 'hideOtherApplications:'
        },
        {
          label: 'Show All',
          selector: 'unhideAllApplications:'
        },
        { type: 'separator' },
        {
          label: 'Quit',
          accelerator: 'CmdOrCtrl+Q',
          click: function () {
            Editor.mainWindow.close();
          }
        },
      ]
    },

    // Edit
    {
      label: 'Edit',
      submenu: [
        {
          label: 'Undo',
          accelerator: 'CmdOrCtrl+Z',
          selector: 'undo:'
        },
        {
          label: 'Redo',
          accelerator: 'Shift+CmdOrCtrl+Z',
          selector: 'redo:'
        },
        { type: 'separator' },
        {
          label: 'Cut',
          accelerator: 'CmdOrCtrl+X',
          selector: 'cut:'
        },
        {
          label: 'Copy',
          accelerator: 'CmdOrCtrl+C',
          selector: 'copy:'
        },
        {
          label: 'Paste',
          accelerator: 'CmdOrCtrl+V',
          selector: 'paste:'
        },
        {
          label: 'Select All',
          accelerator: 'CmdOrCtrl+A',
          selector: 'selectAll:'
        },
      ]
    },

    // Window
    {
      label: 'Window',
      id: 'window',
      submenu: Editor.isDarwin ?  [
        {
          label: 'Minimize',
          accelerator: 'CmdOrCtrl+M',
          selector: 'performMiniaturize:',
        },
        {
          label: 'Close',
          accelerator: 'CmdOrCtrl+W',
          selector: 'performClose:',
        },
        { type: 'separator' },
        {
          label: 'Bring All to Front',
          selector: 'arrangeInFront:'
        },
      ] : [
        {
          label: 'Close',
          accelerator: 'CmdOrCtrl+W',
          role: 'close',
        }
      ]
    },

    // Panel
    {
      label: 'Panel',
      id: 'panel',
      submenu: [
      ]
    },

    // Layout
    {
      label: 'Layout',
      id: 'layout',
      submenu: [
        {
          label: 'Debuggers',
          click () {
            let layoutInfo = JSON.parse(Fs.readFileSync(Editor.url('editor-framework://static/layout.json') ));
            Editor.sendToMainWindow( 'editor:reset-layout', layoutInfo);
          }
        },
        { type: 'separator' },
        {
          label: 'Empty',
          click () {
            Editor.sendToMainWindow( 'editor:reset-layout', null);
          }
        },
      ]
    },

    // Developer
    {
      label: 'Developer',
      id: 'developer',
      submenu: [
        {
          label: 'Command Palette',
          accelerator: 'CmdOrCtrl+:',
          click () {
            Editor.mainWindow.focus();
            Editor.sendToMainWindow('cmdp:show');
          }
        },
        { type: 'separator' },
        {
          label: 'Reload',
          accelerator: 'CmdOrCtrl+R',
          click () {
            // DISABLE: Editor.clearLog();
            BrowserWindow.getFocusedWindow().reload();
          }
        },
        {
          label: 'Reload Ignoring Cache',
          accelerator: 'CmdOrCtrl+Shift+R',
          click () {
            // DISABLE: Editor.clearLog();
            BrowserWindow.getFocusedWindow().reloadIgnoringCache();
          }
        },
        { type: 'separator' },
        {
          label: 'Inspect Element',
          accelerator: 'CmdOrCtrl+Shift+C',
          click () {
            let nativeWin = BrowserWindow.getFocusedWindow();
            let editorWin = Editor.Window.find(nativeWin);
            if ( editorWin ) {
              editorWin.sendToPage( 'window:inspect' );
            }
          }
        },
        {
          label: 'Developer Tools',
          accelerator: 'CmdOrCtrl+Alt+I',
          click () {
            let focusedWindow = BrowserWindow.getFocusedWindow();
            if ( focusedWindow ) {
              focusedWindow.openDevTools();
            }
          }
        },
        {
          label: 'Debug Core',
          type: 'checkbox',
          checked: false,
          click () {
            Editor.Debugger.toggle();
          }
        },
        { type: 'separator' },
        {
          label: 'Human Tests',
          submenu: [
            { type: 'separator' },
            {
              label: 'Throw an Uncaught Exception',
              click () {
                throw new Error('editor-framework Unknown Error');
              }
            },
            {
              label: 'send2panel \'foo:bar\' foobar.panel',
              click () {
                Editor.sendToPanel( 'foobar.panel', 'foo:bar' );
              }
            },
          ],
        },
        { type: 'separator' },
      ]
    },
  ];
}

Editor._defaultMainMenu = _getDefaultMainMenu;
let _mainMenu = new Editor.Menu( Editor._defaultMainMenu() );

/**
 * The main menu module for manipulating main menu items
 * @module Editor.MainMenu
 */
let MainMenu = {
  /**
   * Revert to default setup
   * @method _revert
   */
  _revert () {
    Editor._defaultMainMenu = _getDefaultMainMenu;
    MainMenu.reset();
  },

  /**
   * Apply main menu changes
   * @method apply
   */
  apply () {
    Menu.setApplicationMenu(_mainMenu.nativeMenu);
  },

  /**
   * Reset main menu to its default template
   * @method reset
   */
  reset () {
    _mainMenu.reset( Editor._defaultMainMenu() );
    MainMenu.apply();
  },

  /**
   * Build a template into menu item and add it to path
   * @method add
   * @param {string} path - A menu path
   * @param {object[]|object} template
   */
  add ( path, template ) {
    if ( _mainMenu.add( path, template ) ) {
      MainMenu.apply();
    }
  },

  /**
   * Remove menu item at path.
   * @method remove
   * @param {string} path - A menu path
   */
  remove ( path ) {
    if ( _mainMenu.remove( path ) ) {
      MainMenu.apply();
    }
  },

  /**
   * Set menu options at path.
   * @method set
   * @param {string} path - A menu path
   * @param {object} [options]
   * @param {NativeImage} [options.icon] - A [NativeImage](https://github.com/atom/electron/blob/master/docs/api/native-image.md)
   * @param {Boolean} [options.enabled]
   * @param {Boolean} [options.visible]
   * @param {Boolean} [options.checked] - NOTE: You must set your menu-item type to 'checkbox' to make it work
   */
  set ( path, options ) {
    if ( _mainMenu.set( path, options ) ) {
      MainMenu.apply();
    }
  },
};

// ipc
Ipc.on('main-menu:reset', () => {
  MainMenu.reset();
});

Ipc.on('main-menu:add', ( path, template ) => {
  MainMenu.add( path, template );
});

Ipc.on('main-menu:remove', ( path ) => {
  MainMenu.remove( path );
});

Ipc.on('main-menu:set', ( path, options ) => {
  MainMenu.set( path, options );
});

module.exports = MainMenu;
