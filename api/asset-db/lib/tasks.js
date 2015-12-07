'use strict';

var Fs = require('fire-fs');
var Path = require('fire-path');
var Async = require('async');
var Globby = require('globby');
var Minimatch = require('minimatch');
var Del = require('del');

var Static = require('../lib/static');

var Tasks = {};
module.exports = Tasks;

var Meta = require('./meta');

// ===================================================
// internal task
// ===================================================

/**
 * check and remove unused meta file
 * @param {object} assetdb - asset database
 * @param {string} fspath - meta file path
 */
function _checkIfMountValid ( assetdb, path, name ) {
    var reg = /[\\/.]/;
    if ( reg.test(name) ) {
        assetdb.throw( 'normal', 'Invalid character in %s, you can not contains `/`, `\\` or `.`', name );
    }

    if ( assetdb._mounts[name] ) {
        assetdb.throw( 'normal', 'Failed to mount %s to %s, already exists!', path, name );
    }

    for ( var p in assetdb._mounts ) {
        var mountPath = assetdb._mounts[p].path;
        if ( Path.contains(mountPath, path) ) {
            assetdb.throw( 'normal', 'Failed to mount %s to %s, the path or its parent %s already mounted to %s',
                       path, name, mountPath, p );
        }
        if ( Path.contains(path, mountPath) ) {
            assetdb.throw( 'normal', 'Failed to mount %s to %s, its child path %s already mounted to %s',
                       path, name, mountPath, p );
        }
    }
}

function _deleteImportedAssetsForUuid ( assetdb, uuid, cb ) {
    var importPath = assetdb._uuidToImportPathNoExt(uuid);

    Async.series([
        // delete all imported files
        function(next) {
            Del([
                importPath,
                importPath + '.*'
            ], { force: true }, next);
        },
        // if parent folder is empty, then also delete parent folder
        function (next) {

            var parentPath = Path.dirname(importPath);
            var pattern = Path.join(parentPath,'**/*');

            Globby( pattern, function ( err, paths ) {
                paths = paths.map( function (path) {
                    return Path.normalize(path);
                });

                if (paths.length === 0) {
                    Del(parentPath, {force: true}, next);
                }
                else {
                    next();
                }
            });
        },
        // delete imported assets for sub metas
        function (next) {
            var subAssets = assetdb.subAssetInfosByUuid( uuid );
            Async.each( subAssets, (subAsset, nextSubAssetCb) => {
                var subUuid = subAsset.uuid;
                // Recursively delete imported assets for sub metas
                _deleteImportedAssetsForUuid( assetdb, subUuid, nextSubAssetCb);
            },
            (err) => {
                if (err) 
                    assetdb.failed( "Fail to delete imported files for sub assets of %s : %s", uuid, err.stack );
                next();
            });
        }
    ], function (err) {
        if (cb) cb(err);
    });
}

/**
 */
function _deleteImportedAssets ( assetdb, uuids, cb ) {
    Async.eachSeries(uuids, function (uuid, done) {
        _deleteImportedAssetsForUuid( assetdb, uuid, done );
    }, function (err) {
        if (cb) cb(err);
    });
}

/**
 * check and remove unused meta file
 * @param {object} assetdb - asset database
 * @param {string} metapath - meta file path
 */
function _removeUnusedMeta ( assetdb, metapath ) {
    var rawpath = assetdb._metaToAssetPath(metapath);

    // remove .meta file if its raw data does not exist
    if ( !Fs.existsSync(rawpath) ) {
        assetdb.info( 'remove unused meta: ' + assetdb._url( metapath ) );
        Fs.unlinkSync( metapath );
        return true;
    }

    return false;
}

/**
 * _removeUnusedImportFiles
 */
function _removeUnusedImportFiles ( assetdb, cb ) {
    var uuidRE = /\S{8}-\S{4}-\S{4}-\S{4}-\S{12}/;

    // Globby
    Globby( Path.join(assetdb._importPath, '**/*'), function ( err, paths ) {
        Async.each( paths, function ( path, done ) {
            path = Path.normalize(path);

            // if this is a folder, skip it
            if ( Fs.isDirSync(path) ) {
                done();
                return;
            }

            // if we have the uuid in db, skip it
            var uuid = uuidRE.exec(path);
            if ( !uuid.length ) {
                return;
            }

            uuid = uuid[0];
            if ( assetdb._uuid2path[uuid] !== undefined ) {
                done();
                return;
            }

            //
            assetdb.log( 'remove unused import file ' + uuid );
            _deleteImportedAssetsForUuid( assetdb, uuid, function ( err ) {
                if ( err ) {
                    assetdb.failed('Failed to remove import file %s, message: %s', uuid, err.stack);
                }
                done();
            });

        }, function ( err ) {
            if ( cb ) cb (err);
        });
    });
}

/**
 * _removeUnusedMtimeInfo
 */
function _removeUnusedMtimeInfo ( assetdb, cb ) {
    var uuids = Object.keys(assetdb._uuid2mtime);
    Async.each( uuids, function ( uuid, done ) {
        var fspath = assetdb.uuidToFspath(uuid);
        if ( !Fs.existsSync(fspath) ) {
            delete assetdb._uuid2mtime[uuid];
            assetdb.log('remove unused mtime info: ' + uuid);
        }
        done();
    }, function ( err ) {
        if ( cb ) cb (err);
    });
}

/**
 * task scan
 * @param {object} assetdb - asset database
 * @param {string} fspath - file system path
 * @param {object} opts - options
 * @param {object} opts.remove-unused-meta - indicate if remove unused meta file
 * @param {object} opts.filter-meta - if results need filter .meta file
 * @param {function} cb
 */
function _scan ( assetdb, fspath, opts, cb ) {
    if ( typeof opts === 'function' ) {
        cb = opts;
        opts = null;
    }

    opts = opts || {};
    if ( typeof opts['remove-unused-meta'] !== 'boolean' ) {
        opts['remove-unused-meta'] = true;
    }
    if ( typeof opts['filter-meta'] !== 'boolean' ) {
        opts['filter-meta'] = true;
    }

    var pattern = fspath;
    if ( Fs.isDirSync( fspath ) ) {
        pattern = [pattern, Path.join(fspath,'**/*') ];
    }

    var results = [];

    // Globby
    Globby( pattern, function ( err, paths ) {
        if ( err ) {
            if (cb) cb ( err );
            return;
        }

        paths.forEach( function ( path ) {
            path = Path.normalize(path);
            var extname = Path.extname(path);
            if ( extname !== '.meta' || !opts['filter-meta'] ) {
                results.push(path);
                return;
            }

            if ( opts['remove-unused-meta'] ) {
                _removeUnusedMeta( assetdb, path );
            }
        });

        if ( cb ) cb ( null, results );
    });
}

