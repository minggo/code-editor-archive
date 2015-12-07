/**
 * @module cc
 */
/****************************************************************************
 Copyright (c) 2015 Chukong Technologies Inc.

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

var JS = cc.js;
var SceneGraphHelper = require('./scene-graph-helper');
var SGProto = cc.Node.prototype;
var Destroying = require('../platform/CCObject').Flags.Destroying;
var DirtyFlags = require('./misc').DirtyFlags;

// called after changing parent
function setMaxZOrder (node) {
    var siblings = node._parent.getChildren();
    var z = 0;
    if (siblings.length >= 2) {
        var prevNode = siblings[siblings.length - 2];
        z = prevNode.getOrderOfArrival() + 1;
    }
    node.setOrderOfArrival(z);
    return z;
}

/**
 * A base node for CCENode and CCEScene, it will:
 * - provide the same api with origin cocos2d rendering node (SGNode)
 * - maintains properties of the internal SGNode
 * - retain and release the SGNode
 * - serialize datas for SGNode (but SGNode itself will not being serialized)
 * - notifications if some properties changed
 * - define some interfaces shares between CCENode and CCEScene
 *
 * @class _BaseNode
 * @extends Object
 */
var BaseNode = cc.Class(/** @lends cc.ENode# */{
    extends: cc.Object,

    properties: {

        // SERIALIZABLE

        _name: '',
        _opacity: 255,
        _color: cc.Color.WHITE,
        _cascadeOpacityEnabled: true,
        _cascadeColorEnabled: false,
        _parent: null,
        _anchorPoint: cc.p(0.5, 0.5),
        _contentSize: cc.size(0, 0),
        _children: [],
        _rotationX: 0,
        _rotationY: 0.0,
        _scaleX: 1.0,
        _scaleY: 1.0,
        _position: cc.p(0, 0),
        _skewX: 0,
        _skewY: 0,
        _localZOrder: 0,
        _globalZOrder: 0,
        _ignoreAnchorPointForPosition: false,
        _tag: cc.NODE_TAG_INVALID,
        _opacityModifyRGB: false,

        // API

        /**
         * Name of node
         * @property name
         * @type {String}
         */
        name: {
            get: function () {
                return this._name;
            },
            set: function (value) {
                this._name = value;
            },
        },

        /**
         * Parent node
         * @property name
         * @type {ENode}
         */
        parent: {
            get: function () {
                return this._parent;
            },
            set: function (value) {
                if (this._parent === value) {
                    return;
                }
                var node = this._sgNode;
                if (node._parent) {
                    node._parent.removeChild(node, false);
                }
                if (value) {
                    var parent = value._sgNode;
                    parent.addChild(node);
                    setMaxZOrder(node);
                    value._children.push(this);
                }
                //
                var oldParent = this._parent;
                this._parent = value || null;
                if (oldParent) {
                    if (!(oldParent._objFlags & Destroying)) {
                        var removeAt = oldParent._children.indexOf(this);
                        if (removeAt < 0 && CC_EDITOR) {
                            return cc.error('Internal error, should not remove unknown node from parent.');
                        }
                        oldParent._children.splice(removeAt, 1);
                        this._onHierarchyChanged(oldParent);
                    }
                }
                else if (value) {
                    this._onHierarchyChanged(null);
                }
            },
        },

        /**
         * uuid
         * @property _id
         * @type {String}
         * @private
         */
        _id: {
            default: '',
            editorOnly: true
        },

        /**
         * The uuid for editor, will be stripped before building project
         * @type {String}
         * @readOnly
         */
        uuid: {
            get: function () {
                return this._id || (this._id = Editor.uuid());
            }
        },

        /**
         * Skew x
         * @property skewX
         * @type {Number}
         */
        skewX: {
            get: SGProto.getSkewX,
            set: function (value) {
                this._skewX = value;
                this._sgNode.skewX = value;
            }
        },

        /**
         * Skew y
         * @property skewY
         * @type {Number}
         */
        skewY: {
            get: SGProto.getSkewY,
            set: function (value) {
                this._skewY = value;
                this._sgNode._skewY = value;
            }
        },

        /**
         * Z order in depth which stands for the drawing order.
         * @property zIndex
         * @type {Number}
         */
        zIndex: {
            get: SGProto.getLocalZOrder,
            set: function (value) {
                this._localZOrder = value;
                this._sgNode.zIndex = value;
            }
        },

        /**
         * Rotation of node
         * @property rotation
         * @type {Number}
         */
        rotation: {
            get: SGProto.getRotation,
            set: function (value) {
                this._rotationX = this._rotationY = value;
                this._sgNode.rotation = value;
            },
            tooltip: "The clockwise degrees of rotation relative to the parent"
        },

        /**
         * Rotation on x axis
         * @property rotationX
         * @type {Number}
         */
        rotationX: {
            get: SGProto.getRotationX,
            set: function (value) {
                this._rotationX = value;
                this._sgNode.rotationX = value;
            },
        },

        /**
         * Rotation on y axis
         * @property rotationX
         * @type {Number}
         */
        rotationY: {
            get: SGProto.getRotationY,
            set: function (value) {
                this._rotationY = value;
                this._sgNode.rotationY = value;
            },
        },

        /**
         * Scale on x axis
         * @property scaleX
         * @type {Number}
         */
        scaleX: {
            get: SGProto.getScaleX,
            set: function (value) {
                this._scaleX = value;
                this._sgNode.scaleX = value;
            },
        },

        /**
         * Scale on y axis
         * @property scaleY
         * @type {Number}
         */
        scaleY: {
            get: SGProto.getScaleY,
            set: function (value) {
                this._scaleY = value;
                this._sgNode.scaleY = value;
            },
        },

        /**
         * position of node.
         * @property position
         * @type {Vec2}
         */
        position: {
            get: SGProto.getPosition,
            set: function (value) {
                this._position.x = value.x;
                this._sgNode.x = value.x;

                this._position.y = value.y;
                this._sgNode.y = value.y;
            }
        },

        /**
         * x axis position of node.
         * @property x
         * @type {Number}
         */
        x: {
            get: SGProto.getPositionX,
            set: function (value) {
                this._position.x = value;
                this._sgNode.x = value;
            },
        },

        /**
         * y axis position of node.
         * @property y
         * @type {Number}
         */
        y: {
            get: SGProto.getPositionY,
            set: function (value) {
                this._position.y = value;
                this._sgNode.y = value;
            },
        },

        /**
         * All children nodes
         * @property children
         * @type {ENode[]}
         * @readOnly
         */
        children: {
            get: function () {
                return this._children;
            }
        },

        /**
         * All children nodes.
         * @property childrenCount
         * @type {Number}
         * @readOnly
         */
        childrenCount: {
            get: function () {
                return this._children.length;
            }
        },

        /**
         * Anchor point's position on x axis.
         * @property anchorX
         * @type {Number}
         */
        anchorX: {
            get: SGProto._getAnchorX,
            set: function (value) {
                this._anchorPoint.x = value;
                this._onAnchorChanged();
            },
        },

        /**
         * Anchor point's position on y axis.
         * @property anchorY
         * @type {Number}
         */
        anchorY: {
            get: SGProto._getAnchorY,
            set: function (value) {
                this._anchorPoint.y = value;
                this._onAnchorChanged();
            },
        },

        /**
         * Width of node.
         * @property width
         * @type {Number}
         */
        width: {
            get: function () {
                if (this._sizeProvider) {
                    var w = this._sizeProvider._getWidth();
                    this._contentSize.width = w;
                    return w;
                }
                else {
                    return this._contentSize.width;
                }
            },
            set: function (value) {
                if (this._sizeProvider) {
                    this._sizeProvider.setContentSize(value, this.height);
                }
                this._contentSize.width = value;
                this._onSizeChanged();
            },
        },

        /**
         * Height of node.
         * @property height
         * @type {Number}
         */
        height: {
            get: function () {
                if (this._sizeProvider) {
                    var h = this._sizeProvider._getHeight();
                    this._contentSize.height = h;
                    return h;
                }
                else {
                    return this._contentSize.height;
                }
            },
            set: function (value) {
                if (this._sizeProvider) {
                    this._sizeProvider.setContentSize(this.width, value);
                }
                this._contentSize.height = value;
                this._onSizeChanged();
            },
        },

        //running: {
        //    get: SGProto.isRunning
        //},

        /**
         * Indicate whether ignore the anchor point property for positioning.
         * @property ignoreAnchor
         * @type {Boolean}
         */
        ignoreAnchor: {
            get: SGProto.isIgnoreAnchorPointForPosition,
            set: function (value) {
                this._ignoreAnchorPointForPosition = value;
                this._sgNode.ignoreAnchor = value;
                this._onAnchorChanged();
            },
        },

        /**
         * Tag of node.
         * @property tag
         * @type {Number}
         */
        tag: {
            get: function () {
                return this._tag;
            },
            set: function (value) {
                this._tag = value;
                this._sgNode.tag = value;
            },
        },

        /**
         * Opacity of node, default value is 255.
         * @property tag
         * @type {Number}
         */
        opacity: {
            get: function () {
                return this._opacity;
            },
            set: function (value) {
                this._opacity = value;
                this._sgNode.opacity = value;
                this._onColorChanged();
            },
            range: [0, 255]
        },

        /**
         * Indicate whether node's opacity value affect its child nodes, default value is false.
         * @property cascadeOpacity
         * @type {Boolean}
         */
        cascadeOpacity: {
            get: SGProto.isCascadeOpacityEnabled,
            set: function (value) {
                if (this._cascadeOpacityEnabled !== value) {
                    this._cascadeOpacityEnabled = value;
                    this._sgNode.cascadeOpacity = value;
                    this._onCascadeChanged();
                }
            },
        },

        /**
         * Color of node, default value is white: (255, 255, 255).
         * @property color
         * @type {Color}
         */
        color: {
            get: function () {
                var color = this._color;
                return new cc.Color(color.r, color.g, color.b, color.a);
            },
            set: function (value) {
                var color = this._color;
                color.r = value.r;
                color.g = value.g;
                color.b = value.b;
                if (CC_DEV && value.a !== 255) {
                    cc.warn('Should not set alpha via "color", use "opacity" please.');
                }
                this._sgNode.color = value;
                this._onColorChanged();
            },
        },

        /**
         * Indicate whether node's color value affect its child nodes, default value is false.
         * @property cascadeColor
         * @type {Boolean}
         */
        cascadeColor: {
            get: SGProto.isCascadeColorEnabled,
            set: function (value) {
                if (this._cascadeColorEnabled !== value) {
                    this._cascadeColorEnabled = value;
                    this._sgNode.cascadeColor = value;
                    this._onCascadeChanged();
                }
            },
        },
    },

    ctor: function () {
        // dont reset _id when destroyed
        Object.defineProperty(this, '_id', {
            value: '',
            enumerable: false
        });

        var sgNode = this._sgNode = new cc.Node();
        sgNode.retain();
        if (!cc.game._isCloning) {
            sgNode.cascadeOpacity = true;
        }

        this._dirtyFlags = DirtyFlags.ALL;

        /**
         * Current active scene graph node which provides content size.
         *
         * @property _sizeProvider
         * @type {cc.Node}
         * @private
         */
        this._sizeProvider = null;
    },

    // ABSTRACT INTERFACES

    // called when the node's parent changed
    _onHierarchyChanged: null,
    // called when the node's color or opacity changed
    _onColorChanged: null,
    // called when the node's width or height changed
    _onSizeChanged: null,
    // called when the node's anchor changed
    _onAnchorChanged: null,
    // called when the node's cascadeOpacity or cascadeColor changed
    _onCascadeChanged: null,
    // called when the node's isOpacityModifyRGB changed
    _onOpacityModifyRGBChanged: null,


    /**
     * Initializes the instance of cc.ENode
     * @method init
     * @returns {Boolean} Whether the initialization was successful.
     * @deprecated, no need anymore
     */
    init: function () {
        return true;
    },

    /**
     * <p>Properties configuration function </br>
     * All properties in attrs will be set to the node, </br>
     * when the setter of the node is available, </br>
     * the property will be set via setter function.</br>
     * </p>
     * @method attr
     * @param {Object} attrs - Properties to be set to node
     */
    attr: SGProto.attr,

    //Helper function used by `setLocalZOrder`. Don't use it unless you know what you are doing.
    _setLocalZOrder: function (localZOrder) {
        this._localZOrder = localZOrder;
        this._sgNode._localZOrder = localZOrder;
    },

    /**
     * <p>Defines the oder in which the nodes are renderer.                                                                               <br/>
     * Nodes that have a Global Z Order lower, are renderer first.                                                                        <br/>
     *                                                                                                                                    <br/>
     * In case two or more nodes have the same Global Z Order, the oder is not guaranteed.                                                <br/>
     * The only exception if the Nodes have a Global Z Order == 0. In that case, the Scene Graph order is used.                           <br/>
     *                                                                                                                                    <br/>
     * By default, all nodes have a Global Z Order = 0. That means that by default, the Scene Graph order is used to render the nodes.    <br/>
     *                                                                                                                                    <br/>
     * Global Z Order is useful when you need to render nodes in an order different than the Scene Graph order.                           <br/>
     *                                                                                                                                    <br/>
     * Limitations: Global Z Order can't be used used by Nodes that have SpriteBatchNode as one of their ancestors.                       <br/>
     * And if ClippingNode is one of the ancestors, then "global Z order" will be relative to the ClippingNode.   </p>
     * @method setGlobalZOrder
     * @param {Number} globalZOrder
     */
    setGlobalZOrder: function (globalZOrder) {
        this._globalZOrder = globalZOrder;
        this._sgNode.setGlobalZOrder(globalZOrder);
    },

    /**
     * Return the Node's Global Z Order.
     * @method getGlobalZOrder
     * @returns {number} The node's global Z order
     */
    getGlobalZOrder: SGProto.getGlobalZOrder,

    /**
     * Returns the scale factor of the node.
     * @warning: Assertion will fail when _scaleX != _scaleY.
     * @method getScale
     * @return {Number} The scale factor
     */
    getScale: SGProto.getScale,

    /**
     * Sets the scale factor of the node. 1.0 is the default scale factor. This function can modify the X and Y scale at the same time.
     * @method setScale
     * @param {Number} scale - or scaleX value
     * @param {Number} [scaleY=]
     */
    setScale: function (scale, scaleY) {
        if (scale instanceof cc.Vec2) {
            scaleY = scale.y;
            scale = scale.x
        }

        this._scaleX = scale;
        this._scaleY = (scaleY || scaleY === 0) ? scaleY : scale;
        this._sgNode.setScale(scale, scaleY);
    },

    /**
     * <p>Returns a copy of the position (x,y) of the node in cocos2d coordinates. (0,0) is the left-bottom corner.</p>
     * @method getPosition
     * @return {Vec2} The position (x,y) of the node in OpenGL coordinates
     */
    getPosition: SGProto.getPosition,

    /**
     * <p>
     *     Changes the position (x,y) of the node in cocos2d coordinates.<br/>
     *     The original point (0,0) is at the left-bottom corner of screen.<br/>
     *     Usually we use cc.p(x,y) to compose CCPoint object.<br/>
     *     and Passing two numbers (x,y) is more efficient than passing CCPoint object.
     * </p>
     * @method setPosition
     * @param {Vec2|Number} newPosOrxValue - The position (x,y) of the node in coordinates or the X coordinate for position
     * @param {Number} [yValue] - Y coordinate for position
     * @example {@link utils/api/cocos/docs/cocos2d/core/utils/node-wrapper/setPosition.js}
     */
    setPosition: function (newPosOrxValue, yValue) {
        var locPosition = this._position;
        if (yValue === undefined) {
            if(locPosition.x === newPosOrxValue.x && locPosition.y === newPosOrxValue.y)
                return;
            locPosition.x = newPosOrxValue.x;
            locPosition.y = newPosOrxValue.y;
        } else {
            if(locPosition.x === newPosOrxValue && locPosition.y === yValue)
                return;
            locPosition.x = newPosOrxValue;
            locPosition.y = yValue;
        }
        this._sgNode.setPosition(newPosOrxValue, yValue);
    },

    /**
     *  <p>Returns a copy of the anchor point.<br/>
     *  Anchor point is the point around which all transformations and positioning manipulations take place.<br/>
     *  It's like a pin in the node where it is "attached" to its parent. <br/>
     *  The anchorPoint is normalized, like a percentage. (0,0) means the bottom-left corner and (1,1) means the top-right corner. <br/>
     *  But you can use values higher than (1,1) and lower than (0,0) too.  <br/>
     *  The default anchor point is (0.5,0.5), so it starts at the center of the node. <br/></p>
     * @method getAnchorPoint
     * @return {Vec2} The anchor point of node.
     */
    getAnchorPoint: SGProto.getAnchorPoint,

    /**
     * <p>
     *     Sets the anchor point in percent.                                                                                              <br/>
     *                                                                                                                                    <br/>
     *     anchor point is the point around which all transformations and positioning manipulations take place.                            <br/>
     *     It's like a pin in the node where it is "attached" to its parent.                                                              <br/>
     *     The anchorPoint is normalized, like a percentage. (0,0) means the bottom-left corner and (1,1) means the top-right corner.     <br/>
     *     But you can use values higher than (1,1) and lower than (0,0) too.                                                             <br/>
     *     The default anchor point is (0.5,0.5), so it starts at the center of the node.
     * </p>
     * @method setAnchorPoint
     * @param {Vec2|Number} point - The anchor point of node or The x axis anchor of node.
     * @param {Number} [y] - The y axis anchor of node.
     */
    setAnchorPoint: function (point, y) {
        var locAnchorPoint = this._anchorPoint;
        if (y === undefined) {
            if ((point.x === locAnchorPoint.x) && (point.y === locAnchorPoint.y))
                return;
            locAnchorPoint.x = point.x;
            locAnchorPoint.y = point.y;
        } else {
            if ((point === locAnchorPoint.x) && (y === locAnchorPoint.y))
                return;
            locAnchorPoint.x = point;
            locAnchorPoint.y = y;
        }
        this._onAnchorChanged();
    },

    /**
     * Returns a copy of the anchor point in absolute pixels.  <br/>
     * you can only read it. If you wish to modify it, use setAnchorPoint
     * @see cc.ENode#getAnchorPoint
     * @method getAnchorPointInPoints
     * @return {Vec2} The anchor point in absolute pixels.
     */
    getAnchorPointInPoints: function () {
        return this._sgNode.getAnchorPointInPoints();
    },

    /**
     * <p>Returns a copy the untransformed size of the node. <br/>
     * The contentSize remains the same no matter the node is scaled or rotated.<br/>
     * All nodes has a size. Layer and Scene has the same size of the screen by default. <br/></p>
     * @method getContentSize
     * @param {Boolean} [ignoreSizeProvider=false] - true if you need to get the original size of the node
     * @return {Size} The untransformed size of the node.
     */
    getContentSize: function (ignoreSizeProvider) {
        if (this._sizeProvider && !ignoreSizeProvider) {
            var size = this._sizeProvider.getContentSize();
            this._contentSize = size;
            return size;
        }
        else {
            return cc.size(this._contentSize);
        }
    },

    /**
     * <p>
     *     Sets the untransformed size of the node.                                             <br/>
     *                                                                                          <br/>
     *     The contentSize remains the same no matter the node is scaled or rotated.            <br/>
     *     All nodes has a size. Layer and Scene has the same size of the screen.
     * </p>
     * @method setContentSize
     * @param {Size|Number} size - The untransformed size of the node or The untransformed size's width of the node.
     * @param {Number} [height] - The untransformed size's height of the node.
     */
    setContentSize: function (size, height) {
        var locContentSize = this._contentSize;
        if (height === undefined) {
            if ((size.width === locContentSize.width) && (size.height === locContentSize.height))
                return;
            locContentSize.width = size.width;
            locContentSize.height = size.height;
        } else {
            if ((size === locContentSize.width) && (height === locContentSize.height))
                return;
            locContentSize.width = size;
            locContentSize.height = height;
        }
        if (this._sizeProvider) {
            this._sizeProvider.setContentSize(locContentSize);
        }
        this._onSizeChanged();
    },

    /**
     * Returns a "local" axis aligned bounding box of the node. <br/>
     * The returned box is relative only to its parent.
     * @method getBoundingBox
     * @return {Rect} The calculated bounding box of the node
     */
    getBoundingBox: function () {
        return this._sgNode.getBoundingBox();
    },

    /**
     * Stops all running actions and schedulers
     * @method cleanup
     */
    cleanup: function () {
        //// actions
        //this.stopAllActions();
        //this.unscheduleAllCallbacks();
        //
        //// event
        //cc.eventManager.removeListeners(this);

        // children
        SGProto._arrayMakeObjectsPerformSelector(this._children, cc.Node._stateCallbackType.cleanup);
    },

    // composition: GET

    /**
     * Returns a child from the container given its tag
     * @method getChildByTag
     * @param {Number} aTag - An identifier to find the child node.
     * @return {ENode} a CCNode object whose tag equals to the input parameter
     */
    getChildByTag: SGProto.getChildByTag,

    /**
     * Returns a child from the container given its name
     * @method getChildByName
     * @param {String} name - A name to find the child node.
     * @return {ENode} a CCNode object whose name equals to the input parameter
     */
    getChildByName: SGProto.getChildByName,

    // composition: ADD

    /** <p>"add" logic MUST only be in this method <br/> </p>
     *
     * <p>If the child is added to a 'running' node, then 'onEnter' and 'onEnterTransitionDidFinish' will be called immediately.</p>
     * @method addChild
     * @param {ENode} child - A child node
     * @param {Number} [localZOrder=] - Z order for drawing priority. Please refer to setZOrder(int)
     * @param {Number|String} [tag=] - An integer or a name to identify the node easily. Please refer to setTag(int) and setName(string)
     */
    addChild: function (child, localZOrder, tag) {
        localZOrder = localZOrder === undefined ? child._localZOrder : localZOrder;
        var name, setTag = false;
        if(cc.js.isUndefined(tag)){
            tag = undefined;
            name = child._name;
        } else if(cc.js.isString(tag)){
            name = tag;
            tag = undefined;
        } else if(cc.js.isNumber(tag)){
            setTag = true;
            name = "";
        }

        cc.assert(child, cc._LogInfos.Node.addChild_3);
        cc.assert(child._parent === null, "child already added. It can't be added again");

        this._addChildHelper(child, localZOrder, tag, name, setTag);
    },

    _addChildHelper: function(child, localZOrder, tag, name, setTag){
        this._insertChild(child, localZOrder);
        if (setTag)
            child.setTag(tag);
        else
            child.setName(name);

        //if( this._running ){
        //    child.onEnter();
        //    // prevent onEnterTransitionDidFinish to be called twice when a node is added in onEnter
        //    if (this._isTransitionFinished)
        //        child.onEnterTransitionDidFinish();
        //}
        //if (this._cascadeColorEnabled)
        //    child._renderCmd.setDirtyFlag(cc.Node._dirtyFlags.colorDirty);
        //if (this._cascadeOpacityEnabled)
        //    child._renderCmd.setDirtyFlag(cc.Node._dirtyFlags.opacityDirty);
    },

    _insertChild: function (child, z) {
        child.parent = this;
        child._setLocalZOrder(z);
    },

    // composition: REMOVE

    /**
     * Remove itself from its parent node. If cleanup is true, then also remove all actions and callbacks. <br/>
     * If the cleanup parameter is not passed, it will force a cleanup. <br/>
     * If the node orphan, then nothing happens.
     * @method removeFromParent
     * @param {Boolean} [cleanup=true] - true if all actions and callbacks on this node should be removed, false otherwise.
     * @see cc.ENode#removeFromParentAndCleanup
     */
    removeFromParent: function (cleanup) {
        if (this._parent) {
            if (cleanup === undefined)
                cleanup = true;
            this._parent.removeChild(this, cleanup);
        }
    },

    /** <p>Removes a child from the container. It will also cleanup all running actions depending on the cleanup parameter. </p>
     * If the cleanup parameter is not passed, it will force a cleanup. <br/>
     * <p> "remove" logic MUST only be on this method  <br/>
     * If a class wants to extend the 'removeChild' behavior it only needs <br/>
     * to override this method </p>
     * @method removeChild
     * @param {ENode} child - The child node which will be removed.
     * @param {Boolean} [cleanup=true] - true if all running actions and callbacks on the child node will be cleanup, false otherwise.
     */
    removeChild: function (child, cleanup) {
        // explicit nil handling
        if (this._children.length === 0)
            return;

        if (cleanup === undefined)
            cleanup = true;
        if (this._children.indexOf(child) > -1)
            this._detachChild(child, cleanup);
    },

    /**
     * Removes a child from the container by tag value. It will also cleanup all running actions depending on the cleanup parameter.
     * If the cleanup parameter is not passed, it will force a cleanup. <br/>
     * @method removeChildByTag
     * @param {Number} tag - An integer number that identifies a child node
     * @param {Boolean} [cleanup=true] - true if all running actions and callbacks on the child node will be cleanup, false otherwise.
     * @see cc.ENode#removeChildByTag
     */
    removeChildByTag: function (tag, cleanup) {
        if (tag === cc.NODE_TAG_INVALID)
            cc.log(cc._LogInfos.Node.removeChildByTag);

        var child = this.getChildByTag(tag);
        if (!child)
            cc.log(cc._LogInfos.Node.removeChildByTag_2, tag);
        else
            this.removeChild(child, cleanup);
    },

    /**
     * Removes all children from the container and do a cleanup all running actions depending on the cleanup parameter. <br/>
     * If the cleanup parameter is not passed, it will force a cleanup. <br/>
     * @method removeAllChildren
     * @param {Boolean} [cleanup=true] - true if all running actions on all children nodes should be cleanup, false otherwise.
     */
    removeAllChildren: function (cleanup) {
        // not using detachChild improves speed here
        var children = this._children;
        if (cleanup === undefined)
            cleanup = true;
        for (var i = 0; i < children.length; i++) {
            var node = children[i];
            if (node) {
                //if (this._running) {
                //    node.onExitTransitionDidStart();
                //    node.onExit();
                //}

                // If you don't do cleanup, the node's actions will not get removed and the
                if (cleanup)
                    node.cleanup();

                node.parent = null;
            }
        }
        this._children.length = 0;
    },

    _detachChild: function (child, doCleanup) {
        // IMPORTANT:
        //  - 1st do onExit
        //  - 2nd cleanup
        //if (this._running) {
        //    child.onExitTransitionDidStart();
        //    child.onExit();
        //}

        // If you don't do cleanup, the child's actions will not get removed and the
        if (doCleanup)
            child.cleanup();

        child.parent = null;
        cc.js.array.remove(this._children, child);
    },

    setNodeDirty: function(){
        this._sgNode.setNodeDirty();
    },

    /**
     * Returns the matrix that transform parent's space coordinates to the node's (local) space coordinates.<br/>
     * The matrix is in Pixels.
     * @method getParentToNodeTransform
     * @return {AffineTransform}
     */
    getParentToNodeTransform: function () {
        return this._sgNode.getParentToNodeTransform();
    },

    /**
     * Returns the world affine transform matrix. The matrix is in Pixels.
     * @method getNodeToWorldTransform
     * @return {AffineTransform}
     */
    getNodeToWorldTransform: function () {
        return this._sgNode.getNodeToWorldTransform();
    },

    /**
     * Returns the inverse world affine transform matrix. The matrix is in Pixels.
     * @method getWorldToNodeTransform
     * @return {AffineTransform}
     */
    getWorldToNodeTransform: function () {
        return this._sgNode.getWorldToNodeTransform();
    },

    /**
     * Converts a Point to node (local) space coordinates. The result is in Points.
     * @method convertToNodeSpace
     * @param {Vec2} worldPoint
     * @return {Vec2}
     */
    convertToNodeSpace: function (worldPoint) {
        return this._sgNode.convertToNodeSpace(worldPoint);
    },

    /**
     * Converts a Point to world space coordinates. The result is in Points.
     * @method convertToWorldSpace
     * @param {Vec2} nodePoint
     * @return {Vec2}
     */
    convertToWorldSpace: function (nodePoint) {
        return this._sgNode.convertToWorldSpace(nodePoint);
    },

    /**
     * Converts a Point to node (local) space coordinates. The result is in Points.<br/>
     * treating the returned/received node point as anchor relative.
     * @method convertToNodeSpaceAR
     * @param {Vec2} worldPoint
     * @return {Vec2}
     */
    convertToNodeSpaceAR: function (worldPoint) {
        return this._sgNode.convertToNodeSpaceAR(worldPoint);
    },

    /**
     * Converts a local Point to world space coordinates.The result is in Points.<br/>
     * treating the returned/received node point as anchor relative.
     * @method convertToWorldSpaceAR
     * @param {Vec2} nodePoint
     * @return {Vec2}
     */
    convertToWorldSpaceAR: function (nodePoint) {
        return this._sgNode.convertToWorldSpaceAR(nodePoint);
    },

    _convertToWindowSpace: function (nodePoint) {
        return this._sgNode._convertToWindowSpace(nodePoint);
    },

    /**
     * convenience methods which take a cc.Touch instead of cc.Vec2
     * @method convertTouchToNodeSpace
     * @param {Touch} touch - The touch object
     * @return {Vec2}
     */
    convertTouchToNodeSpace: function (touch) {
        return this._sgNode.convertTouchToNodeSpace(touch)
    },

    /**
     * converts a cc.Touch (world coordinates) into a local coordinate. This method is AR (Anchor Relative).
     * @method convertTouchToNodeSpaceAR
     * @param {Touch} touch - The touch object
     * @return {Vec2}
     */
    convertTouchToNodeSpaceAR: function (touch) {
        return this._sgNode.convertTouchToNodeSpaceAR(touch);
    },

    /**
     * Returns the matrix that transform the node's (local) space coordinates into the parent's space coordinates.<br/>
     * The matrix is in Pixels.
     * @method getNodeToParentTransform
     * @return {AffineTransform} The affine transform object
     */
    getNodeToParentTransform: function (ancestor) {
        return this._sgNode.getNodeToParentTransform();
    },

    /**
     * Returns a "world" axis aligned bounding box of the node.
     * @method getBoundingBoxToWorld
     * @return {Rect}
     */
    getBoundingBoxToWorld: function () {
        return this._sgNode.getBoundingBoxToWorld();
    },

    _getBoundingBoxToCurrentNode: function (parentTransform) {
        return this._sgNode._getBoundingBoxToCurrentNode(parentTransform);
    },

    /**
     * Returns the displayed opacity of Node,
     * the difference between displayed opacity and opacity is that displayed opacity is calculated based on opacity and parent node's opacity when cascade opacity enabled.
     * @method getDisplayedOpacity
     * @returns {number} displayed opacity
     */
    getDisplayedOpacity: function () {
        return this._sgNode.getDisplayedOpacity();
    },

    /**
     * Update displayed opacity
     * @method
     * @param {Number} parentOpacity
     */
    _updateDisplayedOpacity: function (parentOpacity) {
        this._sgNode.updateDisplayedOpacity(parentOpacity);
    },

    /**
     * Returns the displayed color of Node,
     * the difference between displayed color and color is that displayed color is calculated based on color and parent node's color when cascade color enabled.
     * @method getDisplayedColor
     * @returns {Color}
     */
    getDisplayedColor: function () {
        return this._sgNode.getDisplayedColor();
    },

    /**
     * Update the displayed color of Node
     * @method
     * @param {Color} parentColor
     */
    _updateDisplayedColor: function (parentColor) {
        this._sgNode._updateDisplayedColor(parentColor);
    },

    /**
     * Set whether color should be changed with the opacity value,
     * useless in cc.Node, but this function is override in some class to have such behavior.
     * @method setOpacityModifyRGB
     * @param {Boolean} opacityValue
     */
    setOpacityModifyRGB: function (opacityValue) {
        if (this._opacityModifyRGB !== opacityValue) {
            this._opacityModifyRGB = opacityValue;
            this._sgNode.setOpacityModifyRGB(opacityValue);
            this._onOpacityModifyRGBChanged();
        }
    },

    /**
     * Get whether color should be changed with the opacity value
     * @method isOpacityModifyRGB
     * @return {Boolean}
     */
    isOpacityModifyRGB: function () {
        return this._opacityModifyRGB;
    },

    // HIERARCHY METHODS

    /**
     * Get the sibling index.
     *
     * @method getSiblingIndex
     * @return {number}
     */
    getSiblingIndex: function () {
        if (this._parent) {
            return this._parent._children.indexOf(this);
        }
        else {
            return 0;
        }
    },

    /**
     * Set the sibling index of this node.
     *
     * @method setSiblingIndex
     * @param {Number} index
     */
    setSiblingIndex: function (index) {
        if (!this._parent) {
            return;
        }
        var array = this._parent._children;
        index = index !== -1 ? index : array.length - 1;
        var oldIndex = array.indexOf(this);
        if (index !== oldIndex) {
            array.splice(oldIndex, 1);
            if (index < array.length) {
                array.splice(index, 0, this);
            }
            else {
                array.push(this);
            }

            // update rendering scene graph, sort them by arrivalOrder
            var siblings = this._parent._children;
            for (var i = 0, len = siblings.length; i < len; i++) {
                var sibling = siblings[i];
                sibling._sgNode.arrivalOrder = i;
            }
            cc.renderer.childrenOrderDirty = this._parent._sgNode._reorderChildDirty = true;
        }
    },

    /**
     * Is this node a child of the given node?
     *
     * @method isChildOf
     * @param {ENode} parent
     * @return {Boolean} - Returns true if this node is a child, deep child or identical to the given node.
     */
    isChildOf: function (parent) {
        var child = this;
        do {
            if (child === parent) {
                return true;
            }
            child = child._parent;
        }
        while (child);
        return false;
    },

    // The deserializer for sgNode which will be called before components onLoad
    _onBatchCreated: function () {
        var sgNode = this._sgNode;
        sgNode.setOpacity(this._opacity);
        sgNode.setColor(this._color);
        sgNode.setCascadeOpacityEnabled(this._cascadeOpacityEnabled);
        sgNode.setCascadeColorEnabled(this._cascadeColorEnabled);
        sgNode.setRotationX(this._rotationX);
        sgNode.setRotationY(this._rotationY);
        sgNode.setScale(this._scaleX, this._scaleY);
        sgNode.setPosition(this._position);
        sgNode.setSkewX(this._skewX);
        sgNode.setSkewY(this._skewY);
        sgNode.setLocalZOrder(this._localZOrder);
        sgNode.setGlobalZOrder(this._globalZOrder);
        sgNode.ignoreAnchorPointForPosition(this._ignoreAnchorPointForPosition);
        sgNode.setTag(this._tag);
        sgNode.setOpacityModifyRGB(this._opacityModifyRGB);

        if (this._parent) {
            this._parent._sgNode.addChild(sgNode);
        }

        var children = this._children;
        for (var i = 0, len = children.length; i < len; i++) {
            children[i]._onBatchCreated();
        }
    },

    _removeSgNode: SceneGraphHelper.removeSgNode,
});


