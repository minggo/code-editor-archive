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

/**
 * Enum for transition type
 * @enum EButton.Transition
 */
var Transition = cc.Enum({
    /**
     * @property {Number} NONE
     */
    NONE: 0,

    /**
     * @property {Number} COLOR
     */
    COLOR: 1,

    /**
     * @property {Number} SPRITE
     */
    SPRITE: 2
});

/**
 * Click event will register a event to target component's handler.
 * And will trigger when a click event emit
 *
 * @class EButton.ClickEvent
 */
var ClickEvent = cc.Class({
    name: 'cc.ClickEvent',
    properties: {
        /**
         * Event target
         * @property {cc.ENode}
         * @default null
         */
        target: {
            default: null,
            type: cc.ENode
        },
        /**
         * Component name
         * @property {String}
         * @default ''
         */
        component: {
            default: ''
        },
        /**
         * Event handler
         * @property {String}
         * @default ''
         */
        handler: {
            default: ''
        }
    }
});

var WHITE = cc.Color.WHITE;

var ButtonState = {
    Normal: 'normal',
    Pressed: 'pressed',
    Hover: 'hover',
    Disabled: 'disabled'
};

var EVENT_TOUCH_DOWN = 'touch-down';
var EVENT_TOUCH_UP = 'touch-up';
var EVENT_HOVER_IN = 'hover-in';
var EVENT_HOVER_MOVE = 'hover-move';
var EVENT_HOVER_OUT = 'hover-out';

/**
 * Button has 3 Transition types
 * When Button state changed:
 *  If Transition type is EButton.Transition.NONE, Button will do nothing
 *  If Transition type is EButton.Transition.COLOR, Button will change target's color
 *  If Transition type is EButton.Transition.SPRITE, Button will change target SpriteRenderer's sprite
 *
 * Button will trigger 5 events:
 *  EButton.EVENT_TOUCH_DOWN
 *  EButton.EVENT_TOUCH_UP
 *  EButton.EVENT_HOVER_IN
 *  EButton.EVENT_HOVER_MOVE
 *  EButton.EVENT_HOVER_OUT
 *
 * @class EButton
 * @extends Component
 */