/**
 * check if reimport
 * @param {object} assetdb - asset database
 * @param {string} fspath - file system path
 * @param {function} cb
 */
function _checkIfReimport ( assetdb, fspath, cb ) {
    // do not import mounting path
    if ( assetdb._isRoot(fspath) ) {
        if ( cb ) cb ( null, false );
        return;
    }

    var uuid = assetdb.fspathToUuid(fspath);
    var metapath = fspath+'.meta';

    // if we don't find the meta, reimport it
    if ( !Fs.existsSync(metapath) ) {
        if ( cb ) cb ( null, true );
        return;
    }

    // if we don't find the uuid, reimport it
    if ( !uuid ) {
        if ( cb ) cb ( null, true );
        return;
    }

    // check if the asset needs import
    var metaObj = Meta.load( assetdb, metapath );
    var dests = metaObj.dests();
    for ( var i = 0; i < dests.length; ++i ) {
        if ( !Fs.existsSync(dests[i]) ) {
            if ( cb ) cb ( null, true );
            return;
        }
    }

    // if import file exists, check the rawdata's mtime
    var mtimeInfo = assetdb._uuid2mtime[uuid];
    if ( mtimeInfo ) {
        var assetStat = Fs.statSync(fspath);
        if ( mtimeInfo.asset !== assetStat.mtime.getTime() ) {
            if ( cb ) cb ( null, true );
            return;
        }

        var metaStat = Fs.statSync(fspath + '.meta');
        if ( mtimeInfo.meta !== metaStat.mtime.getTime() ) {
            if ( cb ) cb ( null, true );
            return;
        }

        // no need for reimport
        if ( cb ) cb ( null, false );
        return;
    }

    // reimport anyway
    if ( cb ) cb ( null, true );
}

/**
 * precache uuid from meta files, if meta file not exists, create it
 * @param {object} assetdb - asset database
 * @param {string} fspath - file system path
 * @param {function} cb
 */
function _initMetas ( assetdb, fspath, path2uuid, cb ) {
    var pattern = fspath;
    if ( Fs.isDirSync( fspath ) ) {
        pattern = Path.join(fspath,'**/*');
        if ( !assetdb._isRoot(fspath) ) {
            pattern = [fspath, pattern];
        }
    }

    var results = [];

    // Globby
    Globby( pattern, function ( err, paths ) {
        if ( err ) {
            if (cb) cb ( err );
            return;
        }

        paths.forEach( function ( path ) {
            path = Path.normalize(path);
            var extname = Path.extname(path);
            var metaObj;

            // if this is an asset file, check if meta exists and skip it
            if ( extname === '.meta' ) {
                // check and remove unused meta
                _removeUnusedMeta( assetdb, path );
                return;
            }

            var metapath = path + '.meta';

            // if meta exists, load it
            metapath = path + '.meta';
            if ( Fs.existsSync(metapath) ) {
                // try to load the meta
                metaObj = Meta.load( assetdb, metapath );
                if ( metaObj ) {
                    results.push({
                        assetpath: path,
                        meta: metaObj,
                    });
                    // Add sub metas to the results
                    var subMetas = metaObj.getSubMetas();
                    if ( subMetas ) {
                        var subMeta, key, subAssetPath;
                        for ( key in subMetas ) {
                            subMeta = subMetas[key];
                            subAssetPath = Path.join( path, key );
                            results.push({
                                assetpath: subAssetPath,
                                meta: subMeta,
                            });
                        }
                    }
                    return;
                }
            }

            // if meta not exists, create and save it
            var uuid;

            // if path2uuid exists, then use uuid in path2uuid
            if ( path2uuid ) {
                uuid = path2uuid[path];
            }
            metaObj = Meta.create( assetdb, metapath, uuid );

            Meta.save( assetdb, metapath, metaObj );
            results.push({
                assetpath: path,
                meta: metaObj,
            });
        });

        if ( cb ) cb ( null, results );
    });
}

/**
 * precache uuid from meta files, if meta file not exists, create it
 * @param {object} assetdb - asset database
 * @param {string} fspath - file system path
 * @param {function} cb
 */
function _importAsset ( assetdb, fspath, cb ) {
    var metaDirty = false;
    var metapath = fspath + '.meta';
    var meta = Meta.load( assetdb, metapath );

    if ( !meta ) {
        meta = Meta.create( assetdb, metapath );
        metaDirty = true;

        // if we still get null, report error
        if ( !meta ) {
            if ( cb ) cb ( new Error('Can not create or load meta from ' + fspath) );
            return;
        }
    }

    if ( assetdb.isSubAssetByPath(fspath) ) {
        if ( cb ) cb ( null, meta );
        return;
    }

    // Copy old sub metas
    var oldSubMetas = meta.copySubMetas();
    var newSubMetas = {};

    Async.series([
        function ( next ) {
            // skip assets that doesn't need import
            if ( meta.import ) {
                try {
                    assetdb.log( 'import asset %s...', fspath );
                    meta.import ( fspath, function ( err ) {
                        newSubMetas = meta.getSubMetas() || {};
                        metaDirty = true;
                        next ( err );
                    });
                } catch ( err ) {
                    next ( err );
                }
                return;
            }

            next ();
        },

        function ( next ) {
            // Remove all old sub metas from db
            var i, key, subMetaPath, subMeta;
            var keys = Object.keys( oldSubMetas );
            for ( i = 0; i < keys.length; ++i ) {
                key = keys[i];
                subMeta = oldSubMetas[key];
                subMetaPath = assetdb.uuidToFspath( subMeta.uuid );
                assetdb._dbDelete( subMetaPath );
            }
            // Guard uuid for updated sub metas (same key)
            keys = Object.keys( newSubMetas );
            for ( i = 0; i < keys.length; ++i ) {
                key = keys[i];
                subMeta = newSubMetas[key];
                subMetaPath = Path.join( fspath, key );
                if ( oldSubMetas[key] ) {
                    subMeta.uuid = oldSubMetas[key].uuid;
                }
            }

            next();
        },

        function ( next ) {
            var keys = Object.keys( newSubMetas );

            // Import sub metas
            Async.each( keys, ( key, nextKeyCb ) => {
                let subMetaPath = Path.join( fspath, key );
                let subMeta = newSubMetas[key];
                if ( subMeta.import ) {
                    subMeta.import( subMetaPath, function () {
                        // Add sub meta to db
                        assetdb._dbAdd( subMetaPath, subMeta.uuid );
                        nextKeyCb();
                    });
                }
                else {
                    // Add sub meta to db
                    assetdb._dbAdd( subMetaPath, subMeta.uuid );
                    nextKeyCb();
                }
            },
            err => {
                next( err );
            });
        },

        // DISABLE
        // function ( next ) {
        //     // skip assets that doesn't need import
        //     if ( meta.postImport ) {
        //         try {
        //             assetdb.log( 'post-import asset %s...', fspath);
        //             meta.postImport ( fspath, function ( err ) {
        //                 next ( err );
        //             });
        //         } catch ( err ) {
        //             next ( err );
        //         }
        //         return;
        //     }
        //     next ();
        // },
    ], function ( err ) {
        if ( err ) {
            if ( cb ) cb ( err );
            return;
        }

        // save meta to file if it is new created or need import
        if ( metaDirty ) {
            Meta.save( assetdb, metapath, meta );
        }

        //
        if ( cb ) cb ( null, meta );
    });
}

