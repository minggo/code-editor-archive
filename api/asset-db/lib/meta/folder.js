'use strict';

const Fs = require('fire-fs');
const AssetMeta = require('./asset');

class FolderMeta extends AssetMeta {
  constructor ( assetdb ) {
    super( assetdb );
  }

  export (path, data, cb) {
    Fs.mkdirSync(path);
    if ( cb ) cb ();
  }

  static defaultType () { return 'folder'; }
}
FolderMeta.prototype.import = null;

module.exports = FolderMeta;
