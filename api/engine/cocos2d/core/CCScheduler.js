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

/**
 * Minimum priority level for user scheduling.
 * @constant
 * @type Number
 */
cc.PRIORITY_NON_SYSTEM = cc.PRIORITY_SYSTEM + 1;

//data structures
/**
 * A list double-linked list used for "updates with priority"
 * @Class
 * @name cc.ListEntry
 * @param {cc.ListEntry} prev
 * @param {cc.ListEntry} next
 * @param {function} callback
 * @param {cc._Class} target not retained (retained by hashUpdateEntry)
 * @param {Number} priority
 * @param {Boolean} paused
 * @param {Boolean} markedForDeletion selector will no longer be called and entry will be removed at end of the next tick
 */
cc.ListEntry = function (prev, next, callback, target, priority, paused, markedForDeletion) {
    this.prev = prev;
    this.next = next;
    this.callback = callback;
    this.target = target;
    this.priority = priority;
    this.paused = paused;
    this.markedForDeletion = markedForDeletion;
};
cc.ListEntry.prototype.trigger = function (dt) {
    this.callback.call(this.target, dt);
};

/**
 * A update entry list
 * @Class
 * @name cc.HashUpdateEntry
 * @param {Array} list Which list does it belong to ?
 * @param {cc.ListEntry} entry entry in the list
 * @param {cc._Class} target hash key (retained)
 * @param {function} callback
 * @param {Array} hh
 */
cc.HashUpdateEntry = function (list, entry, target, callback, hh) {
    this.list = list;
    this.entry = entry;
    this.target = target;
    this.callback = callback;
    this.hh = hh;
};

//
/**
 * Hash Element used for "selectors with interval"
 * @Class
 * @param {Array} timers
 * @param {cc._Class} target  hash key (retained)
 * @param {Number} timerIndex
 * @param {cc.Timer} currentTimer
 * @param {Boolean} currentTimerSalvaged
 * @param {Boolean} paused
 * @param {Array} hh
 */
cc.HashTimerEntry = cc.hashSelectorEntry = function (timers, target, timerIndex, currentTimer, currentTimerSalvaged, paused, hh) {
    var _t = this;
    _t.timers = timers;
    _t.target = target;
    _t.timerIndex = timerIndex;
    _t.currentTimer = currentTimer;
    _t.currentTimerSalvaged = currentTimerSalvaged;
    _t.paused = paused;
    _t.hh = hh;
};

/**
 * Light weight timer
 * @class Timer
 * @extends _Class
 */
cc.Timer = cc._Class.extend(/** @lends cc.Timer# */{
    _scheduler: null,
    _elapsed:0.0,
    _runForever:false,
    _useDelay:false,
    _timesExecuted:0,
    _repeat:0, //0 = once, 1 is 2 x executed
    _delay:0,
    _interval:0.0,

    /**
     * @return {Number} returns interval of timer
     */
    getInterval : function(){return this._interval;},
    /**
     * @param {Number} interval set interval in seconds
     */
    setInterval : function(interval){this._interval = interval;},

    setupTimerWithInterval: function(seconds, repeat, delay){
        this._elapsed = -1;
        this._interval = seconds;
        this._delay = delay;
        this._useDelay = (this._delay > 0);
        this._repeat = repeat;
        this._runForever = (this._repeat === cc.REPEAT_FOREVER);
    },

    trigger: function(){
        return 0;
    },

    cancel: function(){
        return 0;
    },

    /**
     * cc.Timer's Constructor
     * Constructor of cc.Timer
     */
    ctor:function () {
        this._scheduler = null;
        this._elapsed = -1;
        this._runForever = false;
        this._useDelay = false;
        this._timesExecuted = 0;
        this._repeat = 0;
        this._delay = 0;
        this._interval = 0;
    },

    /**
     * triggers the timer
     * @param {Number} dt delta time
     */
    update:function (dt) {
        if (this._elapsed === -1) {
            this._elapsed = 0;
            this._timesExecuted = 0;
        } else {
            this._elapsed += dt;
            if (this._runForever && !this._useDelay) {//standard timer usage
                if (this._elapsed >= this._interval) {
                    this.trigger();
                    this._elapsed = 0;
                }
            } else {//advanced usage
                if (this._useDelay) {
                    if (this._elapsed >= this._delay) {
                        this.trigger();

                        this._elapsed -= this._delay;
                        this._timesExecuted += 1;
                        this._useDelay = false;
                    }
                } else {
                    if (this._elapsed >= this._interval) {
                        this.trigger();

                        this._elapsed = 0;
                        this._timesExecuted += 1;
                    }
                }

                if (!this._runForever && this._timesExecuted > this._repeat)
                    this.cancel();
            }
        }
    }
});