/**
 * Construct results for given meta and fill into the results array
 * @param {object} assetdb - asset database
 * @param {string} path - file system path for asset
 * @param {AssetMeta} meta - Meta object
 * @param {Array} results - The results array to fill
 */
function _fillInResults ( assetdb, path, meta, results ) {
    var parentPath = Path.dirname(path);
    var parentID = assetdb.fspathToUuid(parentPath);

    results.push({
        uuid: meta.uuid,
        parentUuid: parentID,
        url: assetdb._url(path),
        path: path,
        type: meta.assetType(),
    });

    // Process sub metas
    var subMetas = meta.getSubMetas();
    if ( subMetas ) {
        var key, subMeta, subPath;
        for (key in subMetas) {
            subMeta = subMetas[key];
            subPath = Path.join( path, key );
            results.push({
                uuid: subMeta.uuid,
                parentUuid: meta.uuid,
                url: assetdb._url(subPath),
                path: subPath,
                type: subMeta.assetType(),
                isSubAsset: true,
            });
        }
    }
}

/**
 * task refresh
 */
function _refresh ( assetdb, fspath, force, cb ) {
    Async.waterfall([
        // scan and collect all assets
        function ( next ) {
            assetdb.log( 'scan %s...', fspath);
            _scan( assetdb, fspath, {
                'remove-unused-meta': true
            }, next );
        },

        // check if re-import
        function ( paths, next ) {
            assetdb.log( 'check if reimport...');
            var results = [];
            Async.each( paths, function ( path, done ) {
                if ( force ) {
                    results.push(path);
                    done();
                    return;
                }

                _checkIfReimport( assetdb, path, function ( err, needsImport ) {
                    if ( err ) {
                        assetdb.failed('failed to check-if-reimport for %s, message: %s',
                                       Path.relative( fspath, path ),
                                       err.stack);
                        done();
                        return;
                    }

                    if ( needsImport ) {
                        results.push(path);
                    }
                    done();
                });
            }, function ( err ) {
                next ( err, results );
            } );
        },

        // reimport assets
        function ( paths, next ) {
            assetdb.log( 'reimport assets...');

            var results = [];
            Async.each( paths, function ( path, done ) {
                _importAsset( assetdb, path, function ( err, meta ) {
                    if ( err ) {
                        assetdb.failed('Failed to import asset %s, message: %s',
                                       path,
                                       err.stack);
                        done();
                        return;
                    }
                    assetdb.updateMtime(meta.uuid);

                    _fillInResults( assetdb, path, meta, results );

                    done();
                });
            }, function ( err ) {
                next ( err, results );
            } );
        },

    ], function ( err, results ) {
        if ( cb ) cb ( err, results );
    });
}

function _checkMoveInput (assetdb, srcPath, destPath, cb) {
    var destDirname = Path.dirname(destPath);

    var isSrcExists = Fs.existsSync(srcPath);
    var isDestExists = Fs.existsSync(destPath);

    var isSrcFolder = Fs.isDirSync(srcPath);
    var isDestFolder = Fs.isDirSync(destPath);

    var srcBaseName = Path.basename(srcPath);

    // check invalid

    // if srcPath not exists
    if ( !isSrcExists) {
        if (cb) cb( new Error('Src asset ' + srcPath + ' s is not exists') );
        return;
    }

    // if destPath's parent path not exists
    if ( !Fs.existsSync(destDirname) ) {
        if (cb) cb( new Error('Dest parent path ' + destDirname + ' is not exists') );
        return;
    }

    // if destPath exists and destPath is a file
    if ( isDestExists ) {
        if ( srcPath.toLowerCase() !== destPath.toLowerCase() ) {
            if (cb) cb( new Error('Dest asset ' + destPath + ' already exists') );
            return;
        }
    }

    // if destPath and srcPath both are folder and destPath already has an item named with srcPath's name
    if ( isDestFolder && isSrcFolder && Fs.existsSync( Path.join(destPath, srcBaseName) ) ) {
        if (cb) cb ( new Error('Dest normal asset ' + destPath + ' already exists') );
        return;
    }

    if (cb) cb();
}

/**
 * callback's parameters: srcPath, destPath, srcpaths, destPaths
 */
function _preProcessMoveInput(assetdb, srcPath, destPath, cb) {
    _scan(assetdb, srcPath, null, function (err, srcPaths) {
        var destPaths = srcPaths.map(function (path) {
            var relativePath = Path.relative(srcPath, path);

            return Path.join(destPath, relativePath);
        });

        cb(null, srcPaths, destPaths);
    });
}


/**
 *
 */
function _copyFiles (assetdb, srcPath, destPath, cb) {

    // if srcPath has meta, then also copy or rename meta
    Async.series([
        function (cb) {
            Fs.rename(srcPath, destPath, cb);
        },
        function (cb) {
            var srcMeta = srcPath + '.meta';
            var destMeta = destPath + '.meta';

            if ( !Fs.existsSync(srcMeta) ) {
                if (cb) cb();
                return;
            }

            Fs.rename(srcMeta, destMeta, function (err) {
                if (err) {
                    // if copy meta failed, then copy asset back.
                    Fs.rename(destPath, srcPath, function (copyBackErr) {
                        assetdb.error(copyBackErr);
                    });
                }

                if (cb) cb(err);
            });
        }
    ], function (err) {
        if (cb) cb(err);
    });
}

function _preProcessImportFiles (assetdb, rawfiles, destPath, cb) {

    // make sure destPath is a directory and exists
    if ( !Fs.isDirSync(destPath) ) {
        if ( cb ) cb ( new Error( 'Invalid dest path, make sure it exists and it is a directory' ) );
        return;
    }

    // make sure rawfiles uniqued
    var names = rawfiles.map(function ( file ) {
        return Path.basename(file);
    });

    // get top level rawfiles
    rawfiles = assetdb.arrayCmpFilter( rawfiles, function ( a, b ) {
        if ( Path.contains( a, b ) ) return 1;
        if ( Path.contains( b, a ) ) return -1;
        return 0;
    });

    // var destMountType = assetdb.mountInfoByPath(destPath).type;

    // filter out rawfiles that already under asset-db mounting path
    rawfiles = rawfiles.filter(function ( file, index ) {
        if ( assetdb._isAssetPath(file) ) {
            assetdb.failed( 'Can not import file %s, already in the database', file );
            return false;
        }

        var destFile = Path.join( destPath, Path.basename(file) );
        var basename = Path.basename(file);

        if ( Fs.existsSync(destFile) ) {
            assetdb.failed( 'Can not import file %s, name conflict in dest path: %s', file, basename );
            return false;
        }

        var idx = names.indexOf(basename);
        if ( idx !== index ) {
            assetdb.failed( 'Can not import file %s, name conflict with %s', file, rawfiles[idx] );
            return false;
        }

        return true;
    });

    if (cb) cb(null, rawfiles);
}

