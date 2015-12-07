'use strict';

const BrowserWindow = require('browser-window');
const Ipc = require('ipc');
const Menu = require('menu');
const MenuItem = require('menu-item');
const Path = require('fire-path');
const _ = require('lodash');

/**
 * @module Editor
 */

function _expandMenuTemplate ( tmpl, index ) {
  //
  let itemTmpl = tmpl[index];
  if ( !itemTmpl.path ) {
    return;
  }

  //
  let pathNames = itemTmpl.path.split('/');
  if ( pathNames.length === 1 ) {
    tmpl[index].label = pathNames[0];
    return false;
  }

  //
  let submenu = tmpl;
  let parentTmpl = null;
  let curPath = '';
  let removeOriginal = false;

  for ( let i = 0; i < pathNames.length-1; i++ ) {
    let isLastOne = i === pathNames.length-2;
    let name = pathNames[i];

    curPath = Path.posix.join( curPath, name );

    // find menu item
    parentTmpl = null;
    let idx = _.findIndex(submenu, item => {
      return item.label === name;
    });
    if ( idx !== -1 ) {
      parentTmpl = submenu[idx];
    }

    // create menu template if not found
    if (!parentTmpl) {
      parentTmpl = {
        label: name,
        type: 'submenu',
        submenu: [],
      };

      // if this is first path, we just replace the old template
      if ( i === 0 ) {
        submenu[index] = parentTmpl;
      } else {
        submenu.push(parentTmpl);
      }
    } else {
      if ( i === 0 ) {
        removeOriginal = true;
      }
    }

    if ( !parentTmpl.submenu || parentTmpl.type !== 'submenu' ) {
      Editor.warn( `Can not add menu in ${itemTmpl.path}, the ${curPath} already used` );
      return;
    }

    if ( isLastOne ) {
      break;
    }

    submenu = parentTmpl.submenu;
  }

  //
  itemTmpl.label = pathNames[pathNames.length-1];
  parentTmpl.submenu.push(itemTmpl);

  return removeOriginal;
}

function _getMenuItem ( nativeMenu, path, createIfNotExists ) {
  let nextMenu = nativeMenu;
  if ( typeof createIfNotExists !== 'boolean' ) {
    createIfNotExists = false;
  }

  let pathNames = path.split('/');
  let curPath = '';

  for (let i = 0; i < pathNames.length; i++) {
    let isLastOne = i === pathNames.length - 1;
    let name = pathNames[i];
    let menuItem = null;

    curPath = Path.posix.join( curPath, name );

    // find menu item
    let index = _.findIndex( nextMenu.items, item => {
      return item.label === name;
    });
    if ( index !== -1 ) {
      menuItem = nextMenu.items[index];
    }

    //
    if (menuItem) {
      if (isLastOne) {
        return menuItem;
      }

      if ( !menuItem.submenu || menuItem.type !== 'submenu' ) {
        Editor.warn( `Can not add menu in ${path}, the ${curPath} already used` );
        return null;
      }

      nextMenu = menuItem.submenu;
      continue;
    }

    //
    if ( createIfNotExists ) {
      menuItem = new MenuItem({
        label: name,
        id: name.toLowerCase(),
        submenu: new Menu(),
        type: 'submenu',
      });

      // if this is the first one
      if ( i === 0 ) {
        // HACK: we assume last menuItem always be 'Help'
        let pos = Math.max( nextMenu.items.length-1, 0 );
        nextMenu.insert(pos,menuItem);
      } else {
        nextMenu.append(menuItem);
      }

      if ( isLastOne ) {
        return menuItem;
      }

      nextMenu = menuItem.submenu;
      continue;
    }

    //
    return null;
  }

  return null;
}

function _cloneMenuItemLevel1 ( menuItem ) {
  let options = _.pick(menuItem, [
    'click',
    'selector',
    'type',
    'label',
    'sublabel',
    'accelerator',
    'icon',
    'enabled',
    'visible',
    'checked',
    // 'submenu', // NOTE: never clone submenu, other wise we can't change item inside it
    'id',
    'position',
  ]);

  if ( options.type === 'submenu' ) {
    options.submenu = new Menu();
  }

  return new MenuItem(options);
}

