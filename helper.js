
langTools = ace.require('ace/ext/language_tools');
editor = ace.edit('editor');

function disableCompleter(completer) {
  for (var i in editor.completers) {
    var value = editor.completers[i];
    if (value === completer) {
      editor.completers.splice(i, 1);
      return;
    }
   }
}

function enableCompleter(completer) {
  for (var i in editor.completers) {
    var value = editor.completers[i];
    if (value === completer)
        return;
  }
  editor.completers.push(completer); 
}

exports.enalbeKeyWordCompleter = function() {
  enableCompleter(langTools.keyWordCompleter);
}

exports.disableKeyWordCompleter = function() {
   disableCompleter(langTools.keyWordCompleter);
}

exports.disableSnippetCompleter = function() {
  disableCompleter(langTools.snippetCompleter);
}

exports.enableSnippetCompleter = function() {
  enableCompleter(langTools.sinppetCompleter);
}

// enable keyWordCompleter and snippetCompleter
exports.enableSystemCompleters = function() {
  enableCompleter(langTools.keyWordCompleter);
  enableCompleter(langTools.snippetCompleter);
}

// enable keyWordCompleter and sinppetCompleter
exports.disableSystemCompleters = function() {
  disableCompleter(langTools.keyWordCompleter);
  disableCompleter(langTools.snippetCompleter);
}

exports.getEditor = function() {
  return editor;
}

// only keep keyWordCompleter, sinppetCompleter and our own completer
exports.initCompleter = function() {
  editor.completers = [require('./grammer_completer.js'), langTools.keyWordCompleter, langTools.snippetCompleter];
}