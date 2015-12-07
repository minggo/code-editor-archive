/**
 * @module cc
 */
/****************************************************************************
 Copyright (c) 2008-2010 Ricardo Quesada
 Copyright (c) 2011-2012 cocos2d-x.org
 Copyright (c) 2013-2014 Chukong Technologies Inc.

 http://www.cocos2d-x.org

 Permission is hereby granted, free of charge, to any person obtaining a copy
 of this software and associated documentation files (the "Software"), to deal
 in the Software without restriction, including without limitation the rights
 to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
 copies of the Software, and to permit persons to whom the Software is
 furnished to do so, subject to the following conditions:

 The above copyright notice and this permission notice shall be included in
 all copies or substantial portions of the Software.

 THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
 IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
 FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
 AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
 LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
 OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN
 THE SOFTWARE.
 ****************************************************************************/

function _getPropertyDescriptor (obj, name) {
    var pd = Object.getOwnPropertyDescriptor(obj, name);
    if (pd) {
        return pd;
    }
    var p = Object.getPrototypeOf(obj);
    if (p) {
        return _getPropertyDescriptor(p, name);
    }
    else {
        return null;
    }
}

function _copyprop(name, source, target) {
    var pd = _getPropertyDescriptor(source, name);
    Object.defineProperty(target, name, pd);
}

/**
 * This module provides some JavaScript utilities.
 *
 * @module js
 */
var js = {

    /**
     * Check the obj whether is function or not
     * @param {*} obj
     * @returns {Boolean}
     */
    isFunction: function(obj) {
        return typeof obj === 'function';
    },

    /**
     * Check the obj whether is number or not
     * @param {*} obj
     * @returns {Boolean}
     */
    isNumber: function(obj) {
        return typeof obj === 'number' || Object.prototype.toString.call(obj) === '[object Number]';
    },

    /**
     * Check the obj whether is string or not
     * @param {*} obj
     * @returns {Boolean}
     */
    isString: function(obj) {
        return typeof obj === 'string' || Object.prototype.toString.call(obj) === '[object String]';
    },

    /**
     * Check the obj whether is array or not
     * @param {*} obj
     * @returns {Boolean}
     */
    isArray: function(obj) {
        return Array.isArray(obj) ||
            (typeof obj === 'object' && Object.prototype.toString.call(obj) === '[object Array]');
    },

    /**
     * Check the obj whether is undefined or not
     * @param {*} obj
     * @returns {Boolean}
     */
    isUndefined: function(obj) {
        return typeof obj === 'undefined';
    },

    /**
     * Check the obj whether is object or not
     * @param {*} obj
     * @returns {Boolean}
     */
    isObject: function(obj) {
        return typeof obj === "object" && Object.prototype.toString.call(obj) === '[object Object]';
    },

    /**
     * copy all properties not defined in obj from arguments[1...n]
     * @method addon
     * @param {Object} obj object to extend its properties
     * @param {Object} ...sourceObj source object to copy properties from
     * @return {Object} the result obj
     */
    addon: function (obj) {
        'use strict';
        obj = obj || {};
        for (var i = 1, length = arguments.length; i < length; i++) {
            var source = arguments[i];
            if (source) {
                if (typeof source !== 'object') {
                    cc.error('cc.js.addon called on non-object:', source);
                    continue;
                }
                for ( var name in source) {
                    if ( !(name in obj) ) {
                        _copyprop( name, source, obj);
                    }
                }
            }
        }
        return obj;
    },

    /**
     * copy all properties from arguments[1...n] to obj
     * @method mixin
     * @param {Object} obj
     * @param {Object} ...sourceObj
     * @return {Object} the result obj
     */
    mixin: function (obj) {
        'use strict';
        obj = obj || {};
        for (var i = 1, length = arguments.length; i < length; i++) {
            var source = arguments[i];
            if (source) {
                if (typeof source !== 'object') {
                    cc.error('cc.js.mixin: arguments must be type object:', source);
                    continue;
                }
                for ( var name in source) {
                    _copyprop( name, source, obj);
                }
            }
        }
        return obj;
    },

    /**
     * Derive the class from the supplied base class.
     * Both classes are just native javascript constructors, not created by cc.Class, so
     * usually you will want to inherit using {% crosslink cc.Class cc.Class %} instead.
     *
     * @method extend
     * @param {Function} cls
     * @param {Function} base - the baseclass to inherit
     * @return {Function} the result class
     */
    extend: function (cls, base) {
        if (CC_DEV) {
            if (!base) {
                cc.error('The base class to extend from must be non-nil');
                return;
            }
            if (!cls) {
                cc.error('The class to extend must be non-nil');
                return;
            }
        }
        for (var p in base) if (base.hasOwnProperty(p)) cls[p] = base[p];
        cls.prototype = Object.create(base.prototype);
        cls.prototype.constructor = cls;
        return cls;
    },

    /**
     * Removes all enumerable properties from object
     * @method clear
     * @param {any} obj
     */
    clear: function (obj) {
        var keys = Object.keys(obj);
        for (var i = 0; i < keys.length; i++) {
            delete obj[keys[i]];
        }
    },

    /**
     * Get property descriptor in object and all its ancestors
     * @method getPropertyDescriptor
     * @param {Object} obj
     * @param {String} name
     * @return {Object}
     */
    getPropertyDescriptor: _getPropertyDescriptor
};