(function () {

    // Define public getter and setter methods to ensure api compatibility.

    var SameNameGetSets = ['name', 'skewX', 'skewY', 'rotation', 'rotationX', 'rotationY',
                           'scale', 'scaleX', 'scaleY', 'children', 'childrenCount', 'parent', 'running',
                           /*'actionManager',*/ 'scheduler', /*'shaderProgram',*/ 'opacity', 'color', 'tag'];
    var DiffNameGetSets = {
        x: ['getPositionX', 'setPositionX'],
        y: ['getPositionY', 'setPositionY'],
        zIndex: ['getLocalZOrder', 'setLocalZOrder'],
        //running: ['isRunning'],
        ignoreAnchor: ['isIgnoreAnchorPointForPosition', 'ignoreAnchorPointForPosition'],
        opacityModifyRGB: ['isOpacityModifyRGB'],
        cascadeOpacity: ['isCascadeOpacityEnabled', 'setCascadeOpacityEnabled'],
        cascadeColor: ['isCascadeColorEnabled', 'setCascadeColorEnabled'],
        //// privates
        //width: ['_getWidth', '_setWidth'],
        //height: ['_getHeight', '_setHeight'],
        //anchorX: ['_getAnchorX', '_setAnchorX'],
        //anchorY: ['_getAnchorY', '_setAnchorY'],
    };
    var propName, np = BaseNode.prototype;
    for (var i = 0; i < SameNameGetSets.length; i++) {
        propName = SameNameGetSets[i];
        var suffix = propName[0].toUpperCase() + propName.slice(1);
        var pd = Object.getOwnPropertyDescriptor(np, propName);
        if (pd) {
            if (pd.get) np['get' + suffix] = pd.get;
            if (pd.set) np['set' + suffix] = pd.set;
        }
        else {
            JS.getset(np, propName, np['get' + suffix], np['set' + suffix]);
        }
    }
    for (propName in DiffNameGetSets) {
        var getset = DiffNameGetSets[propName];
        var pd = Object.getOwnPropertyDescriptor(np, propName);
        if (pd) {
            np[getset[0]] = pd.get;
            if (getset[1]) np[getset[1]] = pd.set;
        }
        else {
            JS.getset(np, propName, np[getset[0]], np[getset[1]]);
        }
    }
})();

