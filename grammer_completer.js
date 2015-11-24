helper = require('./helper.js');

var EsprimaJavaScriptContentAssistProvider = require('./esprima/esprimaJsContentAssist.js').EsprimaJavaScriptContentAssistProvider;
var esprima = new EsprimaJavaScriptContentAssistProvider();

// when user input '.', will catch it to show help information
editor.on('change', function(e) {
  if (e.action === 'insert') {
    if (e.lines.length === 1 && e.lines[0] === '.') {
      // should disable keyWordComplete first
    }
  }
});

var myCompleter = {
  getCompletions: function(editor, session, pos, prefix, callback) {
    var completions = [];
    
    var proposals = computeCompletions(editor, session, pos, prefix);
    for (var i in proposals) {
      var proposal = proposals[i];
      completions.push({
        value: prefix + proposal.proposal,
      });
    }

    callback(null, completions);
  }
};

// use esprima to parse the file and return completions
function computeCompletions(editor, session, pos, prefix) {
  var offset = session.getDocument().positionToIndex(pos);
  var proposals = esprima.computeCompletions(session.getValue(), offset, prefix);
  return proposals;
}

module.exports = myCompleter;