/**
 * Get class name of the object, if object is just a {} (and which class named 'Object'), it will return null.
 * (modified from <a href="http://stackoverflow.com/questions/1249531/how-to-get-a-javascript-objects-class">the code from this stackoverflow post</a>)
 * @method getClassName
 * @param {Object|Function} obj - instance or constructor
 * @return {String}
 */
js.getClassName = function (obj) {
    if (typeof obj === 'function') {
        if (obj.prototype.__classname__) {
            return obj.prototype.__classname__;
        }
    }
    else if (obj && obj.constructor) {
        if (obj.constructor.prototype && obj.constructor.prototype.hasOwnProperty('__classname__')) {
            return obj.__classname__;
        }
        var retval;
        //  for browsers which have name property in the constructor of the object, such as chrome
        if (obj.constructor.name) {
            retval = obj.constructor.name;
        }
        if (obj.constructor.toString) {
            var arr, str = obj.constructor.toString();
            if (str.charAt(0) === '[') {
                // str is "[object objectClass]"
                arr = str.match(/\[\w+\s*(\w+)\]/);
            }
            else {
                // str is function objectClass () {} for IE Firefox
                arr = str.match(/function\s*(\w+)/);
            }
            if (arr && arr.length === 2) {
                retval = arr[1];
            }
        }
        return retval !== 'Object' ? retval : '';
    }
    return '';
};

var TCID_PREFIX = 'cc.TmpCId.';
var id = 0;
function getTempCID () {
    return TCID_PREFIX + (id++);
}

js._isTempClassId = function (id) {
    return (CC_EDITOR || CC_TEST) && (typeof id !== 'string' || id.startsWith(TCID_PREFIX));
};

