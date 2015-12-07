'use strict';

var Ipc = require('ipc');
var Shell = require('shell');
var Async = require('async');
var Path = require('fire-path');
var Fs = require('fire-fs');

// asset-db:explore
Ipc.on ( 'asset-db:explore', function ( url ) {
    var fspath = Editor.assetdb._fspath(url);
    Shell.showItemInFolder(fspath);
});

// TODO:
// asset-db:explore-lib
// Ipc.on ( 'asset-db:explore-lib', function ( url ) {
//     var uuid = Editor.assetdb.urlToUuid(url);
//     var path = Editor.assetdb._uuidToImportPathNoExt(uuid);
//     // Shell.showItemInFolder(fspath);
// });

// asset-db:query-path-by-url
Ipc.on ( 'asset-db:query-path-by-url', function ( reply, url ) {
    reply( Editor.assetdb._fspath( url ) );
});

// asset-db:query-uuid-by-url
Ipc.on ( 'asset-db:query-uuid-by-url', function ( reply, url ) {
    reply( Editor.assetdb.urlToUuid( url ) );
});

// asset-db:query-path-by-uuid
Ipc.on ( 'asset-db:query-path-by-uuid', function ( reply, uuid ) {
    reply( Editor.assetdb.uuidToFspath( uuid ) );
});

// asset-db:query-url-by-uuid
Ipc.on ( 'asset-db:query-url-by-uuid', function ( reply, uuid ) {
    reply( Editor.assetdb.uuidToUrl( uuid ) );
});

// asset-db:query-url-by-uuid
Ipc.on ( 'asset-db:query-info-by-uuid', function ( reply, uuid ) {
    reply( Editor.assetdb.assetInfoByUuid(uuid) );
});

// asset-db:query-meta-info-by-uuid
Ipc.on ( 'asset-db:query-meta-info-by-uuid', function ( reply, uuid ) {
    var fspath = Editor.assetdb.uuidToFspath(uuid);
    if ( fspath ) {
        var Meta = require('../lib/meta');

        var metaPath = fspath + '.meta';
        var meta = Meta.load( Editor.assetdb, metaPath );
        var metaJson = JSON.stringify(meta, null, 2);
        var mtimeInfo = Editor.assetdb._uuid2mtime[uuid];
        var isSubMeta = Editor.assetdb.isSubAssetByPath(fspath);

        reply({
            assetType: meta.assetType(),
            defaultType: meta.constructor.defaultType(),
            assetPath: fspath,
            metaPath: metaPath,
            metaMtime: mtimeInfo ? mtimeInfo.metam : 0,
            assetMtime: mtimeInfo ? mtimeInfo.asset : 0,
            isSubMeta: isSubMeta,
            json: metaJson,
        });
        return;
    }

    reply(null);
});

// asset-db:deep-query
Ipc.on ( 'asset-db:deep-query', function ( reply ) {
    Editor.assetdb.deepQuery( function ( err, results ) {
        reply (results);
    });
});

// asset-db:query-assets
Ipc.on ( 'asset-db:query-assets', function ( reply, url, assetType ) {
    Editor.assetdb.queryAssets( url, assetType, function ( err, results ) {
        reply (results);
    });
});

// asset-db:import-asset
Ipc.on ( 'asset-db:import-assets', function ( rawfiles, url ) {
    Editor.assetdb.watchOFF();
    Editor.assetdb.import( rawfiles, url, function ( err, results ) {
        if ( err ) {
            Editor.assetdb.error('Failed to import assets to %s, messages: %s',
                                 url, err.stack);
            return;
        }

        //
        Editor.sendToAll( 'asset-db:assets-created', results );
    });
    if ( !Editor.focused ) {
        Editor.assetdb.watchON();
    }
});

// asset-db:create-asset
Ipc.on ( 'asset-db:create-asset', function ( url, data ) {
    Editor.assetdb.watchOFF();
    Editor.assetdb.create( url, data, function ( err, results ) {
        if ( err ) {
            Editor.assetdb.error('Failed to create asset %s, messages: %s',
                                 url, err.stack);
            return;
        }

        //
        Editor.sendToAll( 'asset-db:assets-created', results );
    });
    if ( !Editor.focused ) {
        Editor.assetdb.watchON();
    }
});