/**
 * For save / saveMeta tasks to generate sub meta diff informations
 */
function _generateSubMetaDiff ( assetdb, meta, oldSubMetas ) {
    var newSubMetas = meta.getSubMetas();
    newSubMetas = newSubMetas || {};
    var fspath = assetdb.uuidToFspath(meta.uuid);

    var deleted = [];
    var added = [];

    // Compare sub metas
    var keys = Object.keys(oldSubMetas), 
        i, key;
    for ( i = 0; i < keys.length; ++i ) {
        key = keys[i];
        var subMeta = oldSubMetas[key];
        if ( !newSubMetas[key] ) {
            deleted.push({
                uuid: subMeta.uuid,
                path: Path.join( fspath, key ),
            });
        }
    }
    keys = Object.keys(newSubMetas);
    for ( i = 0; i < keys.length; ++i ) {
        key = keys[i];
        var subMeta = newSubMetas[key];
        var subPath = Path.join( fspath, key );
        if ( !oldSubMetas[key] ) {
            added.push({
                uuid: subMeta.uuid,
                parentUuid: meta.uuid,
                path: subPath,
                url: assetdb.uuidToUrl( subMeta.uuid ),
                type: subMeta.assetType(),
                isSubAsset: true,
            });
        }
    }

    return {
        deleted: deleted,
        added: added
    }
}


// ===================================================
// public task
// ===================================================

// task mount
Tasks.mount = function ( assetdb, path, name, type, cb ) {
    if ( typeof path !== 'string' ) {
        if ( cb ) cb ( new Error ('expect 1st param to be a string') );
        return;
    }

    if ( !Fs.isDirSync(path) ) {
        if ( cb ) {
            cb ( new Error ( 'Failed to mount ' + path + ', path not found or it is not a directory!' ) );
        }
        return;
    }

    if ( typeof name !== 'string' ) {
        if ( cb ) cb ( new Error ('expect 2nd param to be a string') );
        return;
    }

    if ( !Static.MountType[type] ) {
        if (cb) cb ( new Error ('Invalid mount type : ' + type) );
        return;
    }

    path = Path.resolve(path);

    _checkIfMountValid(assetdb, path, name);

    // add mounting path
    assetdb._mounts[name] = {
        path: path,
        type: type,
        name: name
    };

    assetdb._dbAdd(path, assetdb._mountIDByName(name));

    if ( cb ) cb ();
};

// task unmount
Tasks.unmount = function ( assetdb, name, cb ) {
    // type check
    if ( typeof name !== 'string' ) {
        if ( cb ) cb ( new Error ('expect 1st param to be a string') );
        return;
    }

    // check if mounts exists
    if ( !assetdb._mounts[name] ) {
        if ( cb ) cb ( new Error ( 'can not find the mount ' + name ) );
        return;
    }

    // TODO: remove import files relate with the mounts

    assetdb._dbDelete(assetdb._mounts[name].path);
    delete assetdb._mounts[name];

    if ( cb ) cb ();
};

// task init
// init asset db after setup mounts
Tasks.init = function ( assetdb, cb ) {
    var mountNames = Object.keys(assetdb._mounts);

    // only meta type need import to library
    mountNames = mountNames.filter( function (name) {
        return assetdb._mounts[name].type === Static.MountType.asset;
    });

    var reimportList = [];

    Async.series([
        // init meta files
        function ( next ) {
            Async.eachSeries( mountNames, function ( name, done ) {
                var fspath = assetdb._mounts[name].path;
                assetdb.log('init meta files at %s://', name);
                _initMetas(assetdb, fspath, null, function ( err, results ) {
                    results.forEach(function ( result ) {
                      assetdb._dbAdd(
                        result.assetpath,
                        result.meta.uuid
                      );
                    });
                    done();
                });
            }, next );
        },

        // refresh
        function ( next ) {
            Async.eachSeries( mountNames, function ( name, done ) {
                var fspath = assetdb._mounts[name].path;
                assetdb.log('refresh at %s://', name);
                _refresh( assetdb, fspath, false, function ( err, results ) {
                    if ( err ) {
                        assetdb.failed( 'Failed to refresh %s://', name );
                        done();
                        return;
                    }

                    reimportList = reimportList.concat(results);
                    done();
                });
            }, next );
        },

        // remove unsued import files
        function ( next ) {
            _removeUnusedImportFiles ( assetdb, function ( err ) {
                if ( err ) {
                    assetdb.failed( 'Failed to remove unused import files, message: %s', err.stack );
                }
                next();
            });
        },

        // remove unused mtime info
        function (next) {
            _removeUnusedMtimeInfo ( assetdb, function ( err ) {
                if ( err ) {
                    assetdb.failed( 'Failed to remove unused mtime info, message: %s', err.stack );
                }
                assetdb.updateMtime();
                next ();
            });
        },

    ], function ( err ) {
        if ( cb ) cb ( err, reimportList );
    });
};

// task refresh
Tasks.refresh = function ( assetdb, path, cb ) {
    var finalResults = [];

    var path2uuid = {};
    for (var key in assetdb._path2uuid) {
        path2uuid[key] = assetdb._path2uuid[key];
    }

    Async.waterfall([
        //
        function ( next ) {
            if ( !assetdb.fspathToUuid( path ) ) {
                next(null, []);
                return;
            }

            Tasks.clearImports( assetdb, path, path2uuid, next );
        },

        // check if the file is deleted, if that is true, delete its .meta file
        function ( results, next ) {
            results.forEach(function ( result ) {
                var metaPath = result.path + '.meta';

                if ( !Fs.existsSync(result.path) ) {
                    result.command = 'delete';
                    finalResults.push( result );
                    if ( Fs.existsSync(metaPath) ) {
                        Fs.unlinkSync( metaPath );
                    }
                }
            });
            next();
        },

        // init meta
        function ( next ) {
            _initMetas( assetdb, path, path2uuid, function ( err, results ) {
                results.forEach(function ( result  ) {
                    var assetpath = result.assetpath;
                    var mountType = assetdb.mountInfoByPath( assetpath ).type;

                    // if asset is meta mount type and is not added, then add it
                    if ( mountType === Static.MountType.asset ) {
                        assetdb._dbAdd( assetpath, result.meta.uuid );
                    }

                });
                next();
            });
        },

        // refresh
        function ( next ) {
            _refresh( assetdb, path, true, next );
        },
    ], function ( err, results ) {
        if (err) {
            if ( cb ) cb ( err );
            return;
        }

        results.forEach( function (result) {
            var oldUuid = path2uuid[result.path];
            var uuid = assetdb.fspathToUuid( result.path );

            if ( oldUuid ) {
                if ( oldUuid !== uuid ) {
                    result.command = 'uuid-change';
                    result.oldUuid = oldUuid;
                }
                else {
                    result.command = 'change';
                }
            }
            else {
                result.command = 'create';
            }
        });

        finalResults = finalResults.concat( results );
        if (cb) cb( null, finalResults );
    });
};