// id 注册
(function () {
    var _idToClass = {};
    var _nameToClass = {};

    function getRegister (key, table) {
        return function (id, constructor) {
            // deregister old
            if (constructor.prototype.hasOwnProperty(key)) {
                delete table[constructor.prototype[key]];
            }
            constructor.prototype[key] = id;
            // register class
            if (id) {
                var registered = table[id];
                if (registered && registered !== constructor) {
                    var error = 'A Class already exists with the same ' + key + ' : "' + id + '".';
                    if (CC_TEST) {
                        error += ' (This may be caused by error of unit test.) \
If you dont need serialization, you can set class id to "". You can also call \
cc.js.unregisterClass to remove the id of unused class';
                    }
                    cc.error(error);
                }
                else {
                    table[id] = constructor;
                }
                //if (id === "") {
                //    console.trace("", table === _nameToClass);
                //}
            }
        };
    }

    /**
     * Register the class by specified id, if its classname is not defined, the class name will also be set.
     * @method _setClassId
     * @param {String} classId
     * @param {Function} constructor
     * @private
     */
    js._setClassId = getRegister('__cid__', _idToClass);

    var doSetClassName = getRegister('__classname__', _nameToClass);

    /**
     * Register the class by specified name manually
     * @method setClassName
     * @param {String} className
     * @param {Function} constructor
     */
    js.setClassName = function (className, constructor) {
        doSetClassName(className, constructor);
        // auto set class id
        if (!constructor.prototype.hasOwnProperty('__cid__')) {
            var id = className || getTempCID();
            if (id) {
                js._setClassId(id, constructor);
            }
        }
    };

    /**
     * Unregister a class from fireball.
     *
     * If you dont need a registered class anymore, you should unregister the class so that Fireball will not keep its reference anymore.
     * Please note that its still your responsibility to free other references to the class.
     *
     * @method unregisterClass
     * @param {Function} ...constructor - the class you will want to unregister, any number of classes can be added
     */
    js.unregisterClass = function (constructor) {
        'use strict';
        for (var i = 0; i < arguments.length; i++) {
            var p = arguments[i].prototype;
            var classId = p.__cid__;
            if (classId) {
                delete _idToClass[classId];
            }
            var classname = p.__classname__;
            if (classname) {
                delete _nameToClass[classname];
            }
        }
    };

    /**
     * Get the registered class by id
     * @method _getClassById
     * @param {String} classId
     * @return {Function} constructor
     * @private
     */
    js._getClassById = function (classId) {
        return _idToClass[classId];
    };

    /**
     * Get the registered class by name
     * @method getClassByName
     * @param {String} classname
     * @return {Function} constructor
     */
    js.getClassByName = function (classname) {
        return _nameToClass[classname];
    };

    /**
     * Get class id of the object
     * @method _getClassId
     * @param {Object|Function} obj - instance or constructor
     * @param {Boolean} [allowTempId=true] - can return temp id in editor
     * @return {String}
     * @private
     */
    js._getClassId = function (obj, allowTempId) {
        allowTempId = (typeof allowTempId !== 'undefined' ? allowTempId: true);

        var res;
        if (typeof obj === 'function' && obj.prototype.hasOwnProperty('__cid__')) {
            res = obj.prototype.__cid__;
            if (!allowTempId && js._isTempClassId(res)) {
                return '';
            }
            return res;
        }
        if (obj && obj.constructor) {
            var prototype = obj.constructor.prototype;
            if (prototype && prototype.hasOwnProperty('__cid__')) {
                res = obj.__cid__;
                if (!allowTempId && js._isTempClassId(res)) {
                    return '';
                }
                return res;
            }
        }
        return '';
    };

    if (CC_EDITOR) {
        Object.defineProperty(js, '_registeredClassIds', {
            get: function () {
                var dump = {};
                for (var id in _idToClass) {
                    dump[id] = _idToClass[id];
                }
                return dump;
            },
            set: function (value) {
                js.clear(_idToClass);
                for (var id in value) {
                    _idToClass[id] = value[id];
                }
            }
        });
        Object.defineProperty(js, '_registeredClassNames', {
            get: function () {
                var dump = {};
                for (var id in _nameToClass) {
                    dump[id] = _nameToClass[id];
                }
                return dump;
            },
            set: function (value) {
                js.clear(_nameToClass);
                for (var id in value) {
                    _nameToClass[id] = value[id];
                }
            }
        });
    }

})();

/**
 * Define get set accessor, just help to call Object.defineProperty(...)
 * @method getset
 * @param {any} obj
 * @param {String} prop
 * @param {Function} getter
 * @param {Function} setter
 * @param {Boolean} [enumerable=false]
 */
js.getset = function (obj, prop, getter, setter, enumerable) {
    if (typeof setter !== 'function') {
        enumerable = setter;
        setter = undefined;
    }
    Object.defineProperty(obj, prop, {
        get: getter,
        set: setter,
        enumerable: !!enumerable
    });
};

/**
 * Define get accessor, just help to call Object.defineProperty(...)
 * @method get
 * @param {any} obj
 * @param {String} prop
 * @param {Function} getter
 * @param {Boolean} [enumerable=false]
 */
js.get = function (obj, prop, getter, enumerable) {
    Object.defineProperty(obj, prop, {
        get: getter,
        enumerable: !!enumerable
    });
};