function _cloneMenuExcept ( newMenu, nativeMenu, exceptPath, curPath ) {
  let found = false;

  for ( let i = 0; i < nativeMenu.items.length; ++i ) {
    let menuItem = nativeMenu.items[i];
    let path = Path.posix.join( curPath, menuItem.label );

    if ( !Path.contains( path, exceptPath ) ) {
      newMenu.append(menuItem);
      continue;
    }

    if ( path === exceptPath ) {
      found = true;
      continue;
    }

    let newMenuItem = _cloneMenuItemLevel1(menuItem);
    if ( newMenuItem.type !== 'submenu' ) {
      newMenu.append(newMenuItem);
      continue;
    }

    let result = _cloneMenuExcept(
      newMenuItem.submenu,
      menuItem.submenu,
      exceptPath,
      path
    );

    if ( result ) {
      found = true;
    }

    if ( newMenuItem.submenu.items.length > 0 ) {
      newMenu.append(newMenuItem);
    }
  }

  return found;
}

function _convert ( submenuTmpl, index, webContents ) {
  let template = submenuTmpl[index];
  let itemName = template.path || template.label;

  // parse message
  if ( template.message ) {
    // make sure message and click not used together
    if ( template.click ) {
      Editor.error(
        `Skip 'click' in menu item '${itemName}', already have 'message'`
      );
    }

    // make sure message and command not used together
    if ( template.command ) {
      Editor.error(
        `Skip 'command' in menu item '${itemName}', already have 'message'`
      );
    }

    let args = [template.message];

    // parse params
    if ( template.params ) {
      if ( !Array.isArray(template.params) ) {
        Editor.error('message parameters must be an array');
        return;
      }
      args = args.concat(template.params);
    }

    // parse panel
    if ( template.panel ) {
      args.unshift(template.panel);
    }

    // parse click
    // NOTE: response in next tick to prevent ipc blocking issue caused by atom-shell's menu.
    if ( template.panel ) {
      template.click = () => {
        setImmediate(() => {
          Editor.sendToPanel.apply(Editor, args);
        });
      };
    } else if ( webContents ) {
      template.click = () => {
        setImmediate(() => {
          webContents.send.apply(webContents,args);
        });
      };
    } else {
      template.click = () => {
        setImmediate(() => {
          Editor.sendToCore.apply(Editor, args);
        });
      };
    }

  }
  // parse command
  else if ( template.command ) {
    // make sure command and click not used together
    if ( template.click ) {
      Editor.error(
        `Skip 'click' in menu item '${itemName}', already have 'command'`
      );
    }

    // get global function
    let fn = _.get(global, template.command, null);

    if ( fn && typeof fn === 'function' ) {
      let args = [];

      if (template.params) {
        if ( !Array.isArray(template.params) ) {
          Editor.error('message parameters must be an array');
          return;
        }
        args = args.concat(template.params);
      }

      template.click = () => {
        fn.apply(Editor, args);
      };
    }
  }
  // parse submenu
  else if ( template.submenu ) {
    EditorMenu.convert(template.submenu, webContents);
  }

  let removeOriginal = false;

  // check label
  if ( template.path ) {
    // make sure path and label not used together
    if ( template.label ) {
      Editor.warn(`Skip label '${template.label}' in menu item '${template.path}'`);
    }

    removeOriginal = _expandMenuTemplate( submenuTmpl, index );
  } else {
    if ( template.label === undefined && template.type !== 'separator' ) {
      Editor.warn('Missing label for menu item');
    }
  }

  return removeOriginal;
}

/**
 * @class Menu
 * @constructor
 * @param {object[]|object} template - Menu template for initialize. The template take the options of
 * Electron's [Menu Item](https://github.com/atom/electron/blob/master/docs/api/menu-item.md)
 * plus the following properties.
 * @param {string} template.path - add a menu item by path.
 * @param {string} template.message - Ipc message name.
 * @param {string} template.command - A global function in core level (e.g. Editor.foo.bar ).
 * @param {array} template.params - The parameters passed through ipc.
 * @param {string} template.panel - The panelID, if specified, the message will send to panel.
 * @param {object} [webContents] - A [WebContents](https://github.com/atom/electron/blob/master/docs/api/browser-window.md#class-webcontents) object.
 */
class EditorMenu {
  constructor ( template, webContents ) {
    if ( !template ) {
      this.nativeMenu = new Menu();
      return;
    }

    EditorMenu.convert(template, webContents);
    this.nativeMenu = Menu.buildFromTemplate(template);
  }

  /**
   * De-reference the native menu.
   * @method dispose
   */
  dispose () {
    this.nativeMenu = null;
  }

  /**
   * Reset the menu from the template.
   * @method reset
   * @param {object[]|object} template
   */
  reset (template) {
    this.nativeMenu = Menu.buildFromTemplate(template);
  }

  /**
   * Clear all menu item in it.
   * @method clear
   */
  clear () {
    this.nativeMenu = new Menu();
  }

