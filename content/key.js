KeySnail.Key = {
    modules: null,
    // "modules" is automatically added
    // by KeySnail.initModule in keysnail.js

    // ==== key maps ====
    keyMapHolder: {},           // hash, all mode-keymaps are stored to
    // currently, {"global", "view", "edit", "caret"}
    currentKeyMap: null,        // current keymap (transit)
    currentKeySequence: [],     // array, current key sequence set to

    // ==== prefix argument ====
    prefixArgument: null,       // prefix argument (integer)
    // string expression of the key sequence e.g. "C-u 4 0 2"
    // this is used for displaing to the status-bar
    prefixArgumentString: null,
    inputtingPrefixArgument : false,

    // ==== escape char ====
    // useful to for the access key
    escapeCurrentChar: false,

    // ==== magic keys ====
    // these keys can be configured through the user config file
    quitKey: "C-g",
    helpKey: "<f1>",
    escapeKey: "C-q",

    // ==== keyboard macro ====
    macroStartKey: "<f3>",
    macroEndKey: "<f4>",
    currentMacro: [],
    inputtingMacro: false,

    // ==== status ====
    status: false,

    // ==== modes ====
    modes: {
        GLOBAL: "global",
        VIEW:   "view",
        EDIT:   "edit",
        CARET:  "caret",
        MENU:   "menu"
    },

    init: function () {
        this.declareKeyMap(this.modes.GLOBAL);
        this.declareKeyMap(this.modes.VIEW);
        this.declareKeyMap(this.modes.EDIT);
        this.declareKeyMap(this.modes.CARET);
        this.currentKeyMap = this.keyMapHolder[this.modes.GLOBAL];

        this.status = nsPreferences
            .getBoolPref("extensions.keysnail.keyhandler.status", true);
    },

    // ==================== Run / Stop ====================

    run: function () {
        this.status = true;
        nsPreferences
            .setBoolPref("extensions.keysnail.keyhandler.status", true);
        window.addEventListener("keypress", this, true);
    },

    stop: function () {
        this.status = false;
        nsPreferences
            .setBoolPref("extensions.keysnail.keyhandler.status", false);
        window.removeEventListener("keypress", this, true);
    },

    toggleStatus: function () {
        if (this.status) {
            this.stop();
        } else if (this.modules.userscript.initFileLoaded) {
            this.run();
        } else {
            // no initialization file is loaded
            window.alert(this.modules.util.
                         getLocaleString("noUserScriptLoaded"));
            this.status = false;
        }

        this.updateMenu();
        this.updateStatusBar();
    },

    updateStatusBar: function () {
        var icon = document.getElementById("keysnail-statusbar-icon");
        if (!icon) {
            return;
        }
        if (this.status) {
            // enabled
            icon.src = "chrome://keysnail/skin/icon16.png";
            icon.tooltipText = this.modules.util
                .getLocaleString("keySnailEnabled");
        } else {
            // disabled
            icon.src = "chrome://keysnail/skin/icon16gray.png";
            icon.tooltipText = this.modules.util
                .getLocaleString("keySnailDisabled");
        }
    },

    updateMenu: function () {
        var checkbox = document.getElementById("keysnail-menu-status");
        if (!checkbox) {
            return;
        }

        checkbox.setAttribute('checked', this.status);
    },

    // ==================== Handle Key Event ====================

    /**
     * first seek for the key from local-key-map
     * and if does not found, seek for global-key-map
     * Note: this function is called implicitly
     * when the 'keypress' event occured
     * @param {event} aEvent event to handle
     *
     */
    handleEvent: function (aEvent) {
        if (aEvent.ksNoHandle) {
            // ignore key event generated by generateKey
            // when ksNoHandle is set to true
            return;
        }

        if (this.escapeCurrentChar) {
            // no stop event propagation
            this.backToNeutral("Escaped", 3000);
            return;
        }

        // ----------------------------------------

        var key = this.keyEventToString(aEvent);

        if (this.inputtingMacro) {
            this.currentMacro.push(aEvent);
        }

        switch (key) {
        case this.escapeKey:
            this.modules.util.stopEventPropagation(aEvent);
            this.modules.display.echoStatusBar("Escape Next Key: ");
            this.escapeCurrentChar = true;
            return;
        case this.quitKey:
            this.modules.util.stopEventPropagation(aEvent);
            // call hooks
            this.modules.hook.callHook("KeyBoardQuit", aEvent);
            // cancell current key sequence
            this.backToNeutral("Quit");
            return;
        case this.macroEndKey:
            this.modules.util.stopEventPropagation(aEvent);
            if (this.inputtingMacro) {
                this.currentMacro.pop();
                this.modules.display.echoStatusBar("Keyboard macro defined", 3000);
                this.inputtingMacro = false;
            } else {
                if (this.currentMacro.length) {
                    this.modules.display.echoStatusBar("Do macro", 3000);
                    this.modules.macro.doMacro(this.currentMacro);
                } else {
                    this.modules.display.echoStatusBar("No macro defined", 3000);
                }
            }
            return;
        case this.macroStartKey:
            this.modules.util.stopEventPropagation(aEvent);
            if (this.inputtingMacro) {
                this.currentMacro.pop();
            } else {
                this.modules.display.echoStatusBar("Defining Keyboard macro ...", 3000);
                this.currentMacro.length = 0;
                this.inputtingMacro = true;
            }
            return;
        }

        if (this.inputtingPrefixArgument) {
            if (this.isKeyEventNum(aEvent) || key == "C-u") {
                // append to currentKeySequence, while the key event is number value.
                // sequencial C-u like C-u C-u => 4 * 4 = 16 is also supported.
                this.modules.util.stopEventPropagation(aEvent);
                this.currentKeySequence.push(key);
                this.modules.display.echoStatusBar(this.currentKeySequence.join(" "));
                // do nothing and return
                return;
            }

            // prefix argument keys input end. now parse them.
            this.prefixArgument
                = this.parsePrefixArgument(this.currentKeySequence);
            this.inputtingPrefixArgument = null;
            // for displaying status-bar
            this.prefixArgumentString = this.currentKeySequence.join(" ") + " ";
            this.currentKeySequence.length = 0;
        }

        if (this.currentKeySequence.length) {
            // after second stroke
            if (key == this.helpKey) {
                this.modules.util.stopEventPropagation(aEvent);
                this.interactiveHelp();
                this.backToNeutral("");
                return;
            }
        } else {
            // first stroke
            if (this.isPrefixArgumentKey(key, aEvent)) {
                // transit state: to inputting prefix argument
                this.modules.util.stopEventPropagation(aEvent);
                this.currentKeySequence.push(key);
                this.modules.display.echoStatusBar(key);
                this.inputtingPrefixArgument = true;
                return;
            }

            // decide which keymap to use
            var modeName;

            if (this.modules.util.isWritable()) {
                modeName = this.modes.EDIT;
            } else {
                modeName = nsPreferences.getBoolPref("accessibility.browsewithcaret") ?
                    this.modes.CARET : this.modes.VIEW;
            }

            // this.message(modeName + "-mode");
            // this.modules.display.prettyPrint(modeName + "-mode");
            this.currentKeyMap = this.keyMapHolder[modeName];
        }

        if (!this.currentKeyMap[key]) {
            // if key is not found in the local key map
            // check for the global key map, using currentKeySequence
            this.currentKeyMap = this.trailByKeySequence(this.keyMapHolder[this.modes.GLOBAL],
                                                         this.currentKeySequence);

            if (!this.currentKeyMap) {
                // failed to trace the currentKeySequence
                this.backToNeutral("");
                return;
            }
        }

        if (this.currentKeyMap[key]) {
            // prevent browser default behaviour
            this.modules.util.stopEventPropagation(aEvent);

            if (typeof(this.currentKeyMap[key]) == "function") {
                // save function and prefixArgument
                var func = this.currentKeyMap[key];
                var arg  = this.prefixArgument;
                this.backToNeutral("");

                // Maybe this annoys not a few people. So I disable this.
                // if (this.func.ksDescription) {
                //     this.modules.display.echoStatusBar(func.ksDescription, 2000);
                // }

                // call saved function
                // this.message("Prefix Argument : " + arg);
                this.executeFunction(func, aEvent, arg);
            } else {
                // add key to the key sequece
                this.currentKeySequence.push(key);

                // Display key sequence
                if (this.prefixArgumentString) {
                    this.modules.display.echoStatusBar(this.prefixArgumentString
                                                       + this.currentKeySequence.join(" "));
                } else {
                    this.modules.display.echoStatusBar(this.currentKeySequence.join(" "));
                }

                // move to the next keymap
                this.currentKeyMap = this.currentKeyMap[key];
            }
        } else {
            // call default handler or insert text
            if (this.currentKeySequence.length) {
                this.modules.util.stopEventPropagation(aEvent);
                this.backToNeutral(this.currentKeySequence.join(" ")
                                   + " " + key + " is undefined", 3000);
            } else {
                if (this.prefixArgument > 0 && this.modules.util.isWritable()) {
                    this.modules.util.stopEventPropagation(aEvent);
                    // insert repeated string
                    this.insertText(new Array(this.prefixArgument + 1)
                                    .join(String.fromCharCode(aEvent.charCode)));
                }
                this.backToNeutral("");
            }
        }
    },

    // ==================== magic key ==================== //

    isControlKey: function (aEvent) {
        return aEvent.ctrlKey || aEvent.commandKey;
    },

    isMetaKey: function (aEvent) {
        return aEvent.altKey;
    },

    // ==================== key event => string ==================== //

    keyEventToString: function (aEvent) {
        var key;

        if (aEvent.charCode >= 0x20 && aEvent.charCode <= 0x7e) {
            // ASCII displayable characters (0x20 : SPC)
            key = String.fromCharCode(aEvent.charCode);
            if (aEvent.charCode == 0x20) {
                key = "SPC";
            }
        } else {
            // special charactors
            switch (aEvent.keyCode) {
            case KeyEvent.DOM_VK_ESCAPE:
                key = "ESC";
                break;
            case KeyEvent.DOM_VK_RETURN:
            case KeyEvent.DOM_VK_ENTER:
                key = "RET";
                break;
            case KeyEvent.DOM_VK_RIGHT:
                key = '<right>';
                break;
            case KeyEvent.DOM_VK_LEFT:
                key = '<left>';
                break;
            case KeyEvent.DOM_VK_UP:
                key = '<up>';
                break;
            case KeyEvent.DOM_VK_DOWN:
                key = '<down>';
                break;
            case KeyEvent.DOM_VK_PAGE_UP:
                key = "<prior>";
                break;
            case KeyEvent.DOM_VK_PAGE_DOWN:
                key = "<next>";
                break;
            case KeyEvent.DOM_VK_END:
                key = "<end>";
                break;
            case KeyEvent.DOM_VK_HOME:
                key = "<home>";
                break;
            case KeyEvent.DOM_VK_TAB:
                key = "<tab>";
                break;
            case KeyEvent.DOM_VK_BACK_SPACE:
                key = "<backspace>";
                break;
            case KeyEvent.DOM_VK_PRINTSCREEN:
                key = "<print>";
                break;
            case KeyEvent.DOM_VK_INSERT:
                key = "<insert>";
                break;
            case KeyEvent.DOM_VK_DELETE:
                key = "<delete>";
                break;
            case KeyEvent.DOM_VK_F1:
                key = "<f1>";
                break;
            case KeyEvent.DOM_VK_F2:
                key = "<f2>";
                break;
            case KeyEvent.DOM_VK_F3:
                key = "<f3>";
                break;
            case KeyEvent.DOM_VK_F4:
                key = "<f4>";
                break;
            case KeyEvent.DOM_VK_F5:
                key = "<f5>";
                break;
            case KeyEvent.DOM_VK_F6:
                key = "<f6>";
                break;
            case KeyEvent.DOM_VK_F7:
                key = "<f7>";
                break;
            case KeyEvent.DOM_VK_F8:
                key = "<f8>";
                break;
            case KeyEvent.DOM_VK_F9:
                key = "<f9>";
                break;
            case KeyEvent.DOM_VK_F10:
                key = "<f10>";
                break;
            case KeyEvent.DOM_VK_F11:
                key = "<f11>";
                break;
            case KeyEvent.DOM_VK_F12:
                key = "<f12>";
                break;
            case KeyEvent.DOM_VK_F13:
                key = "<f13>";
                break;
            case KeyEvent.DOM_VK_F14:
                key = "<f14>";
                break;
            case KeyEvent.DOM_VK_F15:
                key = "<f15>";
                break;
            case KeyEvent.DOM_VK_F16:
                key = "<f16>";
                break;
            case KeyEvent.DOM_VK_F17:
                key = "<f17>";
                break;
            case KeyEvent.DOM_VK_F18:
                key = "<f18>";
                break;
            case KeyEvent.DOM_VK_F19:
                key = "<f19>";
                break;
            case KeyEvent.DOM_VK_F20:
                key = "<f20>";
                break;
            case KeyEvent.DOM_VK_F21:
                key = "<f21>";
                break;
            case KeyEvent.DOM_VK_F22:
                key = "<f22>";
                break;
            case KeyEvent.DOM_VK_F23:
                key = "<f23>";
                break;
            case KeyEvent.DOM_VK_F24:
                key = "<f24>";
                break;
            }
        }

        // append modifier
        if (this.isControlKey(aEvent) && this.isMetaKey(aEvent)) {
            key = "C-M-" + key;
        } else if (this.isMetaKey(aEvent)) {
            key = "M-" + key;
        } else if (this.isControlKey(aEvent)) {
            key = "C-" + key;
        }

        return key;
    },

    // @return true if aEvent is the event of the number key
    //         e.g. 0, 1, 2, 3, 4 ,5, 6, 7, 8, 9
    isKeyEventNum: function (event) {
        return (event.charCode >= 0x30 &&
                event.charCode <= 0x39);
    },

    // @return true if aKey is the valid literal key expression
    // example)
    // a   => valid
    // C-t => valid
    // M-< => valid
    // C=C => invalid
    // %%% => invalid
    validateKey: function (aKey) {
        return true;
    },

    // @return index of the invalid key in the key sequence
    //         -1 when there are no invalid keys
    seekInvalidKey: function (aKeys) {
        var i = 0;
        var len = 0;
        for (; i < len; ++i) {
            if (!this.validateKey(aKeys[i])) {
                return i;
            }
        }

        return -1;
    },

    // キーシーケンスに関数を割り当て
    registerKeySequence: function (aKeys, aFunc, aKeyMap) {
        // validate (currently, not works)

        // var invalidKeyIndex = this.seekInvalidKey(aKeys);

        // if (invalidKeyIndex >= 0) {
        //     this.message("'" + aKeys[invalidKeyIndex]
        //                  + "' isn't a valid key");
        //     return false;
        // }

        var key;
        var to = aKeys.length - 1;
        for (var i = 0; i < to; ++i) {
            key = aKeys[i];

            switch (typeof(aKeyMap[key])) {
            case "function":
                this.message(aKeyMap[key].ksDescription
                             + " bound to [" + aKeys.slice(0, i + 1).join(" ")
                             + "] overrided with the prefix key.");
                // this.message("[" + aKeys.slice(0, i + 1).join(" ")
                //              + "] is already bound to "
                //              + aKeyMap[key].ksDescription);
                // this.message("Failed to bind "+ aFunc.ksDescription
                //              + " to [" + aKeys.join(" ") + "] ");
                // no break;
            case "undefined":
                // create a new (pseudo) aKeyMap
                aKeyMap[key] = new Object();
                break;
            }

            // dig, dig
            aKeyMap = aKeyMap[key];
        }

        aKeyMap[aKeys[i]] = aFunc;

        return true;
    },

    // ==================== set key sequence to the keymap  ====================

    setGlobalKey: function (aKeys, aFunc, aKsdescription, aKsNoRepeat) {
        this.defineKey(this.modes.GLOBAL, aKeys, aFunc, aKsdescription, aKsNoRepeat);
    },

    setEditKey: function (aKeys, aFunc, aKsdescription, aKsNoRepeat) {
        this.defineKey(this.modes.EDIT, aKeys, aFunc, aKsdescription, aKsNoRepeat);
    },

    setViewKey: function (aKeys, aFunc, aKsdescription, aKsNoRepeat) {
        this.defineKey(this.modes.VIEW, aKeys, aFunc, aKsdescription, aKsNoRepeat);
    },

    setCaretKey: function (aKeys, aFunc, aKsdescription, aKsNoRepeat) {
        this.defineKey(this.modes.CARET, aKeys, aFunc, aKsdescription, aKsNoRepeat);
    },

    defineKey: function (aKeyMapName, aKeys, aFunc, aKsdescription, aKsNoRepeat) {
        var addTo = this.keyMapHolder[aKeyMapName]
            || this.keyMapHolder[this.modes.GLOBAL];

        // if (!addTo) {
        //     this.message("'" + aKeyMapName
        //                  + "' isn't a valid keyMap");
        //     return;
        // }

        if (aKsdescription) {
            aFunc.ksDescription = aKsdescription;
        }
        // true, if you want to prevent the iteration
        // of the command when prefix argument specified.
        aFunc.ksNoRepeat = aKsNoRepeat;

        switch (typeof(aKeys)) {
        case "string":
            // one key stroke
            addTo[aKeys] = aFunc;
            break;
        case "object":
            if (typeof(aKeys[0]) == "object") {
                // multi registration
                for (var i = 0; i < aKeys.length; ++i) {
                    this.registerKeySequence(aKeys[i], aFunc, addTo);
                }
            } else {
                // simple form
                this.registerKeySequence(aKeys, aFunc, addTo);
            }
            break;
        }
    },

    declareKeyMap: function (aKeyMapName) {
        if (this.keyMapHolder[aKeyMapName] == undefined) {
            // undefined keyMap
            this.keyMapHolder[aKeyMapName] = new Object();
        }
    },

    copyKeyMap: function (aTargetKeyMapName, aDestinationKeyMapName) {
        var aTarget = this.keyMapHolder[aTargetKeyMapName];
        var aDestination = this.keyMapHolder[aDestinationKeyMapName];

        for (var property in aTarget) {
            aDestination[property] = aTarget[property];
        }
    },

    copy: function (aTargetKeyMapName, aDestinationKeyMapName) {
        this.message("key.copy() is obsoleted. Use key.copyKeyMap.");
        this.copyKeyMap(aTargetKeyMapName, aDestinationKeyMapName);
    },

    // 初期状態に戻す
    //
    backToNeutral: function (aMsg, aTime) {
        // reset keymap
        this.currentKeyMap = this.keyMapHolder[this.modes.GLOBAL];
        // reset statusbar
        this.modules.display.echoStatusBar(aMsg, aTime);
        // reset key sequence
        this.currentKeySequence.length = 0;
        // reset prefixArgument
        this.inputtingPrefixArgument = false;
        this.prefixArgument = null;
        this.prefixArgumentString = null;
        // reset escape char
        this.escapeCurrentChar = false;
    },

    /**
     * @param {keyMap} aKeyMap
     * @param {[String]} aKeySequence
     * @return {keyMap} keyMap を keySequence だけたどった先のキーマップ
     *                  たどれなかったら null 
     */
    trailByKeySequence: function (aKeyMap, aKeySequence) {
        var key;
        var to = aKeySequence.length;
        for (var i = 0; i < to; ++i) {
            key = aKeySequence[i];
            if (typeof(aKeyMap[key]) != "object") {
                // aKeySequence 分だけたどれなかった場合は
                // 無理だと分かるので null を返す
                return null;
            }

            // たどれる場合は次のキーマップへ
            aKeyMap = aKeyMap[key];
        }

        return aKeyMap;
    },

    /**
     * examples)
     * ["M--", "2", "1", "3"] => -213
     * ["C-u", "C-u", "C-u"] => 64
     * ["C-9", "2"] => 92
     * @param {[String]} aKeySequence key sequence (array) to be parsed
     * @return {Integer} prefix argument
     */
    parsePrefixArgument: function (aKeySequence) {
        if (!aKeySequence.length) {
            return null;
        }

        var arg = 0;
        var numSequence = [];
        var coef = 1;
        var i = 1;

        switch (aKeySequence[0]) {
        case "C-u":
            arg = 4;
            while (aKeySequence[i] == "C-u" && i < aKeySequence.length) {
                // Repeating C-u without digits or minus sign
                // multiplies the argument by 4 each time.
                arg <<= 2;
                i++;
            }
            if (i != aKeySequence.length) {
                // followed by non C-u key
                arg = 0;
            }
            break;
        case "C--":
        case "C-M--":
        case "M--":
            // negative argument
            coef = -1;
            break;
        default:
            // M-2 ... C-1 ... C-M-9
            // => 2 ... 1 ... 9
            var mix = aKeySequence[0];
            numSequence[0] = Number(mix.charAt(mix.length - 1));
        }

        // ["3", "2", "1"] => ["1", "2", "3"]
        for (; i < aKeySequence.length; ++i) {
            numSequence.unshift(Number(aKeySequence[i]));
        }

        var base = 1;
        for (i = 0; i < numSequence.length; base *= 10, ++i) {
            arg += (numSequence[i] * base);
        }

        // this.message("prefix : " + coef * arg);

        return coef * arg;
    },

    /**
     * @param {String} aKey literal expression of the aEvent
     * @param {Event} aEvent key event
     * @return {Boolean} true, is the key specified by aKey and aEvent
     *         will be followed by prefix argument
     */
    isPrefixArgumentKey: function (aKey, aEvent) {
        return (aKey == "C-u"   ||
                // negative argument
                aKey == "M--"   ||
                aKey == "C--"   ||
                aKey == "C-M--" ||
                // C-degit only (M-degit is useful for tab navigation ...)
                (aEvent.ctrlKey && this.isKeyEventNum(aEvent))
               );
    },

    /**
     * @param aFunc  function to execute / iterate   
     * @param aEvent key event binded with the aFunc 
     * @param aArg   prefix argument to be passed    
     */
    executeFunction: function (aFunc, aEvent, aArg) {
        if (!aFunc.ksNoRepeat && aArg) {
            // iterate
            for (var i = 0; i < aArg; ++i) {
                // func(event, arg); => this がグローバルになる
                aFunc.apply(this.modules, [aEvent, aArg]);
            }
        } else {
            // one time
            // func(event, arg); => this がグローバルになる
            aFunc.apply(this.modules, [aEvent, aArg]);
        }
    },

    /**
     * @param aTarget   Target. in most case, this is retrieved from
     *                  event.target or event.originalTarget
     * @param aKey      key code of the key event to generate
     * @param {bool} aNoHandle when this argument is true, KeySnail does not handle
     *                  the key event generated by this method.
     */
    generateKey: function(aTarget, aKey, aNoHandle) {
        var newEvent = document.createEvent('KeyboardEvent');
        // event.initKeyEvent(type, bubbles, cancelable, viewArg,
        //                    ctrlKeyArg, altKeyArg, shiftKeyArg, metaKeyArg,
        //                    keyCodeArg, charCodeArg)
        newEvent.initKeyEvent('keypress', true, true, null,
                              false, false, false, false,
                              aKey, 0);
        if (aNoHandle) {
            // KeySnail does not handle this key event.
            // See "handleEvent".
            newEvent.ksNoHandle = true;
        }
        aTarget.dispatchEvent(newEvent);
    },

    /**
     * original code from Firemacs            
     * http://www.mew.org/~kazu/proj/firemacs/
     * @param {String} text
     * @return
     */
    insertText: function (text) {
        var command = 'cmd_insertText';
        var controller = document.commandDispatcher.getControllerForCommand(command);
        if (controller && controller.isCommandEnabled(command)) {
            controller = controller.QueryInterface(Components.interfaces.nsICommandController);
            var params = Components.classes['@mozilla.org/embedcomp/command-params;1'];
            params = params.createInstance(Components.interfaces.nsICommandParams);
            params.setStringValue('state_data', text);
            controller.doCommandWithParams(command, params);
        }
    },

    /**
     * 
     * @param {} aContentHolder
     * @param {} aKeyMap
     * @param {} aKeySequence
     * @return
     */
    generateKeyBindingRows: function (aContentHolder, aKeyMap, aKeySequence) {
        if (!aKeyMap) {
            return;
        }

        if (!aKeySequence) {
            aKeySequence = [];
        }

        for (i in aKeyMap) {
            switch (typeof(aKeyMap[i])) {
            case "function":
                var pad = (aKeySequence.length  == 0) ? "" : " ";
                aContentHolder.push("<tr><td>" +
                                    this.modules.html
                                    .escapeTag(aKeySequence.join(" ") + pad + i) +
                                    "</td>" + "<td>" +
                                    this.modules.html
                                    .escapeTag(aKeyMap[i].ksDescription) +
                                    "</td></tr>");
                break;
            case "object":
                aKeySequence.push(i);
                this.generateKeyBindingRows(aContentHolder, aKeyMap[i], aKeySequence);
                aKeySequence.pop();
                break;
            }
        }
    },

    /**
     * 
     * @param {} aContentHolder
     * @param {} aH2
     * @param {} aAnchor
     * @param {} aKeyMap
     * @param {} aKeySequence
     * @return
     */
    generateKeyBindingTable: function (aContentHolder, aH2, aAnchor, aKeyMap, aKeySequence) {
        if (aKeyMap) {
            aContentHolder.push("<h2 id='" + aAnchor + "'>" + aH2 + "</h2>");
            aContentHolder.push("<table class='table-keybindings'>");
            aContentHolder.push("<tr><th>" + "Key" + "</th><th>" + "Binding" + "</th></tr>");
            this.generateKeyBindingRows(aContentHolder, aKeyMap, aKeySequence);
            aContentHolder.push("</table>\n");
        }
    },

    // 現在のキーシーケンスから可能なキーバインド一覧を表示
    interactiveHelp: function () {
        var contentHolder = ['<h1>Key Bindings Starting With ' +
                             this.currentKeySequence.join(" ") + '</h1><hr />'];

        this.generateKeyBindingTable(contentHolder,
                                     "Global Bindings Starting With "
                                     + this.currentKeySequence.join(" "),
                                     this.modes.GLOBAL,
                                     this.trailByKeySequence(this.keyMapHolder[this.modes.GLOBAL],
                                                             this.currentKeySequence),
                                     this.currentKeySequence);

        this.generateKeyBindingTable(contentHolder,
                                     "View mode Bindings Starting With "
                                     + this.currentKeySequence.join(" "),
                                     this.modes.VIEW,
                                     this.trailByKeySequence(this.keyMapHolder[this.modes.VIEW],
                                                             this.currentKeySequence),
                                     this.currentKeySequence);

        this.generateKeyBindingTable(contentHolder,
                                     "Edit mode Bindings Starting With "
                                     + this.currentKeySequence.join(" "),
                                     this.modes.EDIT,
                                     this.trailByKeySequence(this.keyMapHolder[this.modes.EDIT],
                                                             this.currentKeySequence),
                                     this.currentKeySequence);

        this.generateKeyBindingTable(contentHolder,
                                     "Caret mode Bindings Starting With "
                                     + this.currentKeySequence.join(" "),
                                     this.modes.CARET,
                                     this.trailByKeySequence(this.keyMapHolder[this.modes.CARET],
                                                             this.currentKeySequence),
                                     this.currentKeySequence);

        var contentSource = this.modules.html
            .createHTMLSource("Interactive Help", contentHolder.join("\n"));
        var contentPath = this.modules.html
            .createHTML(contentSource);

        gBrowser.loadOneTab(contentPath, null, null, null, false, false);
    },

    // 全てのキーバインドを一覧
    listKeyBindings: function () {
        var contentHolder = ['<h1>All key bindings</h1><hr />',
                             '<ul>',
                             '<li><a href="#special">Special Keys</a></li>',
                             '<li><a href="#global">Global Bindings</a></li>',
                             '<li><a href="#view">View mode Bindings</a></li>',
                             '<li><a href="#edit">Edit mode Bindings</a></li>',
                             '<li><a href="#caret">Caret mode Bindings</a></li>',
                             '</ul>'];

        with (this.modules.html) {
            contentHolder.push("<h2 id='special'>Special Keys</h2>");
            contentHolder.push("<table class='table-keybindings'>");
            contentHolder.push("<tr><th>Role</th><th>Key</th></tr>");
            contentHolder.push("<tr><td>Quit key</td><td>" + escapeTag(this.quitKey) + "</td></tr>");
            contentHolder.push("<tr><td>Help key</td><td>" + escapeTag(this.helpKey) + "</td></tr>");
            contentHolder.push("<tr><td>Escape key</td><td>" + escapeTag(this.escapeKey) + "</td></tr>");
            contentHolder.push("<tr><td>Start key macro recording</td><td>" + escapeTag(this.macroStartKey) + "</td></tr>");
            contentHolder.push("<tr><td>End key macro recording / Play key macro</td><td>" + escapeTag(this.macroEndKey) + "</td></tr>");
            contentHolder.push("</table>\n");
        }

        this.generateKeyBindingTable(contentHolder,
                                     "Global Bindings",
                                     this.modes.GLOBAL,
                                     this.keyMapHolder[this.modes.GLOBAL]);

        this.generateKeyBindingTable(contentHolder,
                                     "View mode Bindings",
                                     this.modes.VIEW,
                                     this.keyMapHolder[this.modes.VIEW]);

        this.generateKeyBindingTable(contentHolder,
                                     "Edit mode Bindings",
                                     this.modes.EDIT,
                                     this.keyMapHolder[this.modes.EDIT]);

        this.generateKeyBindingTable(contentHolder,
                                     "Caret mode Bindings",
                                     this.modes.CARET,
                                     this.keyMapHolder[this.modes.CARET]);

        var contentSource = this.modules.html
            .createHTMLSource("All key bindings", contentHolder.join("\n"));
        var contentPath = this.modules.html
            .createHTML(contentSource);

        gBrowser.loadOneTab(contentPath, null, null, null, false, false);
    },

    message: KeySnail.message
};

// event.altKey   -- Alt key
// event.ctrlKey  -- Control key
// event.shiftKey
// event.metaKey

// event.keyCode

// "\C-n" => ctrl + n
// "\C-np" => (ctrl + n), p
