'use strict';

const Ipc = require('ipc');

let _inspecting = false;
let _maskEL;

function _webviewEL ( el ) {
  if ( !el ) {
    return null;
  }

  if ( el.tagName === 'WEBVIEW' ) {
    return el;
  }

  if ( el.parentNode.host && el.parentNode.host.tagName === 'WEBVIEW' ) {
    return el.parentNode.host;
  }

  return null;
}

function _mousemove ( event ) {
  event.preventDefault();
  event.stopPropagation();

  _maskEL.remove();

  let el = document.elementFromPoint( event.clientX, event.clientY );
  let rect = el.getBoundingClientRect();

  // if we are in web-view, show red color
  if ( _webviewEL(el) ) {
    _maskEL.style.backgroundColor = 'rgba( 128, 0, 0, 0.4)';
    _maskEL.style.outline = '1px solid #f00';
  } else {
    _maskEL.style.backgroundColor = 'rgba( 0, 128, 255, 0.5)';
    _maskEL.style.outline = '1px solid #09f';
  }

  //
  document.body.appendChild(_maskEL);
  _maskEL.style.top = (rect.top+1) + 'px';
  _maskEL.style.left = (rect.left+1) + 'px';
  _maskEL.style.width = (rect.width-2) + 'px';
  _maskEL.style.height = (rect.height-2) + 'px';
}

function _mousedown ( event ) {
  event.preventDefault();
  event.stopPropagation();

  _inspectOFF ();

  let el = document.elementFromPoint( event.clientX, event.clientY );
  let webviewEL = _webviewEL(el);
  if ( webviewEL ) {
    webviewEL.openDevTools();
    return;
  }

  // NOTE: we use Ipc here directly so that Test Runner will not block the ipc message
  Ipc.send( 'window:inspect-at', event.clientX, event.clientY );
}

function _keydown ( event ) {
  event.preventDefault();
  event.stopPropagation();

  if ( event.which === 27 ) {
    _inspectOFF ();
  }
}

function _inspectOFF () {
  _inspecting = false;
  _maskEL.remove();
  _maskEL = null;

  window.removeEventListener('mousemove', _mousemove, true);
  window.removeEventListener('mousedown', _mousedown, true);
  window.removeEventListener('keydown', _keydown, true);
}

function _inspectON () {
  if ( _inspecting ) {
    return;
  }

  _inspecting = true;
  if ( !_maskEL ) {
    _maskEL = document.createElement('div');
    _maskEL.style.position = 'absolute';
    _maskEL.style.zIndex = '999';
    _maskEL.style.top = '0';
    _maskEL.style.right = '0';
    _maskEL.style.bottom = '0';
    _maskEL.style.left = '0';
    _maskEL.style.backgroundColor = 'rgba( 0, 128, 255, 0.5)';
    _maskEL.style.outline = '1px solid #09f';
    _maskEL.style.cursor = 'default';
    document.body.appendChild(_maskEL);
  }

  window.addEventListener('mousemove', _mousemove, true);
  window.addEventListener('mousedown', _mousedown, true);
  window.addEventListener('keydown', _keydown, true);
}

// ==========================
// Methods
// ==========================

let EditorWindow = {
  focus () {
    Editor.sendToCore( 'window:focus', Editor.requireIpcEvent );
  },
};

// ==========================
// Ipc events
// ==========================

Ipc.on('window:inspect', function () {
  _inspectON ();
});

module.exports = EditorWindow;