/**
 * Define set accessor, just help to call Object.defineProperty(...)
 * @method set
 * @param {any} obj
 * @param {String} prop
 * @param {Function} setter
 * @param {Boolean} [enumerable=false]
 */
js.set = function (obj, prop, setter, enumerable) {
    Object.defineProperty(obj, prop, {
        set: setter,
        enumerable: !!enumerable
    });
};

/**
 * Defines a polyfill field for obsoleted codes.
 * @method obsolete
 * @param {any} obj - YourObject or YourClass.prototype
 * @param {String} obsoleted - "OldParam" or "YourClass.OldParam"
 * @param {String} newPropName - "NewParam"
 * @param {Boolean} [writable=false]
 */
js.obsolete = function (obj, obsoleted, newPropName, writable) {
    var oldName = obsoleted.split('.').slice(-1);
    js.get(obj, oldName, function () {
        if (CC_DEV) {
            cc.warn('"%s" is deprecated, use "%s" instead please.', obsoleted, newPropName);
        }
        return obj[newPropName];
    });
    if (writable) {
        js.set(obj, oldName, function (value) {
            if (CC_DEV) {
                cc.warn('"%s" is deprecated, use "%s" instead please.', obsoleted, newPropName);
            }
            obj[newPropName] = value;
        });
    }
};

/**
 * Defines all polyfill fields for obsoleted codes corresponding to the enumerable properties of props.
 * @method obsoletes
 * @param {any} obj - YourObject or YourClass.prototype
 * @param {any} objName - "YourObject" or "YourClass"
 * @param {Object} props
 * @param {Boolean} [writable=false]
 */
js.obsoletes = function (obj, objName, props, writable) {
    for (var obsoleted in props) {
        var newName = props[obsoleted];
        js.obsolete(obj, objName + '.' + obsoleted, newName, writable);
    }
};

/**
 * @class array
 * @static
 */
js.array = {
    /**
     * Removes the first occurrence of a specific object from the array.
     * @method remove
     * @param {any[]} array
     * @param {any} value
     * @return {Boolean}
     */
    remove: function (array, value) {
        var index = array.indexOf(value);
        if (index !== -1) {
            array.splice(index, 1);
            return true;
        }
        else {
            return false;
        }
    },

    /**
     * Removes the array item at the specified index.
     * @method removeAt
     * @param {any[]} array
     * @param {Number} index
     */
    removeAt: function (array, index) {
        array.splice(index, 1);
    },

    /**
     * Determines whether the array contains a specific value.
     * @method contains
     * @param {any[]} array
     * @param {any} value
     * @return {Boolean}
     */
    contains: function (array, value) {
        return array.indexOf(value) !== -1;
    },

    /**
     * Verify array's Type
     * @param {array} array
     * @param {Function} type
     * @return {Boolean}
     * @method
     */
    verifyType: function (array, type) {
        if (array && array.length > 0) {
            for (var i = 0; i < array.length; i++) {
                if (!(array[i] instanceof  type)) {
                    cc.log(cc._LogInfos.Array.verifyType);
                    return false;
                }
            }
        }
        return true;
    },

    /**
     * Removes from array all values in minusArr. For each Value in minusArr, the first matching instance in array will be removed.
     * @method
     * @param {Array} array Source Array
     * @param {Array} minusArr minus Array
     */
    removeArray: function (array, minusArr) {
        for (var i = 0, l = minusArr.length; i < l; i++) {
            remove(array, minusArr[i]);
        }
    },

    /**
     * Inserts some objects at index
     * @method
     * @param {Array} array
     * @param {Array} addObjs
     * @param {Number} index
     * @return {Array}
     */
    appendObjectsAt: function(array, addObjs, index) {
        array.splice.apply(array, [index, 0].concat(addObjs));
        return array;
    },

    /**
     * Copy an array's item to a new array (its performance is better than Array.slice)
     * @param {Array} array
     * @return {Array}
     */
    copy: function(array) {
        var i, len = array.length, arr_clone = new Array(len);
        for (i = 0; i < len; i += 1)
            arr_clone[i] = array[i];
        return arr_clone;
    }
};

cc.js = js;

module.exports = js;