// asset-db:move-asset
Ipc.on ( 'asset-db:move-asset', function ( srcUrl, destUrl ) {
    Editor.assetdb.watchOFF();
    Editor.assetdb.move( srcUrl, destUrl, function ( err, results ) {
        if ( err ) {
            Editor.assetdb.error('Failed to move asset from %s to %s, messages: %s',
                                 srcUrl, destUrl, err.stack);
            return;
        }

        var deletedSubAssets = [];
        var addedSubAssets = [];
        for ( var i = 0; i < results.length; ++i ) {
            var diff = results[i].subMetas;
            if ( !diff ) continue;
            Array.prototype.push.apply(deletedSubAssets, diff.deleted);
            Array.prototype.push.apply(addedSubAssets, diff.added);
            delete results[i].diff;
        }

        Editor.sendToAll( 'asset-db:assets-moved', results );

        if ( deletedSubAssets.length > 0 )
            Editor.sendToAll( 'asset-db:assets-deleted', deletedSubAssets );
        if ( addedSubAssets.length > 0 )
            Editor.sendToAll( 'asset-db:assets-created', addedSubAssets );
    });
    if ( !Editor.focused ) {
        Editor.assetdb.watchON();
    }
});

// asset-db:delete-assets
Ipc.on ( 'asset-db:delete-assets', function ( urls ) {
    var finalResults = [];
    var topLevelUrls = Editor.assetdb.arrayCmpFilter( urls, function ( a, b ) {
        if ( Path.contains( a, b ) ) return 1;
        if ( Path.contains( b, a ) ) return -1;
        return 0;
    });

    Editor.assetdb.watchOFF();
    Async.each( topLevelUrls, function ( url, done ) {
        Editor.assetdb.delete( url, function ( err, results ) {
            if ( err ) {
                Editor.assetdb.error('Failed to delete asset %s, messages: %s',
                                     url, err.stack);
                done();
                return;
            }

            finalResults = finalResults.concat(results);
            done();
        });
    }, function ( err ) {
        /* jshint unused:vars */
        Editor.sendToAll( 'asset-db:assets-deleted', finalResults );
    });
    if ( !Editor.focused ) {
        Editor.assetdb.watchON();
    }
});

// asset-db:save
Ipc.on ( 'asset-db:save', function ( url, data ) {
    Editor.assetdb.watchOFF();

    Editor.assetdb.save( url, data, function ( err, result ) {
        if ( err ) {
            Editor.assetdb.error('Failed to save asset %s', url, err.stack);
            return;
        }

        var meta = result.meta;
        var diff = result.subMetas;

        Editor.sendToAll( 'asset-db:asset-changed', {
            uuid: meta.uuid,
            type: meta.assetType(),
        });

        if ( diff.deleted.length > 0 )
            Editor.sendToAll( 'asset-db:assets-deleted', diff.deleted );
        if ( diff.added.length > 0 )
            Editor.sendToAll( 'asset-db:assets-created', diff.added );
    });
    if ( !Editor.focused ) {
        Editor.assetdb.watchON();
    }
});

// asset-db:save-meta
Ipc.on ( 'asset-db:save-meta', function ( uuid, jsonString ) {
    Editor.assetdb.watchOFF();
    Editor.assetdb.saveMeta( uuid, jsonString, function ( err, result ) {
        if ( err ) {
            Editor.assetdb.error('Failed to save meta %s', err.stack);
            return;
        }

        var meta = result.meta;
        var diff = result.subMetas;

        Editor.sendToAll('asset-db:asset-changed', {
            uuid: uuid,
            type: meta.assetType(),
        });

        if ( diff.deleted.length > 0 )
            Editor.sendToAll( 'asset-db:assets-deleted', diff.deleted );
        if ( diff.added.length > 0 )
            Editor.sendToAll( 'asset-db:assets-created', diff.added );
    });
    if ( !Editor.focused ) {
        Editor.assetdb.watchON();
    }
});
