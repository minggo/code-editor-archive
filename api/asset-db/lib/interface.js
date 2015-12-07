'use strict';

/**
 * @module AssetDB
 * @process core
 */

var Task = require('./tasks');
var Meta = require('./meta');
var Static = require('./static');
var Path = require('fire-path');
var Fs = require('fire-fs');

module.exports = {
    /**
     * Return uuid by url. if uuid not found, it will return null.
     * @method urlToUuid
     * @param {string} url
     * @return {string}
     */
    urlToUuid: function ( url ) {
        var fspath = this._fspath(url);
        return this.fspathToUuid(fspath);
    },

    /**
     * Return uuid by file path. if uuid not found, it will return null.
     * @method fspathToUuid
     * @param {string} fspath
     * @return {string}
     */
    fspathToUuid: function ( fspath ) {
        return this._path2uuid[fspath];
    },

    /**
     * Return file path by uuid. if file path not found, it will return null.
     * @method uuidToFspath
     * @param {string} uuid
     * @return {string}
     */
    uuidToFspath: function ( uuid ) {
        return this._uuid2path[uuid];
    },

    /**
     * Return url by uuid. if url not found, it will return null.
     * @method uuidToUrl
     * @param {string} uuid
     * @return {string}
     */
    uuidToUrl: function ( uuid ) {
        var fspath = this.uuidToFspath(uuid);
        return this._url(fspath);
    },

    /**
     * Check existance by url.
     * @method exists
     * @param {string} url
     * @return {string}
     */
    exists: function ( url ) {
        var uuid = this.urlToUuid(url);
        return this.existByUuid(uuid);
    },

    /**
     * Check existance by uuid.
     * @method existsByUuid
     * @param {string} uuid
     * @return {string}
     */
    existsByUuid: function ( uuid ) {
        var fspath = this._uuid2path[uuid];
        return !!fspath;
    },

    /**
     * Check existance by path.
     * @method existsByPath
     * @param {string} fspath
     * @return {string}
     */
    existsByPath: function ( fspath ) {
        var uuid = this._path2uuid[fspath];
        return !!uuid;
    },

    /**
     * Check whether asset for a given url is a sub asset.
     * @method isSubAsset
     * @param {string} url
     * @return {boolean}
     */
    isSubAsset: function ( url ) {
        var fspath = this._fspath(url);
        return this.isSubAssetByPath(fspath);
    },

    /**
     * Check whether asset for a given uuid is a sub asset.
     * @method isSubAssetByUuid
     * @param {string} uuid
     * @return {boolean}
     */
    isSubAssetByUuid: function ( uuid ) {
        var fspath = this.uuidToFspath(uuid);
        return this.isSubAssetByPath(fspath);
    },

    /**
     * Check whether asset for a given path is a sub asset.
     * @method isSubAssetByPath
     * @param {string} fspath
     * @return {boolean}
     */
    isSubAssetByPath: function ( fspath ) {
        return Fs.isDirSync( Path.dirname(fspath) ) === false;
    },

    /**
     * Check whether asset contains sub assets for a given url.
     * @method containsSubAssets
     * @param {string} url
     * @return {boolean}
     */
    containsSubAssets: function ( url ) {
        var fspath = this._fspath(url);
        return this.containsSubAssetsByPath(fspath);
    },

    /**
     * Check whether asset contains sub assets for a given uuid.
     * @method containsSubAssetsByUuid
     * @param {string} uuid
     * @return {boolean}
     */
    containsSubAssetsByUuid: function ( uuid ) {
        var fspath = this.uuidToFspath(uuid);
        return this.containsSubAssetsByPath(fspath);
    },

    /**
     * Check whether asset contains sub assets for a given path.
     * @method containsSubAssetsByPath
     * @param {string} path
     * @return {boolean}
     */
    containsSubAssetsByPath: function ( fspath ) {
        // folder can't contain sub assets
        if (Path.extname(fspath) === '')
            return false;
        // Not folder, but have sub assets
        for ( path in this._path2uuid ) {
            if ( fspath !== path && Path.contains(fspath, path) ) {
                return true;
            }
        }
        return false;
    },

    /**
     * Return asset info by a given url.
     * @method assetInfo
     * @param {string} url
     * @return {object} - { uuid, path, url, type, isSubAsset }
     */
    assetInfo: function ( url ) {
        var fspath = this._fspath(url);
        return this.assetInfoByPath(fspath);
    },

    /**
     * Return asset info by a given uuid.
     * @method assetInfoByUuid
     * @param {string} uuid
     * @return {object} - { uuid, path, url, type, isSubAsset }
     */
    assetInfoByUuid: function ( uuid ) {
        var fspath = this.uuidToFspath(uuid);
        return this.assetInfoByPath(fspath);
    },

    /**
     * Return asset info by a given file path.
     * @method assetInfoByPath
     * @param {string} fspath
     * @return {object} - { uuid, path, url, type, isSubAsset }
     */
    assetInfoByPath: function ( fspath ) {
        var url = this._url(fspath);
        var uuid = this.fspathToUuid( fspath );

        var meta = Meta.load( this, fspath+'.meta' );
        var type;
        if ( meta ) {
          type = meta.assetType();
        } else {
          var ctor = Meta.findCtor( this, fspath );
          type = ctor.defaultType();
        }
        var isSubAsset = this.isSubAssetByPath(fspath);

        return {
            uuid: uuid,
            path: fspath,
            url: url,
            type: type,
            isSubAsset: isSubAsset,
        };
    },

    /**
     * Return all sub assets info by url if the url contains sub assets.
     * @method subAssetInfos
     * @param {string} url
     * @return {array} - [{ uuid, path, url, type, isSubAsset }]
     */
    subAssetInfos: function ( url ) {
        var fspath = this._fspath(url);
        return this.subAssetInfosByPath(fspath)
    },

    /**
     * Return all sub assets info by uuid if the uuid contains sub assets.
     * @method subAssetInfosByUuid
     * @param {string} uuid
     * @return {array} - [{ uuid, path, url, type, isSubAsset }]
     */
    subAssetInfosByUuid: function ( uuid ) {
        var fspath = this.uuidToFspath(uuid);
        return this.subAssetInfosByPath(fspath)
    },

    /**
     * Return all sub assets info by path if the path contains sub assets.
     * @method subAssetInfosByPath
     * @param {string} fspath
     * @return {array} - [{ uuid, path, url, type, isSubAsset }]
     */
    subAssetInfosByPath: function ( fspath ) {
        var results = [], path, info;
        if ( Path.extname(fspath) !== '' ) {
            for ( path in this._path2uuid ) {
                if ( fspath !== path && Path.contains(fspath, path) ) {
                    info = this.assetInfoByPath(path);
                    results.push(info);
                }
            }
        }
        return results;
    },

    /**
     * Return meta instance by a given url.
     * @method loadMeta
     * @param {string} url
     * @return {object}
     */
    loadMeta: function ( url ) {
        var fspath = this._fspath(url);
        return this.loadMetaByPath(fspath);
    },

    /**
     * Return meta instance by a given uuid.
     * @method loadMetaByUuid
     * @param {string} uuid
     * @return {object}
     */
    loadMetaByUuid: function ( uuid ) {
        var fspath = this.uuidToFspath(uuid);
        return this.loadMetaByPath(fspath);
    },

    /**
     * Return meta instance by a given path.
     * @method loadMetaByPath
     * @param {string} fspath
     * @return {object}
     */
    loadMetaByPath: function ( fspath ) {
        var meta = Meta.load( this, fspath + '.meta' );
        return meta;
    },

    /**
     * Return whether a given url is reference to a mount
     * @method isMount
     * @param {string} url
     * @return {boolean}
     */
    isMount: function ( url ) {
        var uuid = this.urlToUuid(url);
        return this.isMountByUuid(uuid);
    },

    /**
     * Return whether a given path is reference to a mount
     * @method isMountByPath
     * @param {string} fspath
     * @return {boolean}
     */
    isMountByPath: function ( fspath ) {
        var uuid = this.fspathToUuid(fspath);
        return this.isMountByUuid(uuid);
    },

    /**
     * Return whether a given uuid is reference to a mount
     * @method isMountByUuid
     * @param {string} uuid
     * @return {boolean}
     */
    isMountByUuid: function ( uuid ) {
        return uuid.startsWith(this._MOUNT_PREFIX);
    },

    /**
     * Return mount info by url
     * @method mountInfo
     * @param {string} url
     * @return {object} - { path, name, type }
     */
    mountInfo: function ( url ) {
        var fspath = this._fspath(url);
        return this.mountInfoByPath(fspath);
    },

    /**
     * Return mount info by uuid
     * @method mountInfoByUuid
     * @param {string} uuid
     * @return {object} - { path, name, type }
     */
    mountInfoByUuid: function ( uuid ) {
        var fspath = this.uuidToFspath(uuid);
        return this.mountInfoByPath(fspath);
    },

    /**
     * Return mount info by path
     * @method mountInfoByPath
     * @param {string} fspath
     * @return {object} - { path, name, type }
     */
    mountInfoByPath: function (fspath) {
        if ( !fspath ) {
            return null;
        }

        for ( var p in this._mounts ) {
            var root = this._mounts[p].path;
            if ( Path.contains( root, fspath ) ) {
                return this._mounts[p];
            }
        }

        return null;
    },

    /**
     * mount a directory to assetdb, and give it a name. if you don't provide a name, it will mount to root.
     * @method mount
     * @param {string} path - file system path
     * @param {string} name - the mount name
     * @param {string} type - mount type. can be `raw` or `asset`
     * @param {function} [cb] - a callback function
     * @example
     * ```js
     * Editor.assetdb.mount('path/to/mount', 'assets', 'asset', function (err) {
     *     // mounted, do something ...
     * });
     * ```
     */
    mount: function ( path, name, type, cb ) {
        this._tasks.push({
            name: 'mount',
            run: Task.mount,
            params: [path, name, type]
        }, cb );
    },

    /**
     * Unmount by name
     * @method unmount
     * @param {string} name - the mount name
     * @param {function} [cb]
     * @example
     * ```js
     * Editor.assetdb.unmount('assets', function (err) {
     *     // unmounted, do something ...
     * });
     * ```
     */
    unmount: function ( name, cb ) {
        this._tasks.push({
            name: 'unmount',
            run: Task.unmount,
            params: [name],
        }, cb );
    },

    /**
     * Init assetdb, it will scan the mounted directories, and import unimported assets.
     * @param {function} [cb]
     * @example
     * ```js
     * Editor.assetdb.init(function (err, results) {
     *     // assets that imported during init
     *     results.forEach(function ( result ) {
     *         // result.uuid
     *         // result.parentUuid
     *         // result.url
     *         // result.path
     *         // result.type
     *     });
     * });
     * ```
     */
    init: function ( cb ) {
        this._tasks.push({
            name: 'init',
            run: Task.init,
            params: [],
        }, cb );
    },

    /**
     * Refresh the assets in url, and return the results
     * @param {string} url
     * @param {function} [cb]
     * @example
     * ```js
     * Editor.assetdb.refresh('assets://foo/bar/', function (err, results) {
     *     // assets that imported during init
     *     results.forEach(function ( result ) {
     *         if ( result.command === 'delete' ) {
     *             // result.uuid
     *             // result.url
     *             // result.path
     *             // result.type
     *         } else if ( result.command === 'change' || result.command === 'create' ) {
     *             // result.uuid
     *             // result.parentUuid
     *             // result.url
     *             // result.path
     *             // result.type
     *         } else if ( result.command === 'uuid-change' ) {
     *             // result.oldUuid
     *             // result.uuid
     *             // result.parentUuid
     *             // result.url
     *             // result.path
     *             // result.type
     *         }
     *     });
     * });
     * ```
     */
    refresh: function ( url, cb ) {
        var fspath = this._fspath(url);

        this._tasks.push({
            name: 'refresh',
            run: Task.refresh,
            params: [fspath],
        }, cb );
    },

    /**
     * deepQuery
     * @param {function} [cb]
     * @example
     * ```js
     * Editor.assetdb.deepQuery(function ( err, results ) {
     *     results.forEach(function ( result ) {
     *         // result.name
     *         // result.extname
     *         // result.uuid
     *         // result.type
     *         // result.isSubAsset
     *         // result.children - the array of children result
     *     });
     * });
     * ```
     */
    deepQuery: function ( cb ) {
        this._tasks.push({
            name: 'deep-query',
            run: Task.deepQuery,
            params: [],
            silent: true,
        }, cb );
    },

    /**
     * queryAssets
     * @param {string} pattern - The url pattern
     * @param {string} type - The asset type
     * @param {function} [cb] - The callback function
     * @example
     * ```js
     * Editor.assetdb.queryAssets( 'assets://**\/*', 'texture', function ( err, results ) {
     *     results.forEach(function ( result ) {
     *         // result.url
     *         // result.path
     *         // result.uuid
     *         // result.type
     *         // result.isSubAsset
     *     });
     * });
     * ```
     */
    queryAssets: function ( urlPattern, assetType, cb ) {
        var fspathPattern = this._fspath(urlPattern);

        this._tasks.push({
            name: 'query-assets',
            run: Task.queryAssets,
            params: [fspathPattern, assetType],
            silent: true,
        }, cb );
    },

    /**
     * queryMetas
     * @param {string} pattern - The url pattern
     * @param {string} type - The asset type
     * @param {function} [cb] - The callback function
     * @example
     * ```js
     * Editor.assetdb.queryAssets( 'assets://**\/*', 'texture', function ( err, results ) {
     *     results.forEach(function ( meta ) {
     *         // the meta instance
     *     });
     * });
     * ```
     */
    queryMetas: function ( urlPattern, assetType, cb ) {
        var fspathPattern = this._fspath(urlPattern);

        this._tasks.push({
            name: 'query-metas',
            run: Task.queryMetas,
            params: [fspathPattern, assetType],
            silent: true,
        }, cb );
    },

    /**
     * move
     * @param {string} srcUrl
     * @param {string} destUrl
     * @param {function} [cb]
     * @example
     * ```js
     * Editor.assetdb.move( 'assets://foo/foobar.png', 'assets://bar/foobar.png', function ( err, results ) {
     *     results.forEach(function ( result ) {
     *         // result.srcMountType
     *         // result.destMountType
     *         // result.srcPath
     *         // result.destPath
     *         // result.uuid
     *         // result.parentUuid
     *     });
     * });
     * ```
     */
    move: function ( srcUrl, destUrl, cb) {

        var srcFspath = this._fspath(srcUrl);
        var destFspath = this._fspath(destUrl);

        this._tasks.push({
            name: 'move',
            run: Task.move,
            params: [srcFspath, destFspath]
        }, cb);
    },

    /**
     * delete
     * @param {string} url
     * @param {function} [cb]
     * @example
     * ```js
     * Editor.assetdb.delete( 'assets://foo/bar.png', function ( err, results ) {
     *     results.forEach(function ( result ) {
     *         // result.srcMountType
     *         // result.destMountType
     *         // result.srcPath
     *         // result.destPath
     *         // result.uuid
     *         // result.parentUuid
     *     });
     * });
     * ```
     */
    delete: function (url, cb) {
        var fspath = this._fspath(url);
        var mountType = this.mountInfoByPath(fspath).type;

        if (mountType === Static.MountType.asset) {
            this._tasks.push({
                name: 'delete',
                run: Task.delete,
                params: [fspath],
            }, cb );
        }
        else if (mountType === Static.MountType.raw) {
            this._tasks.push({
                name: 'raw-delete',
                run: Task.rawDelete,
                params: [fspath],
            }, cb );
        }
        else {
            if (cb) cb( new Error('Wrong mountType : ' + mountType) );
        }
    },

    /**
     * Create asset at url with data
     * @param {string} url
     * @param {string} data
     * @param {function} [cb]
     * @example
     * ```js
     * Editor.assetdb.create( 'assets://foo/bar.js', data, function ( err, results ) {
     *     results.forEach(function ( result ) {
     *         // result.uuid
     *         // result.parentUuid
     *         // result.url
     *         // result.path
     *         // result.type
     *     });
     * });
     * ```
     */
    create: function ( url, data, cb ) {
        var fspath = this._fspath(url);

        this._tasks.push({
            name: 'create',
            run: Task.create,
            params: [fspath, data],
        }, cb );
    },

    /**
     * Save data to the exists asset at url
     * @param {string} url
     * @param {string} data
     * @param {function} [cb]
     * @example
     * ```js
     * Editor.assetdb.save( 'assets://foo/bar.js', data, function ( err, meta ) {
     *     // do something
     * });
     * ```
     */
    save: function ( url, data, cb ) {
        var fspath = this._fspath(url);

        this._tasks.push({
            name: 'save',
            run: Task.save,
            params: [fspath, data],
        }, cb );
    },

    /**
     * Import raw files to url
     * @param {array} rawfiles
     * @param {string} url
     * @param {function} [cb]
     * @example
     * ```js
     * Editor.assetdb.import( ['/User/user/foo.js', '/User/user/bar.js'], 'assets://foobar', function ( err, results ) {
     *     results.forEach(function ( result ) {
     *         // result.uuid
     *         // result.parentUuid
     *         // result.url
     *         // result.path
     *         // result.type
     *     });
     * });
     * ```
     */
    import: function ( rawfiles, url, cb ) {
        var fspath = this._fspath(url);
        var mountType = this.mountInfoByPath(fspath).type;

        if (mountType === Static.MountType.asset) {
            this._tasks.push({
                name: 'import',
                run: Task.import,
                params: [rawfiles, fspath],
            }, cb );
        }
        else if (mountType === Static.MountType.raw) {
            this._tasks.push({
                name: 'raw-import',
                run: Task.rawImport,
                params: [rawfiles, fspath],
            }, cb );
        }
        else {
            if (cb) cb( new Error('Wrong mountType : ' + mountType) );
        }
    },

    /**
     * Overwrite the meta by loading it through uuid
     * @param {string} uuid
     * @param {string} jsonString
     * @param {function} [cb]
     * @example
     * ```js
     * Editor.assetdb.saveMeta( uuid, jsonString, function ( err, meta ) {
     *     // do something
     * });
     * ```
     */
    saveMeta: function( uuid, jsonString, cb ) {
        this._tasks.push({
            name: 'save-meta',
            run: Task.saveMeta,
            params: [uuid, jsonString],
        }, cb );
    },

    /**
     * Clear imports
     * @param {string} url
     * @param {function} [cb]
     * @example
     * ```js
     * Editor.assetdb.clearImports( 'assets://foo/bar.js', function ( err, results ) {
     *     results.forEach(function ( result ) {
     *         // result.uuid
     *         // result.url
     *         // result.path
     *         // result.type
     *     });
     * });
     * ```
     */
    clearImports: function (url, cb) {
        var fspath = this._fspath(url);

        this._tasks.push({
            name: 'clear-imports',
            run: Task.clearImports,
            params: [fspath, null],
        }, cb );
    },

    /**
     * Register meta type
     * @param {string} extname
     * @param {boolean} folder - Whether it's a folder type
     * @param {object} metaCtor
     * @example
     * ```js
     * Editor.assetdb.register( '.png', false, PngMeta );
     * ```
     */
    register: function ( extname, folder, metaCtor ) {
        Meta.register( this, extname, folder, metaCtor );
    },

    /**
     * Unregister meta type
     * @param {object} metaCtor
     * @example
     * ```js
     * Editor.assetdb.unregister( PngMeta );
     * ```
     */
    unregister: function ( metaCtor ) {
        Meta.unregister( this, metaCtor );
    },
};
