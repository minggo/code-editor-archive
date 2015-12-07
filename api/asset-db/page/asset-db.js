'use strict';

/**
 * @module Editor
 */

/**
 * The AssetDB instance
 * @property assetdb
 * @type {AssetDB}
 */
Editor.assetdb = (function () {
    /**
     * @module AssetDB
     * @process page
     */
    var AssetDB = {};

    /**
     * The remote AssetDB instance
     * @property remote
     * @type object
     */
    AssetDB.remote = Editor.remote.assetdb;

    /**
     * The library path
     * @property library
     * @type string
     */
    AssetDB.library = AssetDB.remote.library;

    // ipc

    /**
     * Reveal given url in native file system
     * @method explore
     * @param {string} url
     */
    AssetDB.explore = function ( url ) {
        Editor.sendToCore( 'asset-db:explore', url );
    };

    /**
     * Reveal given url's library file in native file system
     * @method exploreLib
     * @param {string} url
     */
    AssetDB.exploreLib = function ( url ) {
        Editor.sendToCore( 'asset-db:explore-lib', url );
    };

    /**
     * Get native file path by url
     * @method queryPathByUrl
     * @param {string} url
     * @param {function} cb - The callback function
     * @param {string} cb.path
     */
    AssetDB.queryPathByUrl = function ( url, cb ) {
        return Editor.sendRequestToCore( 'asset-db:query-path-by-url', url, cb );
    };

    /**
     * Get uuid by url
     * @method queryUuidByUrl
     * @param {string} url
     * @param {function} cb - The callback function
     * @param {string} cb.path
     */
    AssetDB.queryUuidByUrl = function ( url, cb ) {
        return Editor.sendRequestToCore( 'asset-db:query-uuid-by-url', url, cb );
    };

    /**
     * Get native file path by uuid
     * @method queryPathByUuid
     * @param {string} uuid
     * @param {function} cb - The callback function
     * @param {string} cb.path
     */
    AssetDB.queryPathByUuid = function ( uuid, cb ) {
        return Editor.sendRequestToCore( 'asset-db:query-path-by-uuid', uuid, cb );
    };

    /**
     * Get asset url by uuid
     * @method queryUrlByUuid
     * @param {string} uuid
     * @param {function} cb - The callback function
     * @param {string} cb.url
     */
    AssetDB.queryUrlByUuid = function ( uuid, cb ) {
        return Editor.sendRequestToCore( 'asset-db:query-url-by-uuid', uuid, cb );
    };

    /**
     * Get asset info by uuid
     * @method queryInfoByUuid
     * @param {string} uuid
     * @param {function} cb - The callback function
     * @param {object} cb.info
     * @example
     * ```js
     * Editor.assetdb.queryInfoByUuid( uuid, function ( info ) {
     *     // info.path
     *     // info.url
     *     // info.type
     * });
     * ```
     */
    AssetDB.queryInfoByUuid = function ( uuid, cb ) {
        return Editor.sendRequestToCore( 'asset-db:query-info-by-uuid', uuid, cb );
    };

    /**
     * Get meta info by uuid
     * @method queryMetaInfoByUuid
     * @param {string} uuid
     * @param {function} cb - The callback function
     * @param {object} cb.info
     * @example
     * ```js
     * Editor.assetdb.queryMetaInfoByUuid( uuid, function ( info ) {
     *     // info.assetPath
     *     // info.metaPath
     *     // info.assetMtime
     *     // info.metaMtime
     *     // info.json
     * });
     * ```
     */
    AssetDB.queryMetaInfoByUuid = function ( uuid, cb ) {
        return Editor.sendRequestToCore( 'asset-db:query-meta-info-by-uuid', uuid, cb );
    };

    /**
     * Query all assets from asset-db
     * @method deepQuery
     * @param {function} cb - The callback function
     * @param {array} cb.results
     * @example
     * ```js
     * Editor.assetdb.deepQuery(function ( results ) {
     *     results.forEach(function ( result ) {
     *         // result.name
     *         // result.extname
     *         // result.uuid
     *         // result.type
     *         // result.children - the array of children result
     *     });
     * });
     * ```
     */
    AssetDB.deepQuery = function ( cb ) {
        return Editor.sendRequestToCore( 'asset-db:deep-query', cb );
    };

    /**
     * Query assets by url pattern and asset-type
     * @method queryAssets
     * @param {string} pattern - The url pattern
     * @param {string} type - The asset type
     * @param {function} cb - The callback function
     * @param {array} cb.results
     * @example
     * ```js
     * Editor.assetdb.queryAssets( 'assets://**\/*', 'texture', function ( results ) {
     *     results.forEach(function ( result ) {
     *         // result.url
     *         // result.path
     *         // result.uuid
     *         // result.type
     *     });
     * });
     * ```
     */
    AssetDB.queryAssets = function ( url, assetType, cb ) {
        return Editor.sendRequestToCore( 'asset-db:query-assets', url, assetType, cb );
    };

    /**
     * Import files outside asset-db to specific url folder.
     * The import result will be sent through ipc message `asset-db:assets-created`
     * @method import
     * @param {array} rawfiles - Rawfile path list
     * @param {string} destUrl - The url of dest folder
     * @example
     * ```js
     * Editor.assetdb.import( [
     *      '/file/to/import/01.png',
     *      '/file/to/import/02.png',
     *      '/file/to/import/03.png',
     * ], 'assets://foobar' );
     * ```
     */
    AssetDB.import = function ( rawfiles, destUrl ) {
        Editor.sendToCore( 'asset-db:import-assets', rawfiles, destUrl );
    };

    /**
     * Create asset in specific url by sending string data to it.
     * The created result will be sent through by ipc message `asset-db:assets-created`
     * @method create
     * @param {string} url
     * @param {string} data
     * @example
     * ```js
     * Editor.assetdb.create( 'assets://foo/bar/foobar.js', 'var foobar = 0;');
     * ```
     */
    AssetDB.create = function ( url, data ) {
        Editor.sendToCore( 'asset-db:create-asset', url, data );
    };

    /**
     * Move asset from src to dest
     * The moved result will be sent through by ipc message `asset-db:assets-moved`
     * @method move
     * @param {string} srcUrl
     * @param {string} destUrl
     * @example
     * ```js
     * Editor.assetdb.move( 'assets://foo/bar/foobar.js', 'assets://foo/bar/foobar02.js');
     * ```
     */
    AssetDB.move = function ( srcUrl, destUrl ) {
        Editor.sendToCore( 'asset-db:move-asset', srcUrl, destUrl );
    };

    /**
     * Delete assets by url list
     * The deleted results will be sent through by ipc message `asset-db:assets-deleted`
     * @method delete
     * @param {array} urls
     * @example
     * ```js
     * Editor.assetdb.delete([
     *   'assets://foo/bar/foobar.js',
     *   'assets://foo/bar/foobar02.js',
     * ]);
     * ```
     */
    AssetDB.delete = function ( urls ) {
        Editor.sendToCore( 'asset-db:delete-assets', urls );
    };

    /**
     * Save specific asset by sending string data
     * The saved results will be sent through by ipc message `asset-db:asset-changed`
     * @method save
     * @param {string} url
     * @param {string} data
     * @example
     * ```js
     * Editor.assetdb.save( 'assets://foo/bar/foobar.js', 'var foobar = 0;');
     * ```
     */
    AssetDB.save = function ( url, data ) {
        Editor.sendToCore( 'asset-db:save', url, data );
    };

    /**
     * Save specific meta by sending meta's json string
     * The saved results will be sent through by ipc message `asset-db:asset-changed`
     * @method saveMeta
     * @param {string} uuid
     * @param {string} metaJson
     * @example
     * ```js
     * Editor.assetdb.save( meta.uuid, JSON.stringify(meta, null, 2));
     * ```
     */
    AssetDB.saveMeta = function ( uuid, metaJson ) {
        Editor.sendToCore( 'asset-db:save-meta', uuid, metaJson );
    };

    return AssetDB;
})();
