'use strict';

const Mousetrap = require('mousetrap');

let _idToPagePanelInfo = {};
// let _url2link = {};
let _outOfDatePanels = [];

function _getPanels ( panelEL ) {
  var panels = [];

  var panelDOM = Polymer.dom(panelEL);
  for ( var i = 0; i < panelDOM.children.length; ++i ) {
    var childEL = panelDOM.children[i];
    var id = childEL.getAttribute('id');
    panels.push(id);
  }

  return panels;
}

function _getDocks ( dockEL ) {
  var docks = [];

  var dockDOM = Polymer.dom(dockEL);
  for ( var i = 0; i < dockDOM.children.length; ++i ) {
    var childEL = dockDOM.children[i];

    if ( !childEL['ui-dockable'] ) {
      continue;
    }

    var rect = childEL.getBoundingClientRect();
    var info = {
      'row': childEL.row,
      'width': rect.width,
      'height': rect.height,
    };

    if ( childEL instanceof EditorUI.Panel ) {
      info.type = 'panel';
      info.active = childEL.activeIndex;
      info.panels = _getPanels(childEL);
    } else {
      info.type = 'dock';
      info.docks = _getDocks(childEL);
    }

    docks.push(info);
  }

  return docks;
}

function _registerIpc ( panelID, frameEL, ipcListener, ipcName ) {
  var fn = frameEL[ipcName];
  if ( !fn || typeof fn !== 'function' ) {
    if ( ipcName !== 'panel:run') {
      Editor.warn('Failed to register ipc message %s in panel %s, Can not find implementation', ipcName, panelID );
    }
    return;
  }

  ipcListener.on(ipcName, function () {
    var fn = frameEL[ipcName];
    if ( !fn || typeof fn !== 'function' ) {
      Editor.warn('Failed to respond ipc message %s in panel %s, Can not find implementation', ipcName, panelID );
      return;
    }
    fn.apply( frameEL, arguments );
  });
}

function _registerProfile ( panelID, type, profile ) {
  profile.save = function () {
    Editor.sendToCore('panel:save-profile', panelID, type, profile);
  };
}

function _registerShortcut ( panelID, mousetrap, frameEL, shortcut, methodName ) {
  var fn = frameEL[methodName];
  if ( typeof fn === 'function' ) {
    mousetrap.bind(shortcut, fn.bind(frameEL) );
  } else {
    Editor.warn('Failed to register shortcut, can not find method %s in panel %s.', methodName, panelID );
  }
}

