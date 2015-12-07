/**
 * @module cc
 */
require('../platform/CCSys');
/**
 * @class path
 * @static
 */
cc.path = /** @lends cc.path# */{
    normalizeRE: /[^\.\/]+\/\.\.\//,

    /**
     * Join strings to be a path.
     * @method join
     * @example {@link utils/api/cocos/docs/cocos2d/core/utils/CCPath/join.js}
     * @returns {String}
     */
    join: function () {
        var l = arguments.length;
        var result = "";
        for (var i = 0; i < l; i++) {
            result = (result + (result === "" ? "" : "/") + arguments[i]).replace(/(\/|\\\\)$/, "");
        }
        return result;
    },

    /**
     * Get the ext name of a path.
     * @method extname
     * @example {@link utils/api/cocos/docs/cocos2d/core/utils/CCPath/extname.js}
     * @param {String} pathStr
     * @returns {*}
     */
    extname: function (pathStr) {
        var temp = /(\.[^\.\/\?\\]*)(\?.*)?$/.exec(pathStr);
        return temp ? temp[1] : null;
    },

    /**
     * Get the main name of a file name
     * @method mainFileName
     * @param {String} fileName
     * @returns {String}
     */
    mainFileName: function(fileName){
        if(fileName){
            
            var idx = fileName.lastIndexOf(".");
            if(idx !== -1)
                return fileName.substring(0,idx);
        }
        return fileName;
    },

    /**
     * Get the file name of a file path.
     * @method basename
     * @example {@link utils/api/cocos/docs/cocos2d/core/utils/CCPath/basename.js}
     * @param {String} pathStr
     * @param {String} [extname]
     * @returns {*}
     */
    basename: function (pathStr, extname) {
        var index = pathStr.indexOf("?");
        if (index > 0) pathStr = pathStr.substring(0, index);
        var reg = /(\/|\\\\)([^(\/|\\\\)]+)$/g;
        var result = reg.exec(pathStr.replace(/(\/|\\\\)$/, ""));
        if (!result) return null;
        var baseName = result[2];
        if (extname && pathStr.substring(pathStr.length - extname.length).toLowerCase() === extname.toLowerCase())
            return baseName.substring(0, baseName.length - extname.length);
        return baseName;
    },

    /**
     * Get dirname of a file path.
     * @method dirname
     * @example {@link utils/api/cocos/docs/cocos2d/core/utils/CCPath/dirname.js}
     * @param {String} pathStr
     * @returns {*}
     */
    dirname: function (pathStr) {
        return pathStr.replace(/((.*)(\/|\\|\\\\))?(.*?\..*$)?/, '$2');
    },

    /**
     * Change extname of a file path.
     * @method changeExtname
     * @example {@link utils/api/cocos/docs/cocos2d/core/utils/CCPath/changeExtname.js}
     * @param {String} pathStr
     * @param {String} [extname]
     * @returns {String}
     */
    changeExtname: function (pathStr, extname) {
        extname = extname || "";
        var index = pathStr.indexOf("?");
        var tempStr = "";
        if (index > 0) {
            tempStr = pathStr.substring(index);
            pathStr = pathStr.substring(0, index);
        }
        index = pathStr.lastIndexOf(".");
        if (index < 0) return pathStr + extname + tempStr;
        return pathStr.substring(0, index) + extname + tempStr;
    },
    /**
     * Change file name of a file path.
     * @example {@link utils/api/cocos/docs/cocos2d/core/utils/CCPath/changeBasename.js}
     * @param {String} pathStr
     * @param {String} basename
     * @param {Boolean} [isSameExt]
     * @returns {String}
     */
    changeBasename: function (pathStr, basename, isSameExt) {
        if (basename.indexOf(".") === 0) return this.changeExtname(pathStr, basename);
        var index = pathStr.indexOf("?");
        var tempStr = "";
        var ext = isSameExt ? this.extname(pathStr) : "";
        if (index > 0) {
            tempStr = pathStr.substring(index);
            pathStr = pathStr.substring(0, index);
        }
        index = pathStr.lastIndexOf("/");
        index = index <= 0 ? 0 : index + 1;
        return pathStr.substring(0, index) + basename + ext + tempStr;
    },
    //todo make public after verification
    _normalize: function(url){
        var oldUrl = url = String(url);

        //removing all ../
        do {
            oldUrl = url;
            url = url.replace(this.normalizeRE, "");
        } while(oldUrl.length !== url.length);
        return url;
    },

    // The platform-specific file separator. '\\' or '/'.
    sep: (cc.sys.os === cc.sys.OS_WINDOWS ? '\\' : '/'),

    // @param {string} path
    // @param {boolean|string} [endsWithSep = true]
    // @returns {string}
    _setEndWithSep: function (path, endsWithSep) {
        var sep = cc.path.sep;
        if (typeof endsWithSep === 'undefined') {
            endsWithSep = true;
        }
        else if (typeof endsWithSep === 'string') {
            sep = endsWithSep;
            endsWithSep = !!endsWithSep;
        }

        var endChar = path[path.length - 1];
        var oldEndWithSep = (endChar === '\\' || endChar === '/');
        if (!oldEndWithSep && endsWithSep) {
            path += sep;
        }
        else if (oldEndWithSep && !endsWithSep) {
            path = path.slice(0, -1);
        }
        return path;
    }
};