  /**
   * Build a template into menu item and add it to path
   * @method add
   * @param {string} path - A menu path
   * @param {object[]|object} template
   * @example
   * ```js
   * let editorMenu = new Editor.Menu();
   * editorMenu.add( 'foo/bar', {
   *   label: foobar,
   *   message: 'foobar:say',
   *   params: ['foobar: hello!']
   * });
   *
   * // you can also create menu without label
   * // it will add menu to foo/bar where bar is the menu-item
   * let editorMenu = new Editor.Menu();
   * editorMenu.add( 'foo/bar/foobar', {
   *   message: 'foobar:say',
   *   params: ['foobar: hello!']
   * });
   * ```
   */
  add ( path, template ) {
    // in object mode, we should set label from path if not exists
    if ( !Array.isArray(template) ) {
      if ( !template.label && template.type !== 'separator' ) {
        let start = path.lastIndexOf( '/' );
        if ( start !== -1 ) {
          template.label = path.slice( start + 1 );
          path = path.slice( 0, start );
        }
      }
    }

    let menuItem = _getMenuItem( this.nativeMenu, path, true );

    if ( !menuItem ) {
      Editor.error(`Failed to find menu in path: ${path}` );
      return false;
    }

    if ( menuItem.type !== 'submenu' || !menuItem.submenu) {
      Editor.error(`Failed to add menu at ${path}, it is not a submenu`);
      return false;
    }

    if ( !Array.isArray(template) ) {
      template = [template];
    }
    EditorMenu.convert(template);

    let newSubMenu = Menu.buildFromTemplate(template);
    for ( let i = 0; i < newSubMenu.items.length; ++i ) {
      let newSubMenuItem = newSubMenu.items[i];

      let exists = menuItem.submenu.items.some(item => {
        return item.label === newSubMenuItem.label;
      });

      if ( exists ) {
        Editor.error(
          `Failed to add menu to ${path},
          a menu item ${Path.posix.join( path, newSubMenuItem.label )} you try to add already exists`
        );
        return false;
      }
    }

    for ( let i = 0; i < newSubMenu.items.length; ++i ) {
      let newSubMenuItem = newSubMenu.items[i];
      menuItem.submenu.append(newSubMenuItem);
    }

    return true;
  }

  /**
   * Remove menu item at path.
   * @method remove
   * @param {string} path - A menu path
   */
  // base on electron#527 said, there is no simple way to remove menu item
  // https://github.com/atom/electron/issues/527
  remove ( path ) {
    let newMenu = new Menu();
    let removed = _cloneMenuExcept( newMenu, this.nativeMenu, path, '' );

    if ( !removed ) {
      Editor.error(`Failed to remove menu in path: ${path}, can not find it` );
      return false;
    }

    this.nativeMenu = newMenu;
    return true;
  }

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
    let menuItem = _getMenuItem( this.nativeMenu, path, false );

    if ( !menuItem ) {
      Editor.error('Failed to find menu in path: %s', path );
      return false;
    }

    if ( menuItem.type === 'separator' ) {
      Editor.error('Menu item %s is a separator', path );
      return false;
    }

    if ( options.icon !== undefined ) {
      menuItem.icon = options.icon;
    }

    if ( options.enabled !== undefined ) {
      menuItem.enabled = options.enabled;
    }

    if ( options.visible !== undefined ) {
      menuItem.visible = options.visible;
    }

    if ( options.checked !== undefined ) {
      menuItem.checked = options.checked;
    }

    return true;
  }

  /**
   * Convert the menu template to process additional keyword we added for Electron.
   * If webContents provided, the `template.message` will send to the target webContents.
   * @method convert
   * @param {object[]|object} template
   * @param {object} [webContents] - A [WebContents](https://github.com/atom/electron/blob/master/docs/api/browser-window.md#class-webcontents) object.
   */
  static convert ( template, webContents ) {
    if ( !Array.isArray(template) ) {
      Editor.error( 'template must be an array' );
      return;
    }

    for ( let i = 0; i < template.length; ++i ) {
      let remove = _convert(template, i, webContents);
      if ( remove ) {
        template.splice( i, 1 );
        --i;
      }
    }
  }
}

// ========================================
// Ipc
// ========================================

Ipc.on('menu:popup', ( event, x, y, template ) => {
  if ( x ) {
    x = Math.floor(x);
  }

  if ( y ) {
    y = Math.floor(y);
  }

  let editorMenu = new Editor.Menu(template,event.sender);
  editorMenu.nativeMenu.popup(BrowserWindow.fromWebContents(event.sender), x, y);
  editorMenu.dispose();
});

module.exports = EditorMenu;
