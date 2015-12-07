'use strict';

var Async = require('async');
var Path = require('fire-path');
var Fs = require('fire-fs');
var FireWatch = require('fire-watch');

var Tasks = require('../lib/tasks.js');

var WATCH_STATE_STARTING = 'watch-starting';
var WATCH_STATE_ON = 'watch-on';
var WATCH_STATE_STOPPING = 'watch-stopping';
var WATCH_STATE_OFF = 'watch-off';


//
function _syncChanges ( assetdb, changes, cb ) {
    var finalResults = [];

    function doMeta ( info, done ) {
        var rawfile = Path.join(Path.dirname(info.path), Path.basenameNoExt(info.path) );

        if ( info.command === 'delete' ) {
            Fs.exists(rawfile, function ( exists ) {
                if ( !exists ) {
                    done();
                    return;
                }

                // try to recreate meta by exists uuid
                Tasks.refresh ( assetdb, rawfile, function ( err, results ) {
                    if ( err ) {
                        assetdb.error('Failed to restore meta %s, %s', info.path, err.stack);
                        done();
                        return;
                    }

                    assetdb._handleRefreshResults(results);
                    done();
                });
            }.bind(assetdb));
            return;
        }

        if ( info.command === 'new' ) {
            Fs.exists(rawfile, function ( exists ) {
                if ( exists ) {
                    done();
                    return;
                }

                Fs.unlink(info.path, function () {
                    assetdb.warn('Delete unused meta file: %s', assetdb._url(info.path));
                    done();
                });
            }.bind(assetdb));
            return;
        }

        if ( info.command === 'change' ) {
            // try to recreate meta by exists uuid
            Tasks.refresh ( assetdb, rawfile, function ( err, results ) {
                if ( err ) {
                    assetdb.error('Failed to reimport asset %s, %s', rawfile, err.stack);
                    done();
                    return;
                }

                assetdb._handleRefreshResults(results);
                done();
            });

            return;
        }

        done();
    }
    function doDelete ( path, done ) {
        // delete meta if exists
        var metapath = path + '.meta';
        if ( Fs.existsSync(metapath) ) {
            Fs.unlinkSync(metapath);
            assetdb.warn('Delete unused meta file: %s', assetdb._url(metapath));
        }

        //
        Tasks.clearImports( assetdb, path, null, function ( err, results ) {
            if ( err ) {
                assetdb.error('Failed to delete asset %s', path);
                done();
                return;
            }

            Editor.sendToAll( 'asset-db:assets-deleted', results );
            done();
        });
    }
    function doImport ( path, done ) {
        // import asset
        Tasks.refresh ( assetdb, path, function ( err, results ) {
            if ( err ) {
                assetdb.error('Failed to import asset %s, %s', path, err.stack);
                done();
                return;
            }

            assetdb._handleRefreshResults(results);
            done();
        });
    }
    function doChange ( path, done ) {
        // update asset
        Tasks.refresh ( assetdb, path, function ( err, results ) {
            if ( err ) {
                assetdb.error('Failed to update asset %s, %s', path, err.stack);
                done();
                return;
            }

            assetdb._handleRefreshResults(results);
            done();
        });
    }

    var metaList = [], deleteList = [], newList = [], changeList = [];
    for ( var i = 0; i < changes.length; ++i ) {
        var change = changes[i];
        if ( Path.extname(change.path) === '.meta' ) {
            metaList.push(change);
            continue;
        }

        if ( change.command === 'delete' ) {
            deleteList.push(change.path);
            continue;
        }

        if ( change.command === 'new' ) {
            newList.push(change.path);
            continue;
        }

        if ( change.command === 'change' ) {
            changeList.push(change.path);
            continue;
        }

        Editor.warn('Unknown changes %s, %s', change.command, change.path );
    }

    Async.series([
        function ( next ) { Async.eachSeries ( metaList, doMeta, next ); },
        function ( next ) { Async.eachSeries ( deleteList, doDelete, next ); },
        function ( next ) { Async.eachSeries ( newList, doImport, next ); },
        function ( next ) { Async.eachSeries ( changeList, doChange, next ); },
    ], function ( err ) {
        if ( cb ) cb ( err, finalResults );
    } );
}

//
function _taskWatchON ( assetdb, cb ) {
    if ( assetdb._watcher ) {
        if ( cb ) cb ( new Error('Failed to watch asset-db, already watched.') );
        return;
    }

    assetdb._watcher = FireWatch.start( assetdb._fspath('assets://'), cb );
    assetdb._watcher.on('changed', function ( changes ) {
        if ( changes.length === 0 ) {
            return;
        }
        assetdb.syncChanges(changes);
    }.bind(assetdb) );
}

//
function _taskWatchOFF ( assetdb, cb ) {
    if ( !assetdb._watcher ) {
        if ( cb ) cb ( new Error('Failed to stop watching asset-db, Already stopped.') );
        return;
    }

    assetdb._watcher.stop(function () {
        assetdb._watcher = null;
        if ( cb ) cb ();
    }.bind(assetdb) );
}

module.exports = {
    /**
     *
     */
    watchON: function () {
        this._expectWatchON = true;

        if ( this._watchState === WATCH_STATE_STARTING ||
             this._watchState === WATCH_STATE_STOPPING ||
             this._watchState === WATCH_STATE_ON
           )
        {
            return;
        }

        this._watchState = WATCH_STATE_STARTING;
        Editor.sendToMainWindow( 'asset-db:watch-state-changed', this._watchState );

        this._tasks.push({
            name: 'watch-on',
            run: _taskWatchON,
            params: [],
            silent: true,
        }, function ( err ) {
            /* jshint unused:vars */
            this._watchState = WATCH_STATE_ON;
            Editor.sendToMainWindow( 'asset-db:watch-state-changed', this._watchState );

            if ( this._expectWatchON === false ) {
                this.watchOFF();
            }
        }.bind(this) );
    },

    /**
     *
     */
    watchOFF: function () {
        this._expectWatchON = false;

        if ( this._watchState === WATCH_STATE_STARTING ||
             this._watchState === WATCH_STATE_STOPPING ||
             this._watchState === WATCH_STATE_OFF
           )
        {
            return;
        }

        this._watchState = WATCH_STATE_STOPPING;
        Editor.sendToMainWindow( 'asset-db:watch-state-changed', this._watchState );

        this._tasks.push({
            name: 'watch-off',
            run: _taskWatchOFF,
            params: [],
            silent: true,
        }, function ( err ) {
            /* jshint unused:vars */
            this._watchState = WATCH_STATE_OFF;
            Editor.sendToMainWindow( 'asset-db:watch-state-changed', this._watchState );

            if ( this._expectWatchON ) {
                this.watchON();
            }
        }.bind(this) );
    },

    /**
     *
     */
    syncChanges: function ( changes ) {
        this._tasks.push({
            name: 'sync-changes',
            run: _syncChanges,
            params: [changes],
        }, function ( err, results ) {
            /* jshint unused:vars */
            // TODO
        } );
    },
};