// task deep query
Tasks.deepQuery = function ( assetdb, cb ) {
    // var mountNames = Object.keys(assetdb._mounts);
    var results = [];
    var path2info = {};
    var paths = Object.keys(assetdb._path2uuid);

    // Sort paths to ensure parent path is before children paths
    paths.sort( function (a, b) {
        return a.length - b.length;
    });

    var i, path, uuid, isSubAsset, info, name, assetType;
    for (i = 0; i < paths.length; ++i) {
        path = paths[i];

        uuid = assetdb._path2uuid[path];
        isSubAsset = assetdb.isSubAssetByPath(path);
        if ( assetdb.isMountByPath(path) ) {
            name = assetdb.mountInfoByPath(path).name;
            assetType = 'mount';
        } else {
            name = Path.basenameNoExt(path);
            var metaObj = Meta.load( assetdb, path + '.meta' );
            assetType = metaObj.assetType();
        }
        info = {
            name: name,
            extname: Path.extname(path),
            uuid: uuid,
            type: assetType,
            isSubAsset: isSubAsset,
            children: [],
        };
        path2info[path] = info;

        var parentInfo = path2info[Path.dirname(path)];
        if ( !parentInfo ) {
            results.push(info);
        }
        else {
            parentInfo.children.push(info);
        }
    }

    if ( cb ) cb(null, results);
};

// task query assets
Tasks.queryAssets = function ( assetdb, fspathPattern, assetType, cb ) {
    var results = [];
    var paths = Object.keys(assetdb._path2uuid);
    var matchs = Minimatch.match(paths, fspathPattern);

    var i, path, uuid, isSubAsset, metaObj, type, info;
    for (i = 0; i < matchs.length; ++i) {
        path = matchs[i];

        uuid = assetdb._path2uuid[path];
        isSubAsset = assetdb.isSubAssetByPath(path);
        metaObj = assetdb.loadMetaByPath(path);
        if ( !metaObj ) {
            continue;
        }

        type = metaObj.assetType();
        if ( assetType && type !== assetType ) {
            continue;
        }

        info = {
            url: assetdb._url(path),
            path: path,
            uuid: uuid,
            type: type,
            isSubAsset: isSubAsset,
        };
        results.push(info);
    }

    if ( cb ) cb( null, results );
};

// task query metas
Tasks.queryMetas = function ( assetdb, fspathPattern, assetType, cb ) {
    var results = [];
    var paths = Object.keys(assetdb._path2uuid);
    var matchs = Minimatch.match(paths, fspathPattern);

    var i, path, meta, type;
    for (i = 0; i < matchs.length; ++i) {
        path = matchs[i];

        meta = Meta.load(assetdb, path + '.meta');
        type = meta.assetType();
        if ( assetType && type !== assetType )
            continue;

        results.push(meta);
    }

    if ( cb ) cb( null, results );
};

// task import
Tasks.import = function ( assetdb, rawfiles, destPath, cb ) {

    Async.waterfall([
        // ====================
        // pre-process
        // ====================
        function (next) {
            _preProcessImportFiles(assetdb, rawfiles, destPath, function (err, files) {
                rawfiles = files;
                next(err);
            });
        },

        // copy files to dest path
        function ( next ) {
            var copiedFiles = [];

            Async.each( rawfiles, function ( file, done ) {
                assetdb.log( 'copy file %s...', Path.basename(file));
                var copyPath = Path.join( destPath, Path.basename(file) );
                Fs.copy( file, copyPath, function ( err ) {
                    if ( err ) {
                        assetdb.failed( 'Failed to copy file %s. %s', file, err );
                        done ();
                        return;
                    }

                    copiedFiles.push(copyPath);
                    done ();
                });
            }, function ( err ) {
                next ( err, copiedFiles );
            });
        },

        // pre-cache uuid, get asset files
        function ( copiedFiles, next ) {
            var assetFiles = [];

            assetdb.log('init metas...');
            Async.each( copiedFiles, function ( file, done ) {
                _initMetas(assetdb, file, null, function ( err, results ) {
                    results.forEach(function ( result ) {
                        assetdb._dbAdd(result.assetpath,
                                       result.meta.uuid);

                        assetFiles.push(result.assetpath);
                    });
                    done();
                });
            }, function ( err ) {
                next ( err, assetFiles );
            });
        },

        // ====================
        // native file process
        // ====================

        // reimport assets
        function ( importFiles, next ) {
            assetdb.log( 'import assets...');

            var results = [];
            Async.each( importFiles, function ( path, done ) {
                _importAsset( assetdb, path, function ( err, meta ) {
                    if ( err ) {
                        assetdb.failed('Failed to import asset %s, message: %s',
                                       path,
                                       err.stack);
                        done();
                        return;
                    }

                    _fillInResults( assetdb, path, meta, results );

                    done();
                });
            }, function ( err ) {
                next ( err, results );
            });
        },

        // ====================
        // finalize
        // ====================

        function ( results, next ) {
            results.forEach(function ( result ) {
                // mtime update
                assetdb.updateMtime(result.uuid);
            });

            results.sort(function ( a, b ) {
                return a.path.localeCompare( b.path );
            });
            next ( null, results );
        },

    ], function ( err, results ) {
        if ( cb ) cb ( err, results );
    });
};