var Button = cc.Class({
    name: 'cc.Button',
    extends: require('./CCComponent'),

    ctor: function () {
        this._touchListener = null;
        this._mouseListener = null;

        this._pressed = false;
        this._hovered = false;

        this._sprite = null;

        this._fromColor = null;
        this._toColor = null;
        this._time = 0;
        this._tarnsitionFinished = true;
    },

    editor: CC_EDITOR && {
        menu: 'UI/Button',
        inspector: 'app://editor/page/inspector/button/button.html',
        executeInEditMode: true
    },

    properties: {
        /**
         * Whether the Button is disabled.
         * If true, the Button will trigger event and do transition.
         * @property {Boolean} interactable
         * @default true
         */
        interactable: {
            default: true,
            notify: function () {
                this._initState();
            }
        },

        /**
         * Transition type
         * @property {EButton.Transition} transition
         * @default EButton.Transition.Node
         */
        transition: {
            default: Transition.NONE,
            type: Transition
        },

        // color transition

        /**
         * Normal state color
         * @property {cc.Color} normalColor
         */
        normalColor: {
            default: WHITE,
            displayName: 'Normal',
            notify: function () {
                this._initState();
            }
        },

        /**
         * Pressed state color
         * @property {cc.Color} pressedColor
         */
        pressedColor: {
            default: WHITE,
            displayName: 'Pressed'
        },

        /**
         * Hover state color
         * @property {cc.Color} hoverColor
         */
        hoverColor: {
            default: WHITE,
            displayName: 'Hover'
        },

        /**
         * Disabled state color
         * @property {cc.Color} disabledColor
         */
        disabledColor: {
            default: WHITE,
            displayName: 'Disabled',
            notify: function () {
                this._initState();
            }
        },

        /**
         * Color transition duration
         * @property {float} duration
         */
        duration: {
            default: 0.1,
            range: [0, Number.MAX_VALUE]
        },

        // sprite transition
        /**
         * Normal state sprite
         * @property {cc.SpriteFrame} normalSprite
         */
        normalSprite: {
            default: null,
            type: cc.SpriteFrame,
            displayName: 'Normal',
            notify: function () {
                this._initState();
            }
        },

        /**
         * Pressed state sprite
         * @property {cc.SpriteFrame} pressedSprite
         */
        pressedSprite: {
            default: null,
            type: cc.SpriteFrame,
            displayName: 'Pressed',
        },

        /**
         * Hover state sprite
         * @property {cc.SpriteFrame} hoverSprite
         */
        hoverSprite: {
            default: null,
            type: cc.SpriteFrame,
            displayName: 'Hover',
        },

        /**
         * Disabled state sprite
         * @property {cc.SpriteFrame} disabledSprite
         */
        disabledSprite: {
            default: null,
            type: cc.SpriteFrame,
            displayName: 'Disabled',
            notify: function () {
                this._initState();
            }
        },

        /**
         * Transition target.
         * When Button state changed:
         *  If Transition type is EButton.Transition.NONE, Button will do nothing
         *  If Transition type is EButton.Transition.COLOR, Button will change target's color
         *  If Transition type is EButton.Transition.SPRITE, Button will change target SpriteRenderer's sprite
         * @property {cc.ENode} target
         */
        target: {
            default: null,
            type: cc.ENode,

            notify: function () {
                this._applyTarget();
            }
        },

        /**
         * If Button is clicked, will trigger event's handler
         * @property {[EButton.ClickEvent]} clickEvents
         */
        clickEvents: {
            default: [],
            type: ClickEvent
        }
    },

    statics: {
        /**
         * Touch down event
         * @property {String} EVENT_TOUCH_DOWN
         */
        EVENT_TOUCH_DOWN: EVENT_TOUCH_DOWN,
        /**
         * Touch up event
         * @property {String} EVENT_TOUCH_UP
         */
        EVENT_TOUCH_UP: EVENT_TOUCH_UP,
        /**
         * Hover in event
         * @property {String} EVENT_HOVER_IN
         */
        EVENT_HOVER_IN: EVENT_HOVER_IN,
        /**
         * Hover move event
         * @property {String} EVENT_HOVER_MOVE
         */
        EVENT_HOVER_MOVE: EVENT_HOVER_MOVE,
        /**
         * Hover out event
         * @property {String} EVENT_HOVER_OUT
         */
        EVENT_HOVER_OUT: EVENT_HOVER_OUT,

        Transition: Transition,
        ClickEvent: ClickEvent
    },

    onLoad: function () {
        if (!this.target) {
            this.target = this.node;
        }

        if (!CC_EDITOR) {
            this._registerEvent();
            this._registerListeners();
        }
    },

    start: function () {
        this._applyTarget();
        this._initState();
    },

    onDestroy: function () {
        if (this._touchListener) cc.eventManager.removeListener(this._touchListener);
        if (this._mouseListener) cc.eventManager.removeListener(this._mouseListener);
    },

    update: function (dt) {
        var target = this.target;
        if (!this.transition === Transition.COLOR || !target || this._tarnsitionFinished) return;

        this.time += dt;
        var ratio = this.time / this.duration;
        if (ratio > 1) {
            ratio = 1;
            this._tarnsitionFinished = true;
        }

        target.color = this._fromColor.lerp(this._toColor, ratio);
    },

    _registerEvent: function () {
        this._touchListener = cc.EventListener.create({
            event: cc.EventListener.TOUCH_ONE_BY_ONE,
            swallowTouches: true,
            onTouchBegan: this._onTouchBegan.bind(this),
            onTouchEnded: this._onTouchEnded.bind(this)
        });
        cc.eventManager.addListener(this._touchListener, this.node._sgNode);

        if (!cc.sys.isMobile) {
            this._mouseListener = cc.EventListener.create({
                event: cc.EventListener.MOUSE,
                onMouseMove: this._onMouseMove.bind(this)
            });
            cc.eventManager.addListener(this._mouseListener, this.node._sgNode);
        }
    },

    _registerListeners: function () {
        var events = this.clickEvents;
        for (var i = 0, l = events.length; i < l; i++) {
            var event = events[i];
            var target = event.target;
            if (!target) continue;

            var comp = target.getComponent(event.component);
            if (!comp) continue;

            var handler = comp[event.handler];
            if (!handler) continue;

            this.on(EVENT_TOUCH_UP, handler.bind(comp));
        }
    },

    _applyTarget: function () {
        var target = this.target;
        if (target) {
            this._sprite = target.getComponent(cc.SpriteRenderer);
        }
        else {
            this._sprite = null;
        }
    },

    _initState: function () {
        var state = this.interactable ? ButtonState.Normal : ButtonState.Disabled;
        this._applyState(state);
    },

    // touch event handler
    _onTouchBegan: function (touch) {
        if (!this.interactable) return false;

        var hit = this._hitTest(touch.getLocation());
        if (hit) {
            this._pressed = true;
            this._applyState(ButtonState.Pressed);
            this.emit(EVENT_TOUCH_DOWN);
        }

        return hit;
    },

    _onTouchEnded: function () {
        if (this._hovered)
            this._applyState(ButtonState.Hover);
        else
            this._applyState(ButtonState.Normal);

        this.emit(EVENT_TOUCH_UP);
        this._pressed = false;
    },

    _onMouseMove: function (event) {
        if (this._pressed || !this.interactable) return;

        var hit = this._hitTest(event.getLocation());
        if (hit) {
            if (!this._hovered) {
                this._hovered = true;
                this._applyState(ButtonState.Hover);
                this.emit(EVENT_HOVER_IN);
            }
            this.emit(EVENT_HOVER_MOVE);
        }
        else if (this._hovered) {
            this._hovered = false;
            this._applyState(ButtonState.Normal);
            this.emit(EVENT_HOVER_OUT);
        }
    },

    // state handler
    _applyState: function (state) {
        var color  = this[state + 'Color'];
        var sprite = this[state + 'Sprite'];

        this._applyTransition(color, sprite);
    },
    _applyTransition: function (color, sprite) {
        var transition = this.transition;

        if (transition === Transition.COLOR) {
            var target = this.target;

            if (CC_EDITOR) {
                target.color = color;
            }
            else {
                this._fromColor = target.color.clone();
                this._toColor = color;
                this.time = 0;
                this._tarnsitionFinished = false;
            }
        }
        else if (transition === Transition.SPRITE && this._sprite && sprite) {
            this._sprite.sprite = sprite;
        }
    },

    // hit test
    _hitTest: function (pos) {
        var target = this.target;
        if (!target) return false;

        var w = target.width;
        var h = target.height;
        var anchor = target.getAnchorPoint();

        var rect = cc.rect(-anchor.x*w, -anchor.y*h, w, h);
        return cc.rectContainsPoint(rect, target.convertToNodeSpace(pos));
    }

});

var EventTarget = require("../event/event-target");
EventTarget.polyfill(Button.prototype);

cc.EButton = module.exports = Button;