/**
 * Scale of node
 * @property scale
 * @type {Number}
 */

/**
 * <p>Sets the x axis position of the node in cocos2d coordinates.</p>
 * @method getPositionX
 * @param {Number} x - The new position in x axis
 */

/**
 * <p>Returns the x axis position of the node in cocos2d coordinates.</p>
 * @method setPositionX
 * @return {Number}
 */

/**
 * <p>Returns the y axis position of the node in cocos2d coordinates.</p>
 * @method getPositionY
 * @return {Number}
 */

/**
 * <p>Sets the y axis position of the node in cocos2d coordinates.</p>
 * @method setPositionY
 * @param {Number} y - The new position in y axis
 */

/**
 * Returns the local Z order of this node.
 * @method getLocalZOrder
 * @returns {Number} The local (relative to its siblings) Z order.
 */

/**
 * <p> LocalZOrder is the 'key' used to sort the node relative to its siblings.                                    <br/>
 *                                                                                                                 <br/>
 * The Node's parent will sort all its children based ont the LocalZOrder value.                                   <br/>
 * If two nodes have the same LocalZOrder, then the node that was added first to the children's array              <br/>
 * will be in front of the other node in the array.                                                                <br/>
 * <br/>
 * Also, the Scene Graph is traversed using the "In-Order" tree traversal algorithm ( http://en.wikipedia.org/wiki/Tree_traversal#In-order )
 * <br/>
 * And Nodes that have LocalZOder values < 0 are the "left" subtree                                                 <br/>
 * While Nodes with LocalZOder >=0 are the "right" subtree.    </p>
 * @method setLocalZOrder
 * @param {Number} localZOrder
 */