// task move
Tasks.assetMove = function (assetdb, srcPath, destPath, cb) {

    var isSrcFolder = Fs.isDirSync(srcPath);
    var isRename = Path.basename(srcPath) !== Path.basename(destPath);

    var srcs;
    var dests;
    var uuids;
    var oldSubMetasList;
    var newMetas = [];

    Async.series([
        // ====================
        // pre-process
        // ====================

        function (next) {
            _preProcessMoveInput(assetdb, srcPath, destPath, function (err, srcPaths, destPaths) {
                if (err) {
                    next (err);
                    return;
                }

                srcs = srcPaths;
                dests = destPaths;
                uuids = srcs.map( function (path) {
                    return assetdb.fspathToUuid(path);
                });
                oldSubMetasList = srcs.map( function (path) {
                    var oldMeta = assetdb.loadMetaByPath(path);
                    var oldSubMetas = oldMeta.copySubMetas();
                    return oldSubMetas;
                });

                next ();
            });
        },

        // ====================
        // native file process
        // ====================

        // if asset renamed, then delete imported asset
        function (next) {
            if ( isSrcFolder || !isRename ) {
                next();
                return;
            }
            _deleteImportedAssets(assetdb, uuids, next);
        },

        // copy files
        function (next) {
            _copyFiles(assetdb, srcPath, destPath, next);
        },

        // db update
        function (next) {
            for (var i = 0; i < srcs.length; i++) {
                assetdb._dbMove(srcs[i], dests[i]);

                // No need to reimport, but need to update db for sub metas manually
                if ( isSrcFolder || !isRename) {
                    let subAssets = assetdb.subAssetInfosByPath( srcs[i] ), 
                        srcRoot = srcs[i],
                        destRoot = dests[i];
                    for ( let i = 0; i < subAssets.length; ++i ) {
                        let oldPath = subAssets[i].path;
                        let newPath = oldPath.replace( srcRoot, destRoot );
                        assetdb._dbMove( oldPath, newPath );
                    }
                }
            }
            next();
        },

        // if asset renamed, then reimport the asset
        function (next) {
            if ( isSrcFolder || !isRename) {
                next();
                return;
            }
            Async.each(dests, ( dest, nextDestCb ) => {
                _importAsset(assetdb, destPath, function (err, meta) {
                    newMetas.push(meta);
                    nextDestCb();
                });
            }, 
            err => {
                next();
            });
        },

        // ====================
        // finalize
        // ====================

        function (next) {
            // mtime update
            uuids.forEach( function (uuid) {
                assetdb.updateMtime(uuid);
            });

            next ();
        },
    ], function (err) {
        if ( !cb ) return;

        if ( err ) {
            cb ( err );
            return;
        }

        // For file target, results include the file itself and informations
        // For folder target, results include the folder and all files in it
        // Note: sub assets are not included in the results, because they are not moved
        var results = [];
        for ( var i = 0; i < dests.length; ++i ) {
            var destParent = Path.dirname(dests[i]);

            var diff = null;
            if (newMetas[i]) {
                diff = _generateSubMetaDiff(assetdb, newMetas[i], oldSubMetasList[i]);
            }

            results.push({
                srcMountType: Static.MountType.asset,
                destMountType: Static.MountType.asset,
                uuid: uuids[i],
                parentUuid: assetdb.fspathToUuid(destParent),
                srcPath: srcs[i],
                destPath: dests[i],
                subMetas: diff,
            });
        }
        cb ( null, results );
    });
};

Tasks.delete = function ( assetdb, path, cb ) {

    if ( !Fs.existsSync(path) ) {
        if (cb) cb ( new Error('Asset ' + path + ' is not exists') );
        return;
    }

    var deletedInfos;

    Async.series([
        // ====================
        // native file process
        // ====================

        // clear imports
        function (next) {
            Tasks.clearImports( assetdb, path, null, function (err, results) {
                deletedInfos = results;
                next();
            });
        },

        // remove asset meta
        function (next) {
            Del([path, path + '.meta'], {force: true}, next);
        }
    ], function (err) {
        if ( err ) {
            if ( cb ) cb ( err );
            return;
        }

        var results = [];
        for ( var i = 0; i < deletedInfos.length; ++i ) {
            var info = deletedInfos[i];
            results.push({
                path: info.path,
                uuid: info.uuid,
            });
        }
        if ( cb ) cb ( null, results );
    });
};


Tasks.create = function (assetdb, path, data, cb) {
    let uniPath = path;
    let alias = 0;
    while ( Fs.existsSync(uniPath) ) {
      alias += 1;

      uniPath = Path.join(
          Path.dirname(path),
          Path.basenameNoExt(path) + ' - ' + assetdb.padLeft(alias,3,'0') + Path.extname(path)
      );
    }
    path = uniPath;

    // if ( Fs.existsSync(path) ) {
    //     if (cb) cb ( new Error('Asset ' + path + ' is already exists') );
    //     return;
    // }

    var dirname = Path.dirname( path );
    if ( !Fs.existsSync(dirname) ) {
        if (cb) cb(new Error('Parent path ' + dirname + ' is not exists'));
        return;
    }

    var metaPath = path + '.meta';
    var meta = Meta.create( assetdb, metaPath );

    if ( !meta ) {
        if ( cb ) cb ( new Error('Can not create meta from ' + path) );
        return;
    }

    if ( !meta.export ) {
        if ( cb ) cb ( new Error('asset-type [' + meta.assetType() + '] not implement meta.export' ) );
        return;
    }

    assetdb.log( 'do meta.export %s...', path);
    Async.waterfall([
        // export asset
        function (next) {
            meta.export(path, data, next);
        },
        // import asset
        function (next) {
            _importAsset( assetdb, path, next );
        },
        // _dbAdd and update mtime
        function (meta, next) {
            assetdb._dbAdd(path, meta.uuid);
            assetdb.updateMtime(meta.uuid);

            next(null, meta);
        },
    ], function (err, meta) {
        if ( err ) {
            if (cb) cb(err);
            return;
        }
        var results = [];
        _fillInResults( assetdb, path, meta, results );

        if (cb) cb(err, results);
    });
};


Tasks.save = function (assetdb, fspath, data, cb) {

    if ( !assetdb.existsByPath(fspath) ) {
        if (cb) cb ( new Error(fspath + ' is not exists') );
        return;
    }

    // Copy old sub metas
    var oldMeta = assetdb.loadMetaByPath(fspath);
    var oldSubMetas = oldMeta.copySubMetas();

    var uuid = assetdb.fspathToUuid( fspath );

    Async.waterfall([
        // save asset
        function (next) {
            Fs.writeFile(fspath, data, next);
        },
        // reimport asset
        function (next) {
            _deleteImportedAssetsForUuid(assetdb, uuid, function (err) {
                if ( err ) {
                    assetdb.failed('Failed to delete imported assets of %s during save, message: %s', uuid, err.stack);
                }
                next();
            });
        },
        function (next) {
            _importAsset(assetdb, fspath, next);
        },
        // update mtime
        function ( meta, next ) {
            assetdb.updateMtime(uuid);
            next(null, meta);
        }
    ], function ( err, meta ) {
        if ( err ) {
            if (cb) cb(err);
            return;
        }

        if ( cb ) {
            var diff = _generateSubMetaDiff(assetdb, meta, oldSubMetas);
            cb(err, {
                meta: meta,
                subMetas: diff
            });
        }
    });
};

