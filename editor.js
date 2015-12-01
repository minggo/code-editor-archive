path = require('path');
fs = require('fs');

var langTools = ace.require('ace/ext/language_tools');
var editor = ace.edit('editor');
var UNKNOWN_FILE_NAME = path.join(__dirname, 'unknown.js');
var currentEdittingFile = UNKNOWN_FILE_NAME;
// whether current editting file content is changed
// true: when the file content is changed without saving
// false: when it is saved and there is not change after saving
var currentFileIsChanged = false;

// use esprima to parse the file and return completions
function computeCompletions(editor, session, pos, prefix) {
  var offset = session.getDocument().positionToIndex(pos);
  var EsprimaHelper = require('./esprima-helper.js');
  var esprimaHelper = new EsprimaHelper(currentEdittingFile);
  var proposals = esprimaHelper.computeCompletions(session.getValue(), offset, prefix);
  return proposals;
}

var myCompleter = {
  getCompletions: function(editor, session, pos, prefix, callback) {

    // if the pop up window is triggered by `.`, such as foo., then should disable other keyWordCompleters,
    // because we know it wants to access attributes now
    if (prefix === '')
      disableSystemCompleters();
    else
      enableSystemCompleters();

    var completions = [];
    var proposals = computeCompletions(editor, session, pos, prefix);
    for (var i in proposals) {
      var proposal = proposals[i];
      completions.push({
        value: prefix + proposal.proposal,
        // this section can be ued to show helper message
        // snippet: proposal.description,
        description: proposal.description,
        // type: "snippet"
      });
    }

    callback(null, completions);
  },

  // add this line to make foo. can trigger the pop-up window
  identifierRegexps: [ /[a-zA-Z_0-9\$\-\u00A2-\uFFFF.]/ ]
};

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

function enalbeKeyWordCompleter() {
  enableCompleter(langTools.keyWordCompleter);
}

function disableKeyWordCompleter() {
   disableCompleter(langTools.keyWordCompleter);
}

function disableSnippetCompleter() {
  disableCompleter(langTools.snippetCompleter);
}

function enableSnippetCompleter() {
  enableCompleter(langTools.sinppetCompleter);
}

// enable keyWordCompleter and snippetCompleter
function enableSystemCompleters() {
  enableCompleter(langTools.keyWordCompleter);
  enableCompleter(langTools.snippetCompleter);
}

// disable keyWordCompleter and sinppetCompleter
function disableSystemCompleters() {
  disableCompleter(langTools.keyWordCompleter);
  disableCompleter(langTools.snippetCompleter);
}

// get a file path that is currently editted
function getEdittingFilePath() {
  return currentEdittingFile;
}

function setEdittingFilePath(filePath) {
  currentEdittingFile = filePath;
}

editor.setOptions({
  enableLiveAutocompletion: true,
  enableSnippets: true,
});
editor.setTheme('ace/theme/monokai');
editor.getSession().setMode('ace/mode/javascript');
editor.$blockScrolling = Infinity;
editor.completers = [myCompleter, langTools.keyWordCompleter, langTools.snippetCompleter];


editor.on('change', function(e){
  currentFileIsChanged = true;
});