var Panel = {};
Panel.load = function ( panelID, cb ) {
  Editor.sendRequestToCore('panel:query-info', panelID, function ( panelInfo ) {
    if ( !panelInfo ) {
      Editor.error('Panel %s import faield. panelInfo not found', panelID );
      cb ( new Error('Panel info not found') );
      return;
    }

    var Path = require('fire-path');
    var framePath = Path.join( panelInfo.path, panelInfo.frame );

    EditorUI.import( framePath, function ( err ) {
      if ( err ) {
        Editor.error( 'Failed to import %s. message: %s', framePath, err.message );
        cb ( new Error('Panel import failed.') );
        return;
      }

      var frameCtor = Editor.panels[panelID];
      if ( !frameCtor ) {
        Editor.error('Can not find constructor for panelID %s', panelID );
        cb ( new Error( panelID + '\'s constructor not found' ) );
        return;
      }

      Editor.sendToCore('panel:dock', panelID, Editor.requireIpcEvent);

      var frameEL = new frameCtor();
      if ( panelInfo.icon ) {
        frameEL.icon = new Image();
        frameEL.icon.src = Path.join( panelInfo.path, panelInfo.icon );
      }
      frameEL.setAttribute('id', panelID);
      frameEL.setAttribute('name', panelInfo.title);
      frameEL.classList.add('fit');
      frameEL.tabIndex = 1;

      // set size attribute
      if ( panelInfo.width ) {
        frameEL.setAttribute( 'width', panelInfo.width );
      }

      if ( panelInfo.height ) {
        frameEL.setAttribute( 'height', panelInfo.height );
      }

      if ( panelInfo['min-width'] ) {
        frameEL.setAttribute( 'min-width', panelInfo['min-width'] );
      }

      if ( panelInfo['min-height'] ) {
        frameEL.setAttribute( 'min-height', panelInfo['min-height'] );
      }

      if ( panelInfo['max-width'] ) {
        frameEL.setAttribute( 'max-width', panelInfo['max-width'] );
      }

      if ( panelInfo['max-height'] ) {
        frameEL.setAttribute( 'max-height', panelInfo['max-height'] );
      }

      // register ipc events
      var ipcListener = new Editor.IpcListener();

      // always have panel:run message
      if ( panelInfo.messages.indexOf('panel:run') === -1 ) {
        panelInfo.messages.push('panel:run');
      }

      for ( var i = 0; i < panelInfo.messages.length; ++i ) {
        _registerIpc( panelID, frameEL, ipcListener, panelInfo.messages[i] );
      }

      // register profiles
      frameEL.profiles = panelInfo.profiles;
      for ( var type in panelInfo.profiles ) {
        _registerProfile ( panelID, type, panelInfo.profiles[type] );
      }

      // register shortcuts
      // TODO: load overwrited shortcuts from profile?
      var mousetrapList = [];
      if ( panelInfo.shortcuts ) {
        var mousetrap = new Mousetrap(frameEL);
        mousetrapList.push(mousetrap);

        for ( var shortcut in panelInfo.shortcuts ) {
          if ( shortcut.length > 1 && shortcut[0] === '#' ) {
            var elementID = shortcut.substring(1);
            var subElement = frameEL.$[elementID];
            if ( !subElement ) {
              Editor.warn('Failed to register shortcut for element #%s, can not find it.', elementID );
              continue;
            }

            var subShortcuts = panelInfo.shortcuts[shortcut];
            var subMousetrap = new Mousetrap(subElement);
            mousetrapList.push(subMousetrap);
            for ( var subShortcut in subShortcuts ) {
              _registerShortcut(
                panelID,
                subMousetrap,
                frameEL, // NOTE: here must be frameEL
                subShortcut,
                subShortcuts[subShortcut]
              );
            }
          } else {
            _registerShortcut(
              panelID,
              mousetrap,
              frameEL,
              shortcut,
              panelInfo.shortcuts[shortcut]
            );
          }
        }
      }

      //
      _idToPagePanelInfo[panelID] = {
        frameEL: frameEL,
        messages: panelInfo.messages,
        popable: panelInfo.popable,
        ipcListener: ipcListener,
        mousetrapList: mousetrapList,
      };

      // run panel-ready if exists
      let panelReady = frameEL['panel-ready'];
      if ( panelReady && typeof panelReady === 'function' ) {
        panelReady.apply(frameEL);
      }

      // done
      cb ( null, frameEL, panelInfo );
    });
  });
};

Panel.unload = function ( panelID ) {
  // remove pagePanelInfo
  var pagePanelInfo = _idToPagePanelInfo[panelID];
  if ( pagePanelInfo) {
    pagePanelInfo.ipcListener.clear();
    for ( var i = 0; i < pagePanelInfo.mousetrapList.length; ++i ) {
      pagePanelInfo.mousetrapList[i].reset();
    }
    delete _idToPagePanelInfo[panelID];
  }
};

Panel.open = function ( panelID, argv ) {
  Editor.sendToCore('panel:open', panelID, argv);
};

Panel.popup = function ( panelID ) {
  let panelCounts = Object.keys(_idToPagePanelInfo).length;

  if ( panelCounts > 1 ) {
    Panel.close(panelID);
    Editor.sendToCore('panel:open', panelID);
  }
};

Panel.close = function ( panelID ) {
  Panel.undock(panelID);
  Editor.sendToCore('panel:close', panelID);
};

Panel.closeAll = function ( cb ) {
  // if we have root, clear all children in it
  var rootEL = EditorUI.DockUtils.root;
  if ( rootEL ) {
    rootEL.remove();
    EditorUI.DockUtils.root = null;
  }

  var panelIDs = [];
  for ( var id in _idToPagePanelInfo ) {
    // unload pagePanelInfo
    Editor.Panel.unload(id);
    panelIDs.push(id);
  }

  var finishCount = panelIDs.length;
  if ( panelIDs.length === 0 ) {
    if ( cb ) cb();
  } else {
    var checkIfDone = function () {
      --finishCount;
      if ( finishCount === 0 && cb ) {
        cb();
      }
    };

    for ( var i = 0; i < panelIDs.length; ++i ) {
      Editor.sendRequestToCore('panel:wait-for-close', panelIDs[i], checkIfDone );
    }
  }
};

