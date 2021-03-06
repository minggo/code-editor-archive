var fs = require('fs');
var path = require('path');
var helper = require('./helper.js');
var EsprimaJavaScriptContentAssistProvider = require('./esprima/esprimaJsContentAssist.js').EsprimaJavaScriptContentAssistProvider;


// recorded file summaries,
// key: full path of a file
// value: summary generated by EsprimaJavaScriptContentAssistProvider.computeSummary
var fileSummaries = {};

var EsprimaHelper = function(fileName) {
  this.fileName = fileName;
  instance = this;

  this.retrieveSummary = function(fileName) {
    // get the summary of `file_name`, if it is not exists, then generate it if possible
    fileName = helper.findFile(fileName + '.js');
    if (fileName)
      return instance.getOrCreateSummary(fileName);
    else
      return null;
  },

  this.indexers = {
    retrieveGlobalSummaries : function(){},
    retrieveSummary : this.retrieveSummary,
  };

  this.esprima = new EsprimaJavaScriptContentAssistProvider(this.indexers);
}

EsprimaHelper.prototype = {
  // get or create a summary for the file
  // `file_name` is a path relative to current editting file, such as `./test.js`
  getOrCreateSummary:  function(fileName) {
    var summary = fileSummaries[fileName];
    if (!summary) {
      // generate summary for the file
      if (!fs.existsSync(fileName)) {
        // console.log(this.fileName + ' require unexists file: ' + fileName);
        return null;
      }

      var fileContent = fs.readFileSync(fileName, 'utf-8');
      summary = this.saveFileSummary(fileName, fileContent,false);
    }

    return summary;
  },

  saveFileSummary: function(fileName, fileContent, forceSave) {
    // if the summary is exists, then return
    if (fileSummaries[fileName] && !forceSave)
      return;

    var esprimaHelper = new EsprimaHelper(fileName);
    var summary = esprimaHelper.esprima.computeSummary(fileContent, fileName);
    fileSummaries[fileName] = summary;
    return summary;
  },

  computeCompletions: function(buf, offset, prefix) {
    return this.esprima.computeCompletions(buf, offset, prefix);
  }
};
EsprimaHelper.prototype.constructor = EsprimaHelper;

module.exports = EsprimaHelper;


