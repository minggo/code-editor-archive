'use strict';

const Fs = require('fire-fs');
const Uuid = require('node-uuid');

class AssetMeta {
  constructor ( assetdb ) {
    if ( !assetdb ) {
      throw new Error(`AssetDB must be given while creating a new meta`);
    }
    this._assetdb = assetdb;
    this.ver = 0;
    if ( !this.uuid ) {
      this.uuid = Uuid.v4();
    }

    // Protect it from being modified
    this.__subMetas__ = {};
  }

  useRawfile () { return true; }

  dests () { return []; }

  serialize () {
    var obj = {}, i, key, meta,
        keys = Object.keys(this);
    for ( i = 0; i < keys.length; ++i ) {
      key = keys[i];
      if ( key[0] === '_' ) continue;
      obj[key] = this[key];
    }

    if ( this.__subMetas__ ) {
      obj.subMetas = {};
      for ( key in this.__subMetas__ ) {
        meta = this.__subMetas__[key];
        obj.subMetas[key] = meta.serialize();
      }
    }
    return obj;
  }

  deserialize ( jsonObj ) {
    this.ver = jsonObj.ver;
    this.uuid = jsonObj.uuid;
  }

  export (path, data, cb) {
    if (data) {
      Fs.writeFile(path, data, cb);
      return;
    }

    if ( cb ) {
      cb ();
    }
  }

  getSubMetas () {
    return this.__subMetas__ ? this.__subMetas__ : null;
  }

  copySubMetas () {
    var results = {},
        subMetas = this.getSubMetas(),
        keys, i, key;
    if (subMetas) {
      keys = Object.keys( subMetas );
      for ( i = 0; i < keys.length; ++i ) {
        key = keys[i];
        results[key] = subMetas[key];
      }
    }
    return results;
  }

  updateSubMetas ( newSubMetas ) {
    newSubMetas = newSubMetas || {};
    // Update sub metas
    this.__subMetas__ = newSubMetas;
  }

  assetType () { return this.constructor.defaultType(); }

  static defaultType () { return 'asset'; }
}

AssetMeta.prototype.import = null;
// AssetMeta.validate = null;

module.exports = AssetMeta;