Panel.undock = function ( panelID ) {
  // remove panel element from tab
  var frameEL = Editor.Panel.find(panelID);
  if ( frameEL ) {
    var parentEL = Polymer.dom(frameEL).parentNode;
    if ( parentEL instanceof EditorUI.Panel ) {
      var currentTabEL = parentEL.$.tabs.findTab(frameEL);
      parentEL.close(currentTabEL);
    } else {
      Polymer.dom(parentEL).removeChild(frameEL);
    }

    EditorUI.DockUtils.flush();
    Editor.saveLayout();
  }

  // unload pagePanelInfo
  Editor.Panel.unload(panelID);
};

Panel.dispatch = function ( panelID, ipcName ) {
  var pagePanelInfo = _idToPagePanelInfo[panelID];
  if ( !pagePanelInfo ) {
    Editor.warn( 'Failed to receive ipc %s, can not find panel %s', ipcName, panelID);
    return;
  }

  // messages
  var idx = pagePanelInfo.messages.indexOf(ipcName);
  if ( idx === -1 ) {
    Editor.warn('Can not find ipc message %s register in panel %s', ipcName, panelID );
    return;
  }

  if ( ipcName === 'panel:run' ) {
    Panel.focus(panelID);
  }

  var fn = pagePanelInfo.frameEL[ipcName];
  if ( !fn || typeof fn !== 'function' ) {
    if ( ipcName !== 'panel:run') {
      Editor.warn('Failed to respond ipc message %s in panel %s, Can not find implementation', ipcName, panelID );
    }
    return;
  }
  var args = [].slice.call( arguments, 2 );
  fn.apply( pagePanelInfo.frameEL, args );
};

Panel.dumpLayout = function () {
  var root = EditorUI.DockUtils.root;
  if ( !root ) {
    return null;
  }

  if ( root['ui-dockable'] ) {
    return {
      'type': 'dock',
      'row': root.row,
      'no-collapse': true,
      'docks': _getDocks(root),
    };
  } else {
    var id = root.getAttribute('id');
    var rect = root.getBoundingClientRect();

    return {
      'type': 'standalone',
      'panel': id,
      'width': rect.width,
      'height': rect.height,
    };
  }
};

Panel.find = function ( panelID ) {
  var pagePanelInfo = _idToPagePanelInfo[panelID];
  if ( !pagePanelInfo ) {
    return null;
  }
  return pagePanelInfo.frameEL;
};

Panel.focus = function ( panelID ) {
  var frameEL = Panel.find(panelID);
  var parentEL = Polymer.dom(frameEL).parentNode;
  if ( parentEL instanceof EditorUI.Panel ) {
    parentEL.select(frameEL);
    parentEL.setFocus();
  }
};

Panel.getPanelInfo = function ( panelID ) {
  return _idToPagePanelInfo[panelID];
};

// TODO
// position: top, bottom, left, right, top-left, top-right, bottom-left, bottom-right
// Panel.dockAt = function ( position, panelEL ) {
//     var root = EditorUI.DockUtils.root;
//     if ( !root ) {
//         return null;
//     }
//     if ( !root['ui-dockable'] ) {
//         return null;
//     }
// };

Panel.isDirty = function ( panelID ) {
  return _outOfDatePanels.indexOf(panelID) !== -1;
};

// ==========================
// Ipc events
// ==========================

var Ipc = require('ipc');

Ipc.on('panel:close', function ( panelID ) {
  // NOTE: if we don't do this in requestAnimationFrame,
  // the tab will remain, something wrong for Polymer.dom
  // operation when they are in ipc callback.
  window.requestAnimationFrame( function () {
    Editor.Panel.close(panelID);
  });
});

Ipc.on('panel:popup', function ( panelID ) {
  window.requestAnimationFrame( function () {
    Editor.Panel.close(panelID);
    Editor.sendToCore('panel:open', panelID);
  });
});

Ipc.on('panel:undock', function ( panelID ) {
  window.requestAnimationFrame( function () {
    Editor.Panel.undock(panelID);
  });
});

Ipc.on('panel:out-of-date', function ( panelID ) {
  var frameEL = Editor.Panel.find(panelID);
  if ( frameEL ) {
    var parentEL = Polymer.dom(frameEL).parentNode;
    if ( parentEL instanceof EditorUI.Panel ) {
      parentEL.outOfDate(frameEL);
    }
  }

  if ( _outOfDatePanels.indexOf(panelID) === -1 ) {
    _outOfDatePanels.push(panelID);
  }
});

module.exports = Panel;