/**
 * Returns whether the anchor point will be ignored when you position this node.<br/>
 * When anchor point ignored, position will be calculated based on the origin point (0, 0) in parent's coordinates.
 * @method isIgnoreAnchorPointForPosition
 * @return {Boolean} true if the anchor point will be ignored when you position this node.
 */

/**
 * <p>
 *     Sets whether the anchor point will be ignored when you position this node.                              <br/>
 *     When anchor point ignored, position will be calculated based on the origin point (0, 0) in parent's coordinates.  <br/>
 *     This is an internal method, only used by CCLayer and CCScene. Don't call it outside framework.        <br/>
 *     The default value is false, while in CCLayer and CCScene are true
 * </p>
 * @method ignoreAnchorPointForPosition
 * @param {Boolean} newValue - true if anchor point will be ignored when you position this node
 */

/**
 * Returns whether node's opacity value affect its child nodes.
 * @method isCascadeOpacityEnabled
 * @returns {Boolean}
 */

/**
 * Enable or disable cascade opacity, if cascade enabled, child nodes' opacity will be the multiplication of parent opacity and its own opacity.
 * @method setCascadeOpacityEnabled
 * @param {Boolean} cascadeOpacityEnabled
 */

/**
 * Returns whether node's color value affect its child nodes.
 * @method isCascadeColorEnabled
 * @returns {Boolean}
 */

/**
 * Enable or disable cascade color, if cascade enabled, child nodes' opacity will be the cascade value of parent color and its own color.
 * @method setCascadeColorEnabled
 * @param {Boolean} cascadeColorEnabled
 */


cc._BaseNode = module.exports = BaseNode;