Tasks.saveMeta = function (assetdb, uuid, jsonString, cb) {
    var metaJson;
    try {
        metaJson = JSON.parse(jsonString);
    } catch ( err ) {
        if (err && cb) cb (new Error('Failed to pase json string, message : ' + err.message) );
        return;
    }

    if (uuid !== metaJson.uuid) {
        if (cb) cb( new Error('Uuid is not equal to json uuid') );
        return;
    }

    var fspath = assetdb.uuidToFspath(uuid);
    var metapath = fspath + '.meta';

    var meta = assetdb.loadMetaByPath( fspath );
    if (!meta) {
        if (cb) cb (new Error('Can\'t load meta for : ' + uuid) );
        return;
    }

    // Copy old sub metas
    var oldSubMetas = meta.copySubMetas();

    meta.deserialize(metaJson);

    // For saving sub meta, 
    // we need to merge sub meta data to parent meta and save the parent meta
    // Only support one level sub meta
    if ( assetdb.isSubAssetByPath(fspath) ) {
        let key = Path.basename(fspath);
        // Replace fspath
        fspath = Path.dirname(fspath);
        // Replace metapath
        metapath = fspath + '.meta';
        // Replace uuid
        let parentMeta = assetdb.loadMetaByPath(fspath);
        uuid = parentMeta.uuid;
        // Replace old sub metas
        oldSubMetas = parentMeta.copySubMetas();
        // Replace meta
        let subMetas = parentMeta.getSubMetas();
        subMetas[key] = meta;
        meta = parentMeta;
    }

    Meta.save( assetdb, metapath, meta );

    Async.waterfall([
        function (next) {
            _deleteImportedAssetsForUuid(assetdb, uuid, function (err) {
                if ( err ) {
                    assetdb.failed('Failed to delete imported assets of %s during saveMeta, message: %s', uuid, err.stack);
                }
                next();
            });
        },
        function (next) {
            _importAsset(assetdb, fspath, next);
        },
        // db update
        function ( meta, next ) {
            // Import won't be able to know the diff and update the db,
            // because the change of meta have been saved before reimport,
            // so we need to manually update db in saveMeta,
            // this is a rare case where db update of sub meta should be occupied manually,
            // in other place we should avoid such manipulation and let _importAsset do the work.
            var diff = _generateSubMetaDiff(assetdb, meta, oldSubMetas);
            for (let i = 0; i < diff.added.length; ++i) {
                let added = diff.added[i];
                if ( !assetdb.existsByUuid(added.uuid) ) {
                    assetdb._dbAdd( added.path, added.uuid );
                    assetdb.updateMtime(added.uuid);
                }
            }
            for (let i = 0; i < diff.deleted.length; ++i) {
                let deleted = diff.deleted[i];
                if ( assetdb.existsByUuid(deleted.uuid) ) {
                    assetdb._dbDelete( deleted.path );
                }
            }
            assetdb.updateMtime(uuid);
            next( null, {
                meta: meta,
                subMetas: diff
            });
        }
    ], function (err, result) {
        if ( err ) {
            if (cb) cb(err);
            return;
        }

        if ( cb ) {
            cb(err, result);
        }
    });
};


Tasks.clearImports = function ( assetdb, fspath, path2uuid, cb ) {
    if ( !assetdb.fspathToUuid( fspath ) ) {
        if (cb) cb( new Error('path-2-uuid does not contian : ' + fspath) );
        return;
    }

    assetdb.log('clear imports %s', fspath);

    var paths = [];

    for (var path in assetdb._path2uuid) {
        if ( Path.contains(fspath, path) ) {
            paths.push( path );
        }
    }

    var results = [];

    Async.eachSeries( paths, function (path, done) {
        var uuid = assetdb.fspathToUuid( path );

        results.push({
            uuid: uuid,
            url: assetdb._url( path ),
            path: path,
            type: Meta.findCtor(assetdb, path).defaultType()
        });

        Async.series([
            function (next) {
                var metaPath = path + '.meta';
                var meta;
                var existsMeta = Fs.existsSync(metaPath);

                if ( existsMeta ) {
                    meta = Meta.load( assetdb, metaPath );
                }
                else {
                    var ctor = Meta.findCtor( assetdb, path );
                    meta = new ctor( assetdb );
                }

                if ( meta && meta.delete ) {

                    if ( !existsMeta ) {
                        assetdb.warn('Try to delete imported files from an un-exists path : %s. This is not 100% work, please check them manually.', metaPath);
                    }

                    meta.uuid = (path2uuid && path2uuid[path]) || uuid;

                    assetdb.log( 'do meta.delete %s...', metaPath);
                    meta.delete( path, next );
                    return;
                }

                next();
            },
            function (next) {
                _deleteImportedAssetsForUuid( assetdb, uuid, function (err) {
                    if ( err ) {
                        assetdb.failed('Failed to delete imported assets of %s during clearImports, message: %s', uuid, err.stack);
                    }
                    next();
                });
            }, 
            function (next) {
                assetdb._dbDelete( path );
                assetdb.updateMtime( uuid );

                next();
            }
        ], function (err) {
            done(err);
        });
    }, function (err) {
        if (cb) cb(err, results);
    });
};


Tasks.rawMove = function ( assetdb, srcPath, destPath, cb ) {
    // var isSrcFolder = Fs.isDirSync(srcPath);
    // var isRename = Path.basename(srcPath) !== Path.basename(destPath);
    // var tasks = [];

    var srcs;
    var dests;

    Async.waterfall([
        // ====================
        // pre-process
        // ====================

        function (next) {
            _preProcessMoveInput(assetdb, srcPath, destPath, function (err, srcPaths, destPaths) {
                if (err) {
                    next (err);
                    return;
                }

                srcs = srcPaths;
                dests = destPaths;

                next ();
            });
        },

        // ====================
        // native file process
        // ====================

        // copy files
        function (next) {
            _copyFiles(assetdb, srcPath, destPath, next);
        },
    ], function (err) {
        if ( err ) {
            if (cb) cb ( err );
            return;
        }

        //
        var results = [];
        for ( var i = 0; i < dests.length; ++i ) {
            results.push({
                srcPath: srcs[i],
                destPath: dests[i],
                srcMountType: Static.MountType.raw,
                destMountType: Static.MountType.raw,
            });
        }
        if ( cb ) cb ( null, results );
    });
};

Tasks.rawDelete = function ( assetdb, path, cb ) {
    if ( !Fs.existsSync(path) ) {
        if (cb) cb ( new Error('Asset ' + path + ' is not exists') );
        return;
    }

    var results = [];

    Async.series([

        // parse paths which will be delete
        function (next) {
            _scan(assetdb, path, null, function (err, paths) {
                if (err) {
                    next (err);
                    return;
                }

                results = paths.map( function (path) {
                    return {path: path};
                });

                next();
            });
        },

        // remove asset
        function (next) {
            Del(path, {force: true}, next);
        },

    ], function (err) {
        if (cb) cb (err, results);
    });
};

