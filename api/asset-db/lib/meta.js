'use strict';

var Path = require('fire-path');
var Fs = require('fire-fs');
var JS = require('./js-utils');

var Meta = {
    AssetMeta: require('./meta/asset'),
    FolderMeta: require('./meta/folder'),
};
module.exports = Meta;

/**
 * create meta
 */
Meta.create = function ( assetdb, metapath, uuid ) {
    if ( Path.extname(metapath) !== '.meta' ) {
        assetdb.error( 'Invalid metapath %s, must use .meta as suffix', metapath );
        return null;
    }

    var ctor = Meta.findCtor( assetdb, assetdb._metaToAssetPath(metapath) );
    if ( !ctor ) {
        return null;
    }

    if ( !uuid && Fs.existsSync(metapath) ) {
        try {
            var jsonObj = JSON.parse(Fs.readFileSync(metapath));
            uuid = jsonObj.uuid;
        } catch ( err ) {
            uuid = null;
        }
    }

    var meta = new ctor( assetdb );
    if ( uuid )
        meta.uuid = uuid;

    return meta;
};

/**
 * create sub meta
 */
Meta.createSubMeta = function ( assetdb, ctor, uuid ) {
    if ( typeof ctor !== 'function' ) {
        assetdb.error( 'Invalid constructor for sub meta' );
        return null;
    }

    var meta = new ctor( assetdb );
    if ( uuid )
        meta.uuid = uuid;

    return meta;
};

/**
 * get the ctor
 * @param {string} fs-path
 */
Meta.findCtor = function ( assetdb, assetpath ) {
    if ( Path.extname(assetpath) === '.meta' ) {
        assetdb.error( 'Invalid assetpath, must not use .meta as suffix' );
        return null;
    }

    var extname = Path.extname(assetpath);
    var assetExists = Fs.existsSync(assetpath);
    if ( !extname && assetExists === false ) {
        return Meta.FolderMeta;
    }

    var isFolder = Fs.isDirSync(assetpath);
    var infos = assetdb._extname2infos[extname];

    // pattern match process
    if ( infos ) {
        for ( var i = 0; i < infos.length; ++i ) {
            var info = infos[i];
            var skip = (isFolder && !info.folder) || (!isFolder && info.folder);

            if ( !skip ) {
                var metaCtor = info.ctor;
                if ( metaCtor.validate ) {
                    if ( assetExists ) {
                        try {
                            if ( metaCtor.validate(assetpath) ) {
                                return metaCtor;
                            }
                        } catch ( err ) {
                            // skip error ctor
                        }
                    }
                }
                else {
                    return metaCtor;
                }
            }
        }
    }

    // default process
    if ( isFolder ) {
        return Meta.FolderMeta;
    }
    return Meta.AssetMeta;
};

/**
 * the latest register, will be first match
 */
Meta.register = function ( assetdb, extname, folder, metaCtor ) {
    if ( metaCtor !== Meta.AssetMeta && !JS.isChildClassOf(metaCtor, Meta.AssetMeta) ) {
        assetdb.warn( 'Failed to register meta to %s, the metaCtor is not extended from AssetMeta', extname );
        return;
    }

    if ( typeof extname !== 'string' || extname[0] !== '.' ) {
        assetdb.warn( 'Invalid extname %s, must be string and must in the format ".foo"', extname );
        return;
    }

    if ( !assetdb._extname2infos[extname] ) {
        assetdb._extname2infos[extname] = [];
    }
    assetdb._extname2infos[extname].unshift({
        folder: folder,
        ctor: metaCtor
    });
};

/**
 * the latest register, will be first match
 */
Meta.unregister = function ( assetdb, metaCtor ) {
    for ( var p in assetdb._extname2infos ) {
        if ( assetdb._extname2infos[p].ctor === metaCtor ) {
            delete assetdb._extname2infos[p];
        }
    }
};

/**
 * reset
 */
Meta.reset = function (assetdb) {
    assetdb._extname2infos = {};
};

/**
 *
 */
Meta.isInvalid = function ( assetdb, meta, jsonObj ) {
    if ( meta.uuid !== jsonObj.uuid )
        return true;

    if ( meta.ver !== jsonObj.ver )
        return true;

    return false;
};

/**
 * load
 */
Meta.load = function ( assetdb, metapath ) {
    if ( Path.extname(metapath) !== '.meta' ) {
        assetdb.error( 'Invalid metapath, must use .meta as suffix' );
        return null;
    }

    // Load sub meta
    if ( assetdb.isSubAssetByPath(metapath) ) {
        var parent = Meta.load( assetdb, Path.dirname(metapath) + '.meta' );
        var key = Path.basenameNoExt( metapath );

        if ( !parent ) {
            return null;
        }

        var subMetas = parent.getSubMetas();
        if ( !subMetas || !subMetas[key] ) {
            return null;
        }

        return subMetas[key];
    }

    if ( !Fs.existsSync(metapath) ) {
        return null;
    }

    var jsonObj;
    try {
        jsonObj = JSON.parse(Fs.readFileSync(metapath));
    } catch ( err ) {
        assetdb.failed( 'Failed to load meta %s, message: %s', metapath, err.message );
        return null;
    }

    //
    var meta = Meta.create( assetdb, metapath, jsonObj.uuid );
    if ( !meta ) {
        return null;
    }

    // check if meta valid
    if ( Meta.isInvalid( assetdb, meta, jsonObj ) ) {
        return null;
    }

    meta.deserialize(jsonObj);
    return meta;
};

/**
 * save
 */
Meta.save = function ( assetdb, metapath, meta ) {
    if ( Path.extname(metapath) !== '.meta' ) {
        assetdb.error( 'Invalid metapath, must use .meta as suffix' );
        return null;
    }

    var obj = meta.serialize();
    Fs.writeFileSync(metapath, JSON.stringify(obj, null, 2));
};

/**
 * get meta file's version number
 */
Meta.loadVer = function ( assetdb, metapath ) {
    if ( Path.extname(metapath) !== '.meta' ) {
        assetdb.error( 'Invalid metapath, must use .meta as suffix' );
        return -1;
    }

    if ( !Fs.existsSync(metapath) ) {
        return -1;
    }

    var jsonObj;
    try {
        jsonObj = JSON.parse(Fs.readFileSync(metapath));
    } catch ( err ) {
        assetdb.failed( 'Failed to load meta %s, message: %s', metapath, err.message );
        return -1;
    }

    if ( typeof jsonObj.ver === 'number' )
        return jsonObj.ver;

    return -1;
};
