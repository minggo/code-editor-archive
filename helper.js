var fs = require('fs');
var path = require('path');

// root directory of the project, it will use fireball core level to get the value when integrating with fireball
exports.rootDir = __dirname;


// find js file with the file name in root directory
// in fireball, file name is unique through the project
exports.findFile = function(fileName) {
  return findFileInDirectory(exports.rootDir, fileName);
}

function findFileInDirectory(directory, fileName) {
  var files = fs.readdirSync(directory);
  for (var i in files) {
    var file = path.join(directory, files[i]);
    var stat = fs.statSync(file);
    if (stat.isFile() && (files[i] === fileName))
        return file;

    if (stat.isDirectory()) {
      var newDirectory = path.join(directory, files[i]);
      var ret = findFileInDirectory(newDirectory, fileName);
      if (ret)
        return ret;
    }
  }

  // can not find the file
  return null;
}