cc.TimerTargetSelector = cc.Timer.extend({
    _target: null,
    _selector: null,

    ctor: function(){
        this._target = null;
        this._selector = null;
    },

    initWithSelector: function(scheduler, selector, target, seconds, repeat, delay){
        this._scheduler = scheduler;
        this._target = target;
        this._selector = selector;
        this.setupTimerWithInterval(seconds, repeat, delay);
        return true;
    },

    getSelector: function(){
        return this._selector;
    },

    trigger: function(){
        //override
        if (this._target && this._selector){
            this._target.call(this._selector, this._elapsed);
        }
    },

    cancel: function(){
        //override
        this._scheduler.unschedule(this._selector, this._target);
    }

});

cc.TimerTargetCallback = cc.Timer.extend({

    _target: null,
    _callback: null,
    _key: null,

    ctor: function(){
        this._target = null;
        this._callback = null;
    },

    initWithCallback: function(scheduler, callback, target, key, seconds, repeat, delay){
        this._scheduler = scheduler;
        this._target = target;
        this._callback = callback;
        this._key = key;
        this.setupTimerWithInterval(seconds, repeat, delay);
        return true;
    },

    getCallback: function(){
        return this._callback;
    },

    getKey: function(){
        return this._key;
    },

    trigger: function(){
        //override
        if(this._callback)
            this._callback.call(this._target, this._elapsed);
    },

    cancel: function(){
        //override
        this._scheduler.unschedule(this._callback, this._target);
    }

});

var getTargetId = function (target) {
    return target.uuid || target.__instanceId;
}

/**
 * <p>
 *    Scheduler is responsible of triggering the scheduled callbacks.<br/>
 *    You should not use NSTimer. Instead use this class.<br/>
 *    <br/>
 *    There are 2 different types of callbacks (selectors):<br/>
 *       - update callback: the 'update' callback will be called every frame. You can customize the priority.<br/>
 *       - custom callback: A custom callback will be called every frame, or with a custom interval of time<br/>
 *       <br/>
 *    The 'custom selectors' should be avoided when possible. It is faster, and consumes less memory to use the 'update callback'. *
 * </p>
 * @class Scheduler
 * @extends _Class
 */
