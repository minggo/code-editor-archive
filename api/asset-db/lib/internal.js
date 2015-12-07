'use strict';

var Async = require('async');
var Del = require('del');
var Path = require('fire-path');
var Url = require('fire-url');

module.exports = {
    _MOUNT_PREFIX: 'mount-',

    /**
     * make a dbpath
     * @param {string} name - the mounting name
     * @param {string} * - any other params
     * @return {string} - the dbpath
     */
    _dbpath: function ( name ) {
        var args = [].slice.call( arguments, 1 );
        var path = Url.join.apply( Url, args);

        // trim the slashes in at first
        for ( var i = 0; i < path.length; ++i ) {
            if ( path[i] !== '/' ) {
                break;
            }
        }
        path = path.substr(i);

        return Url.format({
            protocol: name,
            host: path,
            slashes: true,
        });
    },

    /**
     * convert a dbpath to fspath
     * @param {string} url - the url path
     * @return {string} - the absolute file system path
     */
    _fspath: function ( url ) {
        if ( !url ) {
            return null;
        }

        var list = url.split(':');
        if ( list.length !== 2 ) {
            return null;
        }

        var name = list[0];
        var relpath = Path.normalize(list[1]);
        if ( !this._mounts[name] ) {
            return null;
        }

        return Path.resolve( Path.join(this._mounts[name].path, relpath) );
    },

    /**
     * Convert a fspath to dbpath
     * @param {string} fspath - the absolute file system path
     * @return {string} - the url path
     */
    _url: function ( fspath ) {
        if ( !fspath ) {
            return null;
        }

        for ( var p in this._mounts ) {
            var root = this._mounts[p].path;
            if ( Path.contains( root, fspath ) ) {
                return Url.normalize(p + ':/' + fspath.slice( root.length ));
            }
        }
        return Url.normalize('file://' + fspath);
    },

    /**
     * Convert meta path to asset path
     * @param {string} metapath - the absolute meta path
     * @return {string} - the raw asset path
     */
    _metaToAssetPath: function ( metapath ) {
        var basename = Path.basename(metapath,'.meta');
        return Path.join(Path.dirname(metapath),basename);
    },

    /**
     * Whether fspath is a root path
     * @param {string} fspath - the absolute file system path
     * @return {boolean} - the result
     */
    _isRoot: function ( fspath ) {
        var path = Path.resolve(fspath);
        for ( var p in this._mounts ) {
            if ( this._mounts[p].path === path )
                return true;
        }
        return false;
    },

    /**
     * Whether fspath is a path in the assets library
     * @param {string} fspath - the absolute file system path
     * @return {boolean} - the result
     */
    _isAssetPath: function ( fspath ) {
        if ( !fspath ) {
            return false;
        }

        for ( var p in this._mounts ) {
            var root = this._mounts[p].path;
            if ( Path.contains( root, fspath ) ) {
                return true;
            }
        }
        return false;
    },

    /**
     * Make a mount id by name. If name is not a valid mount name, return ''
     * @param {string} name - mount name
     * @return {string} - mount id
     */
    _mountIDByName: function ( name ) {
        if ( this._mounts[name] ) {
            return this._MOUNT_PREFIX + name;
        }
        return '';
    },

    /**
     * Make a mount id by fspath. If fspath is not a valid mount path, return ''
     * @param {string} fspath - the absolute file system path
     * @return {string} - mount id
     */
    _mountIDByPath: function ( fspath ) {
        // var path = Path.resolve(fspath);
        for ( var p in this._mounts ) {
            if ( this._mounts[p].path === fspath )
                return 'mount-' + p;
        }
        return '';
    },

    /**
     * Convert uuid to import-path
     * @param {string} uuid
     * @return {string} - the import json path
     */
    _uuidToImportPathNoExt: function ( uuid ) {
        return Path.join( this._importPath, uuid.substring(0,2), uuid);
    },

    /**
     * Convert fspath to import-path
     * @param {string} fspath - the absolute file system path
     * @return {string} - the import json path
     */
    _fspathToImportPathNoExt: function ( fspath ) {
        var uuid = this.fspathToUuid(fspath);
        if ( uuid ) {
            return this._uuidToImportPathNoExt(uuid);
        }
        return null;
    },

    /**
     * Delete all meta files under mount paths
     * @param {function} [cb]
     */
    _rmMetas: function ( cb ) {
        var paths = [];
        for ( var p in this._mounts ) {
            paths.push(this._mounts[p].path);
        }

        Async.each( paths, function ( path, done ) {
            Del ( Path.join(path, '**/*.meta'), { force: true }, done );
        }, cb );
    },

    /**
     * Add fspath to db with uuid
     * @param {string} fspath - fs-path
     * @param {string} uuid - uuid
     */
    _dbAdd: function ( fspath, uuid ) {
        if ( this._uuid2path[uuid] ) {
            this.failed( 'uuid collision, uuid = %s, collision = %s, path = %s', uuid, this._uuid2path[uuid], fspath );
        }

        if ( this._path2uuid[fspath] ) {
            this.failed( 'path collision, path = %s, collision = %s, uuid = %s', fspath, this._path2uuid[fspath], uuid );
        }

        this._path2uuid[fspath] = uuid;
        this._uuid2path[uuid] = fspath;
    },

    /**
     * Move srcpath to destpath, delete srcpath from db and add destpath to db
     * @param {string} srcpath
     * @param {string} destpath
     */
    _dbMove: function ( srcpath, destpath ) {
        var uuid = this._path2uuid[srcpath];

        delete this._path2uuid[srcpath];

        this._path2uuid[destpath] = uuid;
        this._uuid2path[uuid] = destpath;
    },

    /**
     * Delete fspath from db
     * @param {string} fspath - the absolute file system path
     */
    _dbDelete: function ( fspath ) {
        var uuid = this._path2uuid[fspath];

        delete this._path2uuid[fspath];
        delete this._uuid2path[uuid];
    },

    _dbReset: function () {
        this._mounts = {};
        this._uuid2mtime = {};
        this._uuid2path = {};
        this._path2uuid = {};
    },

    /**
     * Handle refresh results according to the result command type
     * @param {object} results
     */
    _handleRefreshResults: function ( results ) {
        var deleteResults = [];
        var createResults = [];

        results.forEach( function ( result ) {
            if ( result.command === 'uuid-change' ) {
                Editor.sendToAll('asset-db:asset-uuid-changed', {
                    type: result.type,
                    uuid: result.uuid,
                    oldUuid: result.oldUuid,
                });
            }
            else if ( result.command === 'change' ) {
                Editor.sendToAll('asset-db:asset-changed', {
                    type: result.type,
                    uuid: result.uuid,
                });
            }
            else if ( result.command === 'create' ) {
                createResults.push({
                    path: result.path,
                    url: result.url,
                    uuid: result.uuid,
                    parentUuid: result.parentUuid,
                    type: result.type,
                });
            }
            else if ( result.command === 'delete' ) {
                deleteResults.push({
                    path: result.path,
                    url: result.url,
                    uuid: result.uuid,
                    type: result.type,
                });
            }
        });

        if ( deleteResults.length > 0 ) {
            Editor.sendToAll('asset-db:assets-deleted', deleteResults);
        }
        if ( createResults.length > 0 ) {
            Editor.sendToAll('asset-db:assets-created', createResults);
        }
    },
};
