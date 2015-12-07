'use strict';

(function () {
    var ED = global.Editor;
    if ( ED ) {
        var Meta = require('./lib/meta');

        if ( !ED.metas ) ED.metas = {};
        ED.metas.asset = Meta.AssetMeta;
        ED.metas.folder = Meta.FolderMeta;

        if ( ED.isPageLevel ) {
            require('./page/asset-db');
            return;
        }

        if ( ED.isCoreLevel ) {
            ED.versions['asset-db'] = require('./package.json').version;
            require('./core/ipc');
            require('./core/protocol');
        }
    }

    // register editor versions
    var EventEmitter = require('events');

    var Fs = require('fire-fs');
    var Path = require('fire-path');
    var Async = require('async');

    function _shortString ( str, cnt ) {
        if (typeof str !== 'string') {
            return typeof str;
        }

        if ( cnt <= 3 || str.length <= cnt )
            return str;

        var part = Math.floor(cnt/2);
        if ( str.length > cnt && str.length < cnt + 3 ) {
            return str.substr( 0, part ) + '...' + str.substr( str.length - part + (str.length - cnt + 3) );
        }
        return str.substr( 0, part ) + '...' + str.substr( str.length - part );
    }

    /**
     * constructor
     */
    function AssetDB ( opts ) {
        opts = opts || {};

        this.cwd = opts.cwd || process.cwd();

        var library = opts.library || 'library';
        this.library = Path.resolve(this.cwd, library);

        // create library directory if not exists
        Fs.ensureDirSync(this.library);

        // init db tables
        this._mounts = {};
        this._uuid2mtime = {};
        this._uuid2path = {};
        this._path2uuid = {};

        // init meta info
        this._extname2infos = {};

        // init imports folder
        this._importPath = Path.join( this.library, 'imports' );
        Fs.ensureDirSync(this._importPath);

        // load uuid-to-mtime table
        this._uuid2mtimePath = Path.join( this.library, 'uuid-to-mtime.json' );
        try {
            this._uuid2mtime = JSON.parse(Fs.readFileSync(this._uuid2mtimePath));
        }
        catch ( err ) {
            if ( err.code !== 'ENOENT' ) {
                AssetDB.error('Init failed, %s' + err.message);
                return;
            }
        }

        // task runner
        this._genTaskID = -1;
        this._curTask = null;
        this._tasks = Async.queue(function (task, callback) {
            var taskNameWithParams = task.name + ' ';
            for ( var i = 0; i < task.params.length; ++i ) {
                taskNameWithParams += _shortString(task.params[i], 20);
                if ( i !== task.params.length-1 ) {
                    taskNameWithParams += ', ';
                }
            }

            // push finish callback
            var done = function ( err ) {
                if ( !this._curTask.silent ) {
                    if ( err ) {
                        this.failed('failed!');
                    }
                    else {
                        this.success('done!');
                    }
                }
                this._curTask = null;

                try {
                    callback.apply( null, arguments );
                } catch ( err2 ) {
                    this.failed('Exception ', err2.stack);
                }

                if ( ED && ED.mainWindow && this._tasks.idle() ) {
                    ED.sendToMainWindow('asset-db:state-changed', 'idle');
                }
            }.bind(this);
            task.params.unshift(this);
            task.params.push(done);
            task.id = ++this._genTaskID % 100;

            // run the task
            try {
                if ( ED && ED.mainWindow ) {
                    ED.sendToMainWindow('asset-db:state-changed', 'busy');
                }
                if ( !task.silent ) {
                    this.log('[db-task][%s] running...', taskNameWithParams);
                }
                this._curTask = task;
                task.run.apply( this, task.params );
            } catch ( err ) {
                this.failed('Exception ', err.stack);
                this._curTask = null;
                callback(err);

                if ( ED && ED.mainWindow && this._tasks.idle() ) {
                    ED.sendToMainWindow('asset-db:state-changed', 'idle');
                }
            }
        }.bind(this), 1);
    }

    var JS = require('./lib/js-utils.js');
    JS.extend( AssetDB, EventEmitter ); // inherit from event emitter
    JS.extend( AssetDB, require('./lib/static') ); // inherit from event emitter

    JS.mixin( AssetDB.prototype, require('./lib/utils') );
    JS.mixin( AssetDB.prototype, require('./lib/interface') );
    JS.mixin( AssetDB.prototype, require('./lib/internal') );

    if ( ED && ED.isCoreLevel ) {
        JS.mixin( AssetDB.prototype, require('./core/watch') );
    }

    // export module
    module.exports = AssetDB;
})();