Tasks.rawImport = function ( assetdb, rawfiles, destPath, cb ) {

    var results = [];

    Async.waterfall([
        function (next) {
            _preProcessImportFiles(assetdb, rawfiles, destPath, function (err, files) {
                rawfiles = files;
                next (err);
            });
        },

        // copy files to dest path
        function ( next ) {
            var copiedFiles = [];

            Async.eachSeries( rawfiles, function ( file, done ) {
                assetdb.log( 'copy file %s...', Path.basename(file));
                var copyPath = Path.join( destPath, Path.basename(file) );
                Fs.copy( file, copyPath, function ( err ) {
                    if ( err ) {
                        assetdb.failed( 'Failed to copy file %s. %s', file, err );
                        done ();
                        return;
                    }

                    copiedFiles.push(copyPath);
                    done ();
                });
            }, function ( err ) {
                next ( err, copiedFiles );
            });
        },
        function (copiedFiles, next) {
            var opts = {
                'remove-unused-meta': false,
                'filter-meta' : false
            };

            Async.eachSeries(copiedFiles, function (path, done) {

                _scan( assetdb, path, opts, function (err, paths) {
                    if (err) {
                        next (err);
                        return;
                    }

                    paths = paths.map( function (path) {
                        return {path: path};
                    });

                    results = results.concat( paths );
                    done();
                });
            }, function (err) {
                next(err, results);
            });
        }
    ], function ( err ) {
        if (cb) cb (err, results);
    });
};

/**
 * copy meta file from srcPath to destPath
 * @param {object} assetdb - asset database
 * @param {string} srcPath - src meta file path
 * @param {string} destPath - dest meta file path
 * @param {boolean} copyMetaFiles
 *                  true : if asset has .meta file, then copy it to dest path
 *                  false: if asset is a folder and has .meta files as subitems, then will delete these .meta files
 */
Tasks.copy = function (assetdb, srcPath, destPath, copyMetaFiles, cb) {
    Async.series([
        // copy file
        function (next) {
            Fs.copy(srcPath, destPath, next);
        },
        // copy meta file
        function (next) {
            if (!copyMetaFiles) {
                next();
                return;
            }

            var srcMetaPath = srcPath + '.meta';
            var destMetaPath = destPath + '.meta';
            if ( Fs.existsSync(srcMetaPath) ) {
                Fs.copy(srcMetaPath, destMetaPath, next);
            }
        },
        // if src is folder, then need to remove .meta files in dest folder
        function (next) {
            if ( !Fs.isDirSync(destPath) || copyMetaFiles ) {
                next();
                return;
            }

            var pattern = [Path.join(destPath, '**/*.meta')];
            Globby(pattern, function (err, paths) {

                paths = paths.map(function (path) {
                    return Path.resolve(path);
                });

                Async.each(paths, function (path, done) {
                    Del(path, {force: true}, done);
                }, function (err) {
                    next(err);
                });
            });
        }
    ], function (err) {
        if (cb) cb(err);
    });
};

Tasks.move = function (assetdb, srcFspath, destFspath, cb) {
    var srcMountType = assetdb.mountInfoByPath(srcFspath).type;
    var destMountType = assetdb.mountInfoByPath(destFspath).type;

    var srcs;
    var dests;
    var uuids;

    Async.waterfall([
        function (next) {
            Tasks._checkMoveInput(assetdb, srcFspath, destFspath, next);
        },
        function (next) {
            if (srcMountType === Static.MountType.asset && destMountType === Static.MountType.asset) {
                Tasks.assetMove(assetdb, srcFspath, destFspath, next);
            }
            else if (srcMountType === Static.MountType.raw && destMountType === Static.MountType.raw) {
                Tasks.rawMove(assetdb, srcFspath, destFspath, next);
            }
            else if (srcMountType === Static.MountType.asset && destMountType === Static.MountType.raw) {

                Async.series([
                    function (next) {
                        _preProcessMoveInput(assetdb, srcFspath, destFspath, function (err, srcPaths, destPaths) {
                            if (err) {
                                next (err);
                                return;
                            }

                            srcs = srcPaths;
                            dests = destPaths;
                            uuids = srcs.map( function (path) {
                                return assetdb.fspathToUuid(path);
                            });

                            next ();
                        });
                    },
                    function (next) {
                        Tasks.copy(assetdb, srcFspath, destFspath, false, next);
                    },
                    function (next) {
                        Tasks.delete(assetdb, srcFspath, next);
                    }
                ], function (err) {
                    if ( err ) {
                        next ( err );
                        return;
                    }

                    //
                    var results = [];
                    for ( var i = 0; i < dests.length; ++i ) {
                        // var destParent = Path.dirname(dests[i]);
                        // var mountID = assetdb._mountIDByPath(destParent);

                        results.push({
                            srcMountType: Static.MountType.asset,
                            destMountType: Static.MountType.raw,
                            uuid: uuids[i],
                            srcPath: srcs[i],
                            destPath: dests[i],
                        });
                    }
                    next ( null, results );
                });
            }
            else if (srcMountType === Static.MountType.raw && destMountType === Static.MountType.asset) {
                Async.series([
                    function (next) {
                        _preProcessMoveInput(assetdb, srcFspath, destFspath, function (err, srcPaths, destPaths) {
                            if (err) {
                                next (err);
                                return;
                            }

                            srcs = srcPaths;
                            dests = destPaths;

                            next ();
                        });
                    },
                    function (next) {
                        Tasks.copy(assetdb, srcFspath, destFspath, false, next);
                    },
                    function (next) {
                        Tasks.refresh(assetdb, destFspath, next);
                    },
                    function (next) {
                        Tasks.rawDelete(assetdb, srcFspath, next);
                    }
                ], function (err) {
                    if ( err ) {
                        next ( err );
                        return;
                    }

                    //
                    var results = [];
                    for ( var i = 0; i < dests.length; ++i ) {
                        var destParent = Path.dirname(dests[i]);

                        results.push({
                            srcMountType: Static.MountType.raw,
                            destMountType: Static.MountType.asset,
                            uuid: assetdb.fspathToUuid( dests[i] ),
                            parentUuid: assetdb.fspathToUuid(destParent),
                            srcPath: srcs[i],
                            destPath: dests[i],
                        });
                    }
                    next ( null, results );
                });
            }
            else {
                next ( new Error('Wrong mountType : ' + srcMountType + ' - ' + destMountType) );
            }
        }
    ], function (err, results) {
        if (cb) cb(err, results);
    });
};

// for unit-test
Tasks._scan = _scan;
Tasks._checkIfReimport = _checkIfReimport;
Tasks._initMetas = _initMetas;
Tasks._refresh = _refresh;
Tasks._importAsset = _importAsset;
Tasks._checkMoveInput = _checkMoveInput;
