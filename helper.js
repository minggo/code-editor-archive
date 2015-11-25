
langTools = ace.require('ace/ext/language_tools');
editor = ace.edit('editor');
fs = require('fs');
path = require('path');

var cocos2dContent = fs.readFileSync(path.join(__dirname, 'cocos2d-js-v3.8.js'), 'utf8');

exports.enalbeKeyWordCompleter = function() {
  for (var i in editor.completers) {
    var completer = editor.completers[i];
    if (completer === langTools.keyWordCompleter)
        return;
  }
  editor.completers.push(langTools.keyWordCompleter);
}

exports.disableKeyWordCompleter = function() {
   for (var i in editor.completers) {
    var completer = editor.completers[i];
    if (completer === langTools.keyWordCompleter) {
      editor.completers.splice(i, 1);
      break;
    }
   }
}

exports.getEditor = function() {
  return editor;
}

exports.getCocos2dContent = function() {
  return cocos2dContent;
}

// keep keyWordCompleter and add our own completer
exports.initCompleter = function() {
  editor.completers = [require('./grammer_completer.js'), langTools.keyWordCompleter];
}