cc.Scheduler = cc._Class.extend(/** @lends cc.Scheduler# */{
    _timeScale:1.0,

    //_updates : null, //_updates[0] list of priority < 0, _updates[1] list of priority == 0, _updates[2] list of priority > 0,
    _updatesNegList: null,
    _updates0List: null,
    _updatesPosList: null,

    _hashForTimers:null, //Used for "selectors with interval"
    _arrayForTimers:null, //Speed up indexing
    _hashForUpdates:null, // hash used to fetch quickly the list entries for pause,delete,etc
    //_arrayForUpdates:null, //Speed up indexing

    _currentTarget:null,
    _currentTargetSalvaged:false,
    _updateHashLocked:false, //If true unschedule will not remove anything from a hash. Elements will only be marked for deletion.


    ctor:function () {
        this._timeScale = 1.0;
        this._updatesNegList = [];
        this._updates0List = [];
        this._updatesPosList = [];

        this._hashForUpdates = {};
        this._hashForTimers = {};
        this._currentTarget = null;
        this._currentTargetSalvaged = false;
        this._updateHashLocked = false;

        this._arrayForTimers = [];
        //this._arrayForUpdates = [];
    },

    //-----------------------private method----------------------

    _schedulePerFrame: function(callback, target, priority, paused){
        var hashElement = this._hashForUpdates[getTargetId(target)];
        if (hashElement && hashElement.entry){
            // check if priority has changed
            if (hashElement.entry.priority !== priority){
                if (this._updateHashLocked){
                    cc.log("warning: you CANNOT change update priority in scheduled function");
                    hashElement.entry.markedForDeletion = false;
                    hashElement.entry.paused = paused;
                    return;
                }else{
                    // will be added again outside if (hashElement).
                    this.unscheduleUpdate(target);
                }
            }else{
                hashElement.entry.markedForDeletion = false;
                hashElement.entry.paused = paused;
                return;
            }
        }

        // most of the updates are going to be 0, that's way there
        // is an special list for updates with priority 0
        if (priority === 0){
            this._appendIn(this._updates0List, callback, target, paused);
        }else if (priority < 0){
            this._priorityIn(this._updatesNegList, callback, target, priority, paused);
        }else{
            // priority > 0
            this._priorityIn(this._updatesPosList, callback, target, priority, paused);
        }
    },

    _removeHashElement:function (element) {
        delete this._hashForTimers[getTargetId(element.target)];
        cc.js.array.remove(this._arrayForTimers, element);
        element.Timer = null;
        element.target = null;
        element = null;
    },

    _removeUpdateFromHash:function (entry) {
        var self = this, element = self._hashForUpdates[getTargetId(entry.target)];
        if (element) {
            //list entry
            cc.js.array.remove(element.list, element.entry);

            delete self._hashForUpdates[getTargetId(element.target)];
            //cc.js.array.remove(self._hashForUpdates, element);
            element.entry = null;

            //hash entry
            element.target = null;
        }
    },

    _priorityIn:function (ppList, callback,  target, priority, paused) {
        var self = this,
            listElement = new cc.ListEntry(null, null, callback, target, priority, paused, false);

        // empey list ?
        if (!ppList) {
            ppList = [];
            ppList.push(listElement);
        } else {
            var index2Insert = ppList.length - 1;
            for(var i = 0; i <= index2Insert; i++){
                if (priority < ppList[i].priority) {
                    index2Insert = i;
                    break;
                }
            }
            ppList.splice(i, 0, listElement);
        }

        //update hash entry for quick access
        self._hashForUpdates[getTargetId(target)] = new cc.HashUpdateEntry(ppList, listElement, target, null);

        return ppList;
    },

    _appendIn:function (ppList, callback, target, paused) {
        var self = this, listElement = new cc.ListEntry(null, null, callback, target, 0, paused, false);
        ppList.push(listElement);

        //update hash entry for quicker access
        self._hashForUpdates[getTargetId(target)] = new cc.HashUpdateEntry(ppList, listElement, target, null, null);
    },

    //-----------------------public method-------------------------
    /**
     * <p>
     *    Modifies the time of all scheduled callbacks.<br/>
     *    You can use this property to create a 'slow motion' or 'fast forward' effect.<br/>
     *    Default is 1.0. To create a 'slow motion' effect, use values below 1.0.<br/>
     *    To create a 'fast forward' effect, use values higher than 1.0.<br/>
     *    @warning It will affect EVERY scheduled selector / action.
     * </p>
     *
     * @method setTimeScale
     * @param {Number} timeScale
     */
    setTimeScale:function (timeScale) {
        this._timeScale = timeScale;
    },

    /**
     * Returns time scale of scheduler.
     * @method getTimeScale
     * @return {Number}
     */
    getTimeScale:function () {
        return this._timeScale;
    },

    /**
     * 'update' the scheduler. (You should NEVER call this method, unless you know what you are doing.)
     * @method update
     * @param {Number} dt delta time
     */
    update:function (dt) {
        this._updateHashLocked = true;
        if(this._timeScale !== 1)
            dt *= this._timeScale;

        var i, list, len, entry;

        for(i=0,list=this._updatesNegList, len = list.length; i<len; i++){
            entry = list[i];
            if(!entry.paused && !entry.markedForDeletion)
                entry.trigger(dt);
        }

        for(i=0, list=this._updates0List, len=list.length; i<len; i++){
            entry = list[i];
            if (!entry.paused && !entry.markedForDeletion)
                entry.trigger(dt);
        }

        for(i=0, list=this._updatesPosList, len=list.length; i<len; i++){
            entry = list[i];
            if (!entry.paused && !entry.markedForDeletion)
                entry.trigger(dt);
        }

        // Iterate over all the custom selectors
        var elt, arr = this._arrayForTimers;
        for(i=0; i<arr.length; i++){
            elt = arr[i];
            this._currentTarget = elt;
            this._currentTargetSalvaged = false;

            if (!elt.paused){
                // The 'timers' array may change while inside this loop
                for (elt.timerIndex = 0; elt.timerIndex < elt.timers.length; ++(elt.timerIndex)){
                    elt.currentTimer = elt.timers[elt.timerIndex];
                    elt.currentTimerSalvaged = false;

                    elt.currentTimer.update(dt);
                    elt.currentTimer = null;
                }
            }

            // elt, at this moment, is still valid
            // so it is safe to ask this here (issue #490)
            //elt = elt.hh.next;

            // only delete currentTarget if no actions were scheduled during the cycle (issue #481)
            if (this._currentTargetSalvaged && this._currentTarget.timers.length === 0)
                this._removeHashElement(this._currentTarget);
        }

        // delete all updates that are marked for deletion
        // updates with priority < 0
        for(i=0,list=this._updatesNegList; i<list.length; ){
            entry = list[i];
            if(entry.markedForDeletion)
                this._removeUpdateFromHash(entry);
            else
                i++;
        }

        for(i=0, list=this._updates0List; i<list.length; ){
            entry = list[i];
            if (entry.markedForDeletion)
                this._removeUpdateFromHash(entry);
            else
                i++;
        }

        for(i=0, list=this._updatesPosList; i<list.length; ){
            entry = list[i];
            if (entry.markedForDeletion)
                this._removeUpdateFromHash(entry);
            else
                i++;
        }

        this._updateHashLocked = false;
        this._currentTarget = null;
    },

    /**
     * <p>
     *   The scheduled method will be called every 'interval' seconds.</br>
     *   If paused is YES, then it won't be called until it is resumed.<br/>
     *   If 'interval' is 0, it will be called every frame, but if so, it recommended to use 'scheduleUpdateForTarget:' instead.<br/>
     *   If the callback function is already scheduled, then only the interval parameter will be updated without re-scheduling it again.<br/>
     *   repeat let the action be repeated repeat + 1 times, use cc.REPEAT_FOREVER to let the action run continuously<br/>
     *   delay is the amount of time the action will wait before it'll start<br/>
     * </p>
     * @method scheduleCallbackForTarget
     * @deprecated since v3.4 please use .schedule
     * @param {_Class} target
     * @param {function} callback_fn
     * @param {Number} interval
     * @param {Number} repeat
     * @param {Number} delay
     * @param {Boolean} paused
     * @example {@link utils/api/cocos/docs/cocos2d/core/CCScheduler/scheduleCallbackForTarget.js}
     */
    scheduleCallbackForTarget: function(target, callback_fn, interval, repeat, delay, paused){
        //cc.log("scheduleCallbackForTarget is deprecated. Please use schedule.");
        this.schedule(callback_fn, target, interval, repeat, delay, paused, getTargetId(target) + "");
    },

    /**
     * The schedule
     * @method schedule
     * @param {Function} callback
     * @param {_Class} target
     * @param {Number} interval
     * @param {Number} repeat
     * @param {Number} delay
     * @param {Boolean} paused
     * @param {Number} key
     * @example {@link utils/api/cocos/docs/cocos2d/core/CCScheduler/schedule.js}
     */
    schedule: function(callback, target, interval, repeat, delay, paused, key){
        var isSelector = false;
        if(typeof callback !== "function"){
            var selector = callback;
            isSelector = true;
        }

        if(isSelector === false){
            //callback, target, interval, repeat, delay, paused, key
            //callback, target, interval, paused, key
            if(arguments.length === 4 || arguments.length === 5){
                key = delay;
                paused = repeat;
                delay = 0;
                repeat = cc.REPEAT_FOREVER;
            }
        }else{
            //selector, target, interval, repeat, delay, paused
            //selector, target, interval, paused
            if(arguments.length === 4){
                paused = repeat;
                repeat = cc.REPEAT_FOREVER;
                delay = 0;
            }
        }
        if (key === undefined) {
            key = target.__instanceId + "";
        }

        cc.assert(target, cc._LogInfos.Scheduler_scheduleCallbackForTarget_3);

        var instanceId = getTargetId(target);
        var element = this._hashForTimers[instanceId];

        if(!element){
            // Is this the 1st element ? Then set the pause level to all the callback_fns of this target
            element = new cc.HashTimerEntry(null, target, 0, null, null, paused, null);
            this._arrayForTimers.push(element);
            this._hashForTimers[instanceId] = element;
        }else{
            cc.assert(element.paused === paused, "");
        }

        var timer, i;
        if (element.timers == null) {
            element.timers = [];
        } else if(isSelector === false) {
            for (i = 0; i < element.timers.length; i++) {
                timer = element.timers[i];
                if (callback === timer._callback) {
                    cc.log(cc._LogInfos.Scheduler.scheduleCallbackForTarget, timer.getInterval().toFixed(4), interval.toFixed(4));
                    timer._interval = interval;
                    return;
                }
            }
        }else{
            for (i = 0; i < element.timers.length; ++i){
                timer =element.timers[i];
                if (timer && selector === timer.getSelector()){
                    cc.log("CCScheduler#scheduleSelector. Selector already scheduled. Updating interval from: %.4f to %.4f", timer.getInterval(), interval);
                    timer.setInterval(interval);
                    return;
                }
            }
            //ccArrayEnsureExtraCapacity(element->timers, 1);
        }

        if(isSelector === false){
            timer = new cc.TimerTargetCallback();
            timer.initWithCallback(this, callback, target, key, interval, repeat, delay);
            element.timers.push(timer);
        }else{
            timer = new cc.TimerTargetSelector();
            timer.initWithSelector(this, selector, target, interval, repeat, delay);
            element.timers.push(timer);
        }
    },

    scheduleUpdate: function(target, priority, paused, updateFunc){
        updateFunc = updateFunc || target.update;
        this._schedulePerFrame(updateFunc, target, priority, paused);
    },

    _getUnscheduleMark: function(key, timer){
        //key, callback, selector
        switch (typeof key){
            case "number":
            case "string":
                return key === timer.getKey();
            case "function":
                return key === timer._callback;
            default:
                return key === timer.getSelector();
        }
    },
    unschedule: function(key, target){
        //key, target
        //selector, target
        //callback, target - This is in order to increase compatibility

        // explicity handle nil arguments when removing an object
        if (!target || !key)
            return;

        var self = this, element = self._hashForTimers[getTargetId(target)];
        if (element) {
            var timers = element.timers;
            for(var i = 0, li = timers.length; i < li; i++){
                var timer = timers[i];
                if (this._getUnscheduleMark(key, timer)) {
                    if ((timer === element.currentTimer) && (!element.currentTimerSalvaged)) {
                        element.currentTimerSalvaged = true;
                    }
                    timers.splice(i, 1);
                    //update timerIndex in case we are in tick;, looping over the actions
                    if (element.timerIndex >= i) {
                        element.timerIndex--;
                    }

                    if (timers.length === 0) {
                        if (self._currentTarget === element) {
                            self._currentTargetSalvaged = true;
                        } else {
                            self._removeHashElement(element);
                        }
                    }
                    return;
                }
            }
        }
    },

    unscheduleUpdate: function(target){
        if (target == null)
            return;

        var element = this._hashForUpdates[getTargetId(target)];

        if (element){
            if (this._updateHashLocked){
                element.entry.markedForDeletion = true;
            }else{
                this._removeUpdateFromHash(element.entry);
            }
        }
    },

    unscheduleAllForTarget: function(target){
        // explicit nullptr handling
        if (target == null){
            return;
        }

        // Custom Selectors
        var element = this._hashForTimers[getTargetId(target)];

        if (element){
            if (element.timers.indexOf(element.currentTimer) > -1
                && (! element.currentTimerSalvaged)){
                element.currentTimerSalvaged = true;
            }
            //        ccArrayRemoveAllObjects(element.timers);
            element.timers.length = 0;

            if (this._currentTarget === element){
                this._currentTargetSalvaged = true;
            }else{
                this._removeHashElement(element);
            }
        }

        // update selector
        this.unscheduleUpdate(target);
    },

    unscheduleAll: function(){
        this.unscheduleAllWithMinPriority(cc.Scheduler.PRIORITY_SYSTEM);
    },

    unscheduleAllWithMinPriority: function(minPriority){
        // Custom Selectors
        var i, element, arr = this._arrayForTimers;
        for(i=arr.length-1; i>=0; i--){
            element = arr[i];
            this.unscheduleAllForTarget(element.target);
        }

        // Updates selectors
        var entry;
        var temp_length = 0;
        if(minPriority < 0){
            for(i=0; i<this._updatesNegList.length; ){
                temp_length = this._updatesNegList.length;
                entry = this._updatesNegList[i];
                if(entry && entry.priority >= minPriority)
                    this.unscheduleUpdate(entry.target);
                if (temp_length == this._updatesNegList.length)
                    i++;
            }
        }

        if(minPriority <= 0){
            for(i=0; i<this._updates0List.length; ){
                temp_length = this._updates0List.length;
                entry = this._updates0List[i];
                if (entry)
                    this.unscheduleUpdate(entry.target);
                if (temp_length == this._updates0List.length)
                    i++;
            }
        }

        for(i=0; i<this._updatesPosList.length; ){
            temp_length = this._updatesPosList.length;
            entry = this._updatesPosList[i];
            if(entry && entry.priority >= minPriority)
                this.unscheduleUpdate(entry.target);
            if (temp_length == this._updatesPosList.length)
                i++;
        }
    },

    isScheduled: function(key, target){
        //key, target
        //selector, target
        cc.assert(key, "Argument key must not be empty");
        cc.assert(target, "Argument target must be non-nullptr");

        var element = this._hashForUpdates[getTargetId(target)];

        if (!element){
            return false;
        }

        if (element.timers == null){
            return false;
        }else{
            var timers = element.timers;
            for (var i = 0; i < timers.length; ++i){
                var timer =  timers[i];

                if (key === timer.getKey()){
                    return true;
                }
            }
            return false;
        }
    },

    /**
     * <p>
     *  Pause all selectors from all targets.<br/>
     *  You should NEVER call this method, unless you know what you are doing.
     * </p>
     *
     * @method pauseAllTargets
     */
    pauseAllTargets:function () {
        return this.pauseAllTargetsWithMinPriority(cc.Scheduler.PRIORITY_SYSTEM);
    },

    /**
     * Pause all selectors from all targets with a minimum priority. <br/>
     * You should only call this with kCCPriorityNonSystemMin or higher.
     * @method pauseAllTargetsWithMinPriority
     * @param {Number} minPriority
     */
    pauseAllTargetsWithMinPriority:function (minPriority) {
        var idsWithSelectors = [];

        var self = this, element, locArrayForTimers = self._arrayForTimers;
        var i, li;
        // Custom Selectors
        for(i = 0, li = locArrayForTimers.length; i < li; i++){
            element = locArrayForTimers[i];
            if (element) {
                element.paused = true;
                idsWithSelectors.push(element.target);
            }
        }

        var entry;
        if(minPriority < 0){
            for(i=0; i<this._updatesNegList.length; i++){
                entry = this._updatesNegList[i];
                if (entry) {
                    if(entry.priority >= minPriority){
						entry.paused = true;
                        idsWithSelectors.push(entry.target);
                    }
                }
            }
        }

        if(minPriority <= 0){
            for(i=0; i<this._updates0List.length; i++){
                entry = this._updates0List[i];
                if (entry) {
					entry.paused = true;
                    idsWithSelectors.push(entry.target);
                }
            }
        }

        for(i=0; i<this._updatesPosList.length; i++){
            entry = this._updatesPosList[i];
            if (entry) {
                if(entry.priority >= minPriority){
					entry.paused = true;
                    idsWithSelectors.push(entry.target);
                }
            }
        }

        return idsWithSelectors;
    },

    /**
     * Resume selectors on a set of targets.<br/>
     * This can be useful for undoing a call to pauseAllCallbacks.
     * @method resumeTargets
     * @param {Array} targetsToResume
     */
    resumeTargets:function (targetsToResume) {
        if (!targetsToResume)
            return;

        for (var i = 0; i < targetsToResume.length; i++) {
            this.resumeTarget(targetsToResume[i]);
        }
    },

    /**
     * <p>
     *    Pauses the target.<br/>
     *    All scheduled selectors/update for a given target won't be 'ticked' until the target is resumed.<br/>
     *    If the target is not present, nothing happens.
     * </p>
     * @method pauseTarget
     * @param {_Class} target
     */
    pauseTarget:function (target) {

        cc.assert(target, cc._LogInfos.Scheduler.pauseTarget);

        //customer selectors
        var self = this, 
            instanceId = getTargetId(target),
            element = self._hashForTimers[instanceId];
        if (element) {
            element.paused = true;
        }

        //update callback
        var elementUpdate = self._hashForUpdates[instanceId];
        if (elementUpdate) {
            elementUpdate.entry.paused = true;
        }
    },

    /**
     * Resumes the target.<br/>
     * The 'target' will be unpaused, so all schedule selectors/update will be 'ticked' again.<br/>
     * If the target is not present, nothing happens.
     * @method resumeTarget
     * @param {_Class} target
     */
    resumeTarget:function (target) {

        cc.assert(target, cc._LogInfos.Scheduler.resumeTarget);

        // custom selectors
        var self = this,
            instanceId = getTargetId(target),
            element = self._hashForTimers[instanceId];

        if (element) {
            element.paused = false;
        }

        //update callback
        var elementUpdate = self._hashForUpdates[instanceId];

        if (elementUpdate) {
            elementUpdate.entry.paused = false;
        }
    },

    /**
     * Returns whether or not the target is paused
     * @method isTargetPaused
     * @param {_Class} target
     * @return {Boolean}
     */
    isTargetPaused:function (target) {

        cc.assert(target, cc._LogInfos.Scheduler.isTargetPaused);

        // Custom selectors
        var instanceId = getTargetId(target),
            element = this._hashForTimers[instanceId];
        if (element) {
            return element.paused;
        }
        var elementUpdate = this._hashForUpdates[instanceId];
        if (elementUpdate) {
            return elementUpdate.entry.paused;
        }
        return false;
    },

    /**
     * <p>
     *    Schedules the 'update' callback_fn for a given target with a given priority.<br/>
     *    The 'update' callback_fn will be called every frame.<br/>
     *    The lower the priority, the earlier it is called.
     * </p>
     * @method scheduleUpdateForTarget
     * @deprecated since v3.4 please use .scheduleUpdate
     * @param {_Class} target
     * @param {Number} priority
     * @param {Boolean} paused
     * @example {@link utils/api/cocos/docs/cocos2d/core/CCScheduler/scheduleUpdateForTarget.js}
     */
    scheduleUpdateForTarget: function(target, priority, paused){
        //cc.log("scheduleUpdateForTarget is deprecated. Please use scheduleUpdate.");
        this.scheduleUpdate(target, priority, paused);
    },

    /**
     * <p>
     *   Unschedule a callback function for a given target.<br/>
     *   If you want to unschedule the "update", use unscheudleUpdateForTarget.
     * </p>
     * @method unscheduleCallbackForTarget
     * @deprecated since v3.4 please use .unschedule
     * @param {_Class} target
     * @param {Function} callback - callback[Function] or key[String]
     * @example {@link utils/api/cocos/docs/cocos2d/core/CCScheduler/unscheduleCallbackForTarget.js}
     */
    unscheduleCallbackForTarget:function (target, callback) {
        //cc.log("unscheduleCallbackForTarget is deprecated. Please use unschedule.");
        this.unschedule(callback, target);
    },

    /**
     * Unschedules the update callback function for a given target
     * @method unscheduleUpdateForTarget
     * @param {_Class} target
     * @deprecated since v3.4 please use .unschedule
     * @example {@link utils/api/cocos/docs/cocos2d/core/CCScheduler/unscheduleUpdateForTarget.js}
     */
    unscheduleUpdateForTarget:function (target) {
        //cc.log("unscheduleUpdateForTarget is deprecated. Please use unschedule.");
        this.unscheduleUpdate(target);
    },

    /**
     * Unschedules all function callbacks for a given target. This also includes the "update" callback function.
     * @method unscheduleAllCallbacksForTarget
     * @deprecated since v3.4 please use .unscheduleAll
     * @param {_Class} target
     */
    unscheduleAllCallbacksForTarget: function(target){
        //cc.log("unscheduleAllCallbacksForTarget is deprecated. Please use unscheduleAll.");
        this.unschedule(getTargetId(target) + "", target);
    },

    /**
     *  <p>
     *      Unschedules all function callbacks from all targets. <br/>
     *      You should NEVER call this method, unless you know what you are doing.
     *  </p>
     * @method unscheduleAllCallbacks
     * @deprecated since v3.4 please use .unscheduleAllWithMinPriority
     */
    unscheduleAllCallbacks: function(){
        //cc.log("unscheduleAllCallbacks is deprecated. Please use unscheduleAll.");
        this.unscheduleAllWithMinPriority(cc.Scheduler.PRIORITY_SYSTEM);
    },

    /**
     * <p>
     *    Unschedules all function callbacks from all targets with a minimum priority.<br/>
     *    You should only call this with kCCPriorityNonSystemMin or higher.
     * </p>
     * @method unscheduleAllCallbacksWithMinPriority
     * @deprecated since v3.4 please use .unscheduleAllWithMinPriority
     * @param {Number} minPriority
     */
    unscheduleAllCallbacksWithMinPriority:function (minPriority) {
        //cc.log("unscheduleAllCallbacksWithMinPriority is deprecated. Please use unscheduleAllWithMinPriority.");
        this.unscheduleAllWithMinPriority(minPriority);
    }
});
/**
 * Priority level reserved for system services.
 * @constant
 * @type Number
 */
cc.Scheduler.PRIORITY_SYSTEM = (-2147483647 - 1);
