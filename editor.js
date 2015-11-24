
helper = require('./helper.js');

// initialize editor
var editor = helper.getEditor();
editor.setOptions({
    enableLiveAutocompletion: true,
    enableSnippets: true,
});
editor.setTheme('ace/theme/monokai');
editor.getSession().setMode('ace/mode/javascript');
editor.$blockScrolling = Infinity;

require('./grammer_completer.js');

// keep keyWordCompleter and add our own completer
helper.initCompleters();