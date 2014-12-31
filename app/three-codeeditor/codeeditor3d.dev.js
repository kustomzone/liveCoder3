// Users/robert/Lively/3D/three-codeeditor/codeeditor3d.dev.js

// =====================================================================================================================

// index.js

/*global THREE,ace*/

;(function() {

    // "imports"
  var aceHelper, rendering, canvas2d, domevents,
      mouseevents, commands, raycasting;
	  
  // "imports" assigned here because they are first available after this module got defined
  function imports() {
    aceHelper           = THREE.CodeEditor.aceHelper,
    rendering           = THREE.CodeEditor.rendering,
    canvas2d            = THREE.CodeEditor.canvas2d,
    mouseevents         = THREE.CodeEditor.mouseevents;
    domevents           = THREE.CodeEditor.domevents;
    commands            = THREE.CodeEditor.commands;
    raycasting          = THREE.CodeEditor.raycasting;
  }

  // -=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-

  if (!THREE.CodeEditor) {
    THREE.CodeEditor = function CodeEditor() { this.initialize.apply(this, arguments); }
    THREE.CodeEditor.prototype = Object.create(THREE.Mesh.prototype);
  } else imports();

  (function() {

    this.isCodeEditor3D = true;

    // -=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-
    // initialize-release
    // -=-=-=-=-=-=-=-=-=-

    this.initialize = function(canvas3dElement, events, optAceEditor) {
      imports();

      this.events = events;

      // supported events: resize
      lively.lang.events.makeEmitter(this);

      var width = 400, height = 400;
      var editorGeo = plane(
        new THREE.Vector3(-width/2, height/2,0),
        new THREE.Vector3( width/2, height/2,0),
        new THREE.Vector3( width/2,-height/2,0),
        new THREE.Vector3(-width/2,-height/2,0));

      // building the html canvas that will be used as a texture
      var canvas = this.canvas2d = canvas2d.create(width, height),
          texture	= new THREE.Texture(canvas),
          material= new THREE.MeshBasicMaterial({
            color: "white", map: texture,
            side: THREE.DoubleSide});

      // var maxAnisotropy = renderer.getMaxAnisotropy();
    	// texture.anisotropy = 16;

      THREE.Mesh.call(this, editorGeo, material);

      editorGeo.computeBoundingBox();
      this.position.copy(editorGeo.boundingBox.center());

      // creating the ace editor instance that will work behind the scenes as our "model"
      var aceEditor;
      if (optAceEditor) this.aceEditor = aceEditor = optAceEditor
      else {
        aceEditor = this.aceEditor = aceHelper.createAceEditor(
          canvas3dElement.offsetLeft, canvas3dElement.offsetTop, width, height);
      }

      aceEditor.parent3d = this; // backlink for autocompleter

      var self = this;
      aceEditor.renderer.on("afterRender", function() { rendering.onAceEditorAfterRenderEvent(aceEditor, self); });
      aceEditor.renderer.on("themeChange", function() { self.invalidateScrollbar(); });
      aceEditor.renderer.on("resize",      function() { self.invalidateScrollbar(); });
      aceEditor.renderer.on("autosize",    function() { self.invalidateScrollbar(); });

      texture.needsUpdate	= true;

      this.addMouseEventListeners();

      // command setup
      commands.javascript.forEach(function(cmd) {
        aceEditor.commands.addCommand(cmd); });
      aceEditor.setOption("useIncrementalSearch", true);
    }

    this.destroy = function() {
      // FIXME remove mouse handler...
      this.canvas2d.cleanup();
      this.canvas2d = null;
      this.aceEditor.cleanup();
      this.aceEditor = null;
    };

    // -=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-
    // editor behavior
    // -=-=-=-=-=-=-=-=-=-

    this.setValue = function(text) {
      this.aceEditor.setValue(text);
    };

    this.insert = function(text, noTransform) {
      // insert text at cursor
      this.aceEditor.insert(text, noTransform);
    };

    // -=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-
    // input events
    // -=-=-=-=-=-=-

    this.scrollSpeed = 1;

    this.addMouseEventListeners = function() {
      mouseevents.patchTHREExDOMEventInstance(this.events);
      if (this._onMouseDown || this._onMouseMove || this._onMouseWheel) this.removeMouseEventListeners();

      this._onMouseDown  = function(evt) { return this.onMouseDown(evt); }.bind(this);
      this._onMouseMove  = function(evt) { return this.onMouseMove(evt); }.bind(this);
      this._onMouseWheel = function(evt) { return this.onMouseWheel(evt); }.bind(this);
      this._onMouseOver = function(evt) {  return this.onMouseOver(evt); }.bind(this);
      this._onMouseOut = function(evt) { return this.onMouseOut(evt); }.bind(this);

      this.events.addEventListener(this, 'mousedown', this._onMouseDown, false);
      this.events.addEventListener(this, 'mousemove', this._onMouseMove, false);
      this.events.addEventListener(this, 'mousewheel', this._onMouseWheel, false);
      this.events.addEventListener(this, 'mouseover', this._onMouseOver, false);
      this.events.addEventListener(this, 'mouseout', this._onMouseOut, false);
    }

    this.removeMouseEventListeners = function() {
      this._onMouseDown  && this.events.removeEventListener(this, 'mousedown', this._onMouseDown, false);
      this._onMouseMove  && this.events.removeEventListener(this, 'mousemove', this._onMouseMove, false);
      this._onMouseWheel && this.events.removeEventListener(this, 'mousewheel', this._onMouseWheel, false);
      this._onMouseOver  && this.events.removeEventListener(this, "mouseover", this._onMouseOver, false);
      this._onMouseOut   && this.events.removeEventListener(this, "mouseout", this._onMouseOut, false);
      this._onMouseDown = null;
      this._onMouseMove = null;
      this._onMouseWheel = null;
      this._onMouseOver = null;
      this._onMouseOut = null;
    }

    this.onMouseDown = function(evt) {
      // clicked on scrollbar?
      if (mouseevents.processScrollbarMouseEvent(
          this.events, this, this.clickState, evt)) return true;

      var aceCoords = raycasting.raycastIntersectionToDomXY(evt.intersect, this.aceEditor.container);
      mouseevents.reemit3DMouseEvent(this.events, evt.origDomEvent, this.clickState, this, aceCoords);
    }

    this.onMouseMove = function(evt) {
      var aceCoords = raycasting.raycastIntersectionToDomXY(evt.intersect, this.aceEditor.container);
      mouseevents.reemit3DMouseEvent(this.events, evt.origDomEvent, this.clickState, this, aceCoords);
    }

    this.onMouseWheel = function(evt) {
      var aceCoords = raycasting.raycastIntersectionToDomXY(evt.intersect, this.aceEditor.container);
      mouseevents.reemit3DMouseEvent(this.events, evt.origDomEvent, this.clickState, this, aceCoords);
    }

    this.onMouseOver = function(evt) {
return;
      if (evt.target !== this) return;
      var noMouse = !mouseevents.isLeftMouseButtonPressed(evt)
                 && !mouseevents.isRightMouseButtonPressed(evt);
      if (noMouse) this.aceEditor.focus();
      if (noMouse) console.log("ficussed!!");
    };

    this.onMouseOut = function(evt) {
return;
      console.log("blur!!");
      this.aceEditor.blur();
    };

    this.getScrollbar = function() {
      return this.scrollbar || (this.scrollbar = createScrollbar(this.aceEditor));
    }

    this.invalidateScrollbar = function() { this.scrollbar = null; }

    this.clickState = {
      lastClickTime: 0,
      doubleClickTriggerTime: 500,
      scrollbarClickPoint: null
    };

    // -=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-
    // geometry
    // -=-=-=-=-

    this.getWidth = function() { return this.getSize().x; };
    this.getHeight = function() { return this.getSize().y; };

    this.setHeight = function(height) { return this.setSize(this.getWidth(), height); };
    this.setWidth = function(width) { return this.setSize(width, this.getHeight()); };

    this.getSize = function() {
      this.geometry.computeBoundingBox();
      return this.geometry.boundingBox.size();
    };

    this.setSize = function(width, height) {
      this.aceEditor.container.style.width = width + "px";
      this.aceEditor.container.style.height = height + "px";
      this.canvas2d.width = width;
      this.canvas2d.height = height;
      this.geometry.vertices = [
        new THREE.Vector3(-width/2, height/2,0),
        new THREE.Vector3( width/2, height/2,0),
        new THREE.Vector3(-width/2,-height/2,0),
        new THREE.Vector3( width/2,-height/2,0)]

      this.material.map.needsUpdate = true;
      this.aceEditor.resize(true);
      this.geometry.verticesNeedUpdate = true;
      // for events:
      this.geometry.computeBoundingBox();
      this.geometry.computeBoundingSphere();
      this.emit("resize", {x: width, y: height});
    };

    this.getGlobalVertice = function(i) {
      return this.geometry.vertices[i].clone().applyMatrix4(this.matrixWorld);
    };

    this.topLeft = function() { return this.getGlobalVertice(0); };
    this.topRight = function() { return this.getGlobalVertice(1); };
    this.bottomLeft = function() { return this.getGlobalVertice(2); };
    this.bottomRight = function() { return this.getGlobalVertice(3); };

    // -=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-
    // positioning
    // -=-=-=-=-=-=-
    this.alignWithCamera = function(leftRightOrCenter, camera) {
      // offset: // -1 left, 0 center, 1 right
      this.geometry.computeBoundingBox()
      var margin = 200;
      var size = this.geometry.boundingBox.size()
      var dist = (size.y+margin) / 2 / Math.tan(Math.PI * camera.fov / 360);
    	var center = raycasting.pickingRay({x:0,y:0}, camera).ray.at(dist);

      this.position.copy(center);
      this.lookAt(camera.position);

      if (leftRightOrCenter === "center") return;
    // 	var projectionPoint = raycasting.pickingRay({x:-1,y:0}, camera).ray.at(dist);
    // 	var delta = projectionPoint.clone().sub(center);
    //   align(this, this.topLeft(), projectionPoint)
    //   this.position.copy(projectionPoint.clone());
    //   this.lookAt(camera.position.clone().add(delta));
    //   this.position.add(this.topRight().clone().sub(this.topLeft()).multiplyScalar(.5));
    //   return;

      // move the editor to the left side until it reaches the screen border...
      // ugly! I should use fov and stuff to compute the coordinates but its soooo late already.... :P
      camera.updateMatrix()
      camera.updateMatrixWorld()
      var delta = camera.up.clone().cross(this.position.clone().sub(camera.position)).normalize()
      if (leftRightOrCenter === "right") delta.negate();
      var frustum = new THREE.Frustum();
      frustum.setFromMatrix( new THREE.Matrix4().multiply( camera.projectionMatrix, camera.matrixWorldInverse ) );
      var bounds = new THREE.Box3().setFromObject(this);
      do { // move left unti we "hit" the corner of the editor
        this.position.add(delta);
        this.updateMatrixWorld();
        var pointsToCheck = leftRightOrCenter === "right" ?
          [this.topRight(), this.bottomRight()] : [this.topLeft(), this.bottomLeft()]
      } while (pointsToCheck.every(function(p) { return frustum.containsPoint(p); }));

    }

    this.autoAlignWithCamera = function(dir, camera) {
      var cameraState, editorState, editor = this;;

      this.stopAutoAlignWithCamera();

      rememberState();
      editor.alignWithCamera(dir, camera);

      editor._autoAlignWithCameraInterval = setInterval(function() {
        if (!hasCameraChanged() && !hasEditorChanged()) return;
        rememberState();
        lively.lang.fun.debounceNamed("autoAlignWithCamera", 200,
          editor.alignWithCamera.bind(editor, dir, camera))();
      }, 100);

      function rememberState() {
        editorState = {wasResized: false, position: editor.position.clone()};
        editor.once("resize", function() { editorState.wasResized = true; });
        cameraState = lively.lang.obj.extract(
          ["position", "rotation", "fov", "aspect", "zoom"], camera,
          function(k, val) { return val && val.clone ? val.clone() : val; });
      }

      function hasCameraChanged() {
        return Object.keys(cameraState).some(function(k) {
          if (!cameraState[k]) return false;
          if (cameraState[k].equals) return !cameraState[k].equals(camera[k]);
          return cameraState[k] !== camera[k];
        });
      }

      function hasEditorChanged() {
        return editorState.wasResized || !editorState.position.equals(editor.position);
      }
    };

    this.stopAutoAlignWithCamera = function() {
      if (this._autoAlignWithCameraInterval) {
        clearInterval(this._autoAlignWithCameraInterval);
        delete this._autoAlignWithCameraInterval;
      }
    }
  }).call(THREE.CodeEditor.prototype);


  // -=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-
  // helper
  // -=-=-=-

  function align(object, x, y) { return object.position.add(y.clone().sub(x)); }

  function notYetImplemented() { console.warn("NOT YET IMPLEMENTED"); }

  function plane(a,b,c,d) {
    var vec1 = b.clone().sub(a), vec2 = d.clone().sub(a);
    return new THREE.PlaneBufferGeometry(vec1.length(), vec2.length(), 1,1);
  }

  function createScrollbar(aceEditor) {
    var renderer       = aceEditor.renderer, scrollBarV = renderer.scrollBarV,
        editorStyle    = window.getComputedStyle(renderer.container),
        relativeHeight = scrollBarV.element.clientHeight / scrollBarV.inner.clientHeight,
        relativeTop    = scrollBarV.scrollTop / scrollBarV.inner.clientHeight,
        height         = scrollBarV.element.clientHeight,
        borderWidth    = 3,
        width          = 10,
        col            = new THREE.Color(editorStyle.backgroundColor),
        isDarkTheme    = (col.r+col.g+col.b)/3 < .5,
        backgroundColor = col.clone().add(col.clone().multiplyScalar(-.4)).getStyle();
    return {
        height: height * relativeHeight - borderWidth,
        width: width - borderWidth,
        get top() { return height * (scrollBarV.scrollTop / scrollBarV.inner.clientHeight) + borderWidth; },
        left: renderer.container.clientWidth - width - borderWidth,
        borderWidth: borderWidth,
        backgroundColor: backgroundColor,
        borderColor: isDarkTheme ? col.add(new THREE.Color('white').multiplyScalar(.2)).getStyle() : backgroundColor,
        borderRounding: 4
      };
  }

})(THREE);

// =====================================================================================================================

// helper.js

function loadUncached(urls, thenDo) {
  if (!urls.length) { thenDo && thenDo(); return; }
  var url = urls.shift();
  var script = document.createElement('script');
  script.src = url + (url.indexOf('?') > -1 ? '&' : '?' + Date.now());
  document.head.appendChild(script);
  script.addEventListener('load', function() { loadUncached(urls, thenDo); });
}

function show(obj) {
  if (!obj) return console.log("SHOW: %s", obj);
  if (obj.show) return obj.show();
  if (obj.x && obj.y && !obj.z) {
    var rect = document.createElement("div");
    var w = 10, h = 10, l = obj.x - w/2, t = obj.y - h/2, color = 'red';
    rect.style.position = "absolute";
    rect.style.left = l + "px";
    rect.style.top = t + "px";
    rect.style.width = w + "px";
    rect.style.height = h + "px";
    rect.style.backgroundColor = color
    document.body.appendChild(rect);
    setTimeout(function() { rect.parentNode.removeChild(rect); }, 3*1000);
    return rect;
  }
  else return console.log("SHOW: %s", lively.lang.obj.inspect(obj, {maxDepth: 4}));
}

// =====================================================================================================================

// commands.js


;(function(exports) {

  // -=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-
  // selection helper
  // -=-=-=-=-=-=-=-=-

  function saveExcursion(ed, doFunc) {
    // will remember the current selection. doFunc can change the
    // selection, cursor position etc and then invoke the passed in callback
    // `reset` to undo those changes
    var currentRange = ed.selection.getRange();
    function reset() { ed.selection.setRange(currentRange); }
    return doFunc.call(null, reset);
  }

  function collapseSelection(ed, dir) {
    // dir = 'start' || 'end'
    var sel = ed.selection, range = sel.getRange();
    dir && sel.moveCursorToPosition(range[dir]);
    sel.clearSelection();
  }

  function extendSelectionRange(ed, delta) {
    if (!delta) return;
    var dir = delta > 0 ? 'end' : 'start',
        range = ed.selection.getRange(),
        idx = ed.session.doc.positionToIndex(range[dir]),
        extendPos = ed.session.doc.indexToPosition(idx + delta),
        extendedRange = ed.selection.getRange().extend(extendPos.row, extendPos.column);
    return ed.selection.setRange(extendedRange);
  }

  function getSelectionOrLineString(ed, range) {
    if (!range || range.isEmpty()) {
      range = ed.selection.getLineRange(undefined, true);
      ed.selection.setRange(range);
    }
    return ed.session.getTextRange(range);
  }

  function getSelectionMaybeInComment(ed) {
    // FIXME, use tokens!!!
    /*   If you click to the right of '//' in the following...
    'wrong' // 'try this'.slice(4)  //should print 'this'
    'http://zork'.slice(7)          //should print 'zork'
    */
      // If click is in comment, just select that part
    var range = ed.selection.getRange(),
        isNullSelection = range.isEmpty(),
        pos = range.start,
        text = getSelectionOrLineString(ed, range);

    if (!isNullSelection) return text;
  
    // text now equals the text of the current line, now look for JS comment
    var idx = text.indexOf('//');
    if (idx === -1                          // Didn't find '//' comment
        || pos.column < idx                 // the click was before the comment
        || (idx>0 && (':"'+"'").indexOf(text[idx-1]) >=0)    // weird cases
        ) return text;
  
    // Select and return the text between the comment slashes and end of method
    range.start.column = idx+2; range.end.column = text.length;

    ed.selection.setRange(range);
    return text.slice(idx+2);
  }

  // -=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-
  // eval helper
  // -=-=-=-=-=-=-

  function printObject(ed, obj, suppressSelection, asComment, optTransformFunc) {
    // inserts a stringified representation of object into editor
    // the current selection is cleared and the stringified representation
    // is inserted at the end (in terms of document position) of the current
    // selection (or at the cursor pos if no sel is active)

    collapseSelection(ed, 'end');
    var string;
    try {
        string = obj instanceof Error ? printError(obj) : String(obj);
    } catch (e) { string = printError(e); }
    if (asComment) string = commentify(string, ed.session.getMode().lineCommentStart);
    ed.onPaste(string);
    if (!suppressSelection) extendSelectionRange(ed, -string.length);

    function printError(err) {
      var string = String(err.stack || err);
      return string.indexOf(err) > -1 ? string : err + '\n' + string;
    }
  
    function commentify(string, lineCommentStart) {
      return " " + lineCommentStart + Strings.lines(string)
        .join('\n' + lineCommentStart + " ")
    }
  }

  function doit(ed, printResult, printAsComment) {
    var text = getSelectionMaybeInComment(ed),
        range = ed.selection.getRange(),
        result = tryBoundEval(text, {range: {start: {index: range[0]}, end: {index: range[1]}}});
    if (printResult) {
      if (printAsComment) {
        try { result = " => " + lively.lang.obj.inspect(result, {maxDepth: 4});
        } catch (e) { result = " => Error printing inspect view of " + result + ": " + e; }
      }
      if (typeof printResult === "function") { // transform func
        result = printResult(result);
      }
      printObject(ed, result, false, printAsComment, printResult);
      return;
    }
    if (result && result instanceof Error) {
        console.error("doit error:\n" + (result.stack || result));
    }
    if (ed.selection.isEmpty()) ed.selection.selectLine();
    return result;
  }

  function tryBoundEval(__evalStatement, options) {
    options = options || {};
    if (!options.sourceURL) options.sourceURL = doit + "-" + Date.now();
    try {
      return lively.vm.syncEval(__evalStatement, {
        context: options.context || window,
        topLevelVarRecorder: window,
        varRecorderName: 'window',
        dontTransform: lively.ast.query.knownGlobals,
        sourceURL: options ? options.sourceURL : undefined
      });
    } catch(e) { return e; }
  }

  // -=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-
  // command helper
  // -=-=-=-=-=-=-=-

  function maybeUseModeFunction(modeMethodName, staticArgs, defaultAction) {
    if (!defaultAction && typeof staticArgs === "function") {
      defaultAction = staticArgs; staticArgs = null;
    }
    if (!staticArgs) staticArgs = [];
    return function(ed, args) {
      args = args || [];
      var mode = ed.session.getMode();
      if (!mode[modeMethodName] && defaultAction) defaultAction.call(null, ed, staticArgs.concat([args]));
      else mode[modeMethodName].apply(mode, [ed].concat(staticArgs).concat(Array.isArray(args) ? args : [args]));
    }
  }

  // -=-=-=-=-=-=-=-=-=-=-
  // javascript commands
  // -=-=-=-=-=-=-=-=-=-=-

  exports.javascript = [{
    name: 'evalAll',
      exec: function(ed, args) {
        if (args && args.confirm) {
            console.log('Evaluating complete text...');
        }
        maybeUseModeFunction("doEval", function(ed, args) {
          saveExcursion(ed, function(whenDone) {
            ed.selectAll(); doit(ed, false); whenDone(); });
        });
      },
      handlesCount: true,
      readOnly: true
  }, {
      name: 'doit',
      bindKey: {win: 'Ctrl-D',  mac: 'Command-D|Ctrl-D'},
      exec: maybeUseModeFunction("doit", function(ed, args) { doit(ed, false); }),
      multiSelectAction: "forEach",
      readOnly: true
  }, {
      name: 'printit',
      bindKey: {win: 'Ctrl-P',  mac: 'Command-P|Ctrl-P'},
      exec: maybeUseModeFunction("printit", function(ed, args) { doit(ed, true); }),
      multiSelectAction: "forEach",
      readOnly: false
  }, {
      name: 'list protocol',
      bindKey: {win: 'Ctrl-Shift-P',  mac: 'Command-Shift-P'},
      exec: function(ed, args) {

        // FIIIIIIIIXME
        lv.l2l.session.actions.completions(
          {data: {expr: getSelectionOrLineString(ed)}}, {answer: function(_, answer) {
            var props = lively.lang.chain(answer.completions).pluck(1).flatten().value();
            printObject(ed, props.join("\n"), false, true);
          }})

      },
      multiSelectAction: "single",
      readOnly: false
  }, {
      name: 'doSave',
      bindKey: {win: 'Ctrl-S',  mac: 'Command-S|Ctrl-S'},
      exec: function() { console.warn("do save command is not yet implemented"); },
      multiSelectAction: "single",
      readOnly: false
  }, {
      name: 'printInspect',
      bindKey: {win: 'Ctrl-I',  mac: 'Command-i|Ctrl-i'},
      exec: maybeUseModeFunction("printInspect", function(ed, args) {
        doit(ed, function(result) {
          return result instanceof Error ?
            result.stack || String(result) :
            lively.lang.obj.inspect(result, {maxDepth: args && args.count ? args.count : 1});
        });
      }),
      multiSelectAction: "forEach",
      handlesCount: true,
      readOnly: true
  }, {
    bindKey: "Command-o|Ctrl-o",
    exec: function(ed, args) {
     // implemented to not trigger open command
    }
  }];

})(THREE.CodeEditor.commands || (THREE.CodeEditor.commands = {}));


// =====================================================================================================================

// ace-helper.js


;(function(exports) {

  exports.createAceEditor = createAceEditor;

  function createAceEditor(posX, posY, width, height) {
    var el = document.createElement("div");
    document.body.appendChild(el);
    el.style.width = width + "px"
    el.style.height = height + "px";
    el.style.left = (posX || 0) + "px";
    el.style.top = (posY || 0) + "px";
    el.style.zIndex = -1000;
    // el.style.visibility = "hidden";
    el.style.position = "fixed";
    var editor = ace.edit(el);
    editor.setTheme("ace/theme/twilight");
    editor.getSession().setMode("ace/mode/javascript");
    editor.setOption("useWorker", false);
    editor.setOption("showGutter", false);
    editor.setOption("tabSize", 2);
  
    editor.cleanup = function() {
      editor.renderer.removeAllListeners("afterRender");
      el.parentNode.removeChild(editor.container);
      editor.destroy();
    }
  
    return editor;
  }

})(THREE.CodeEditor.aceHelper || (THREE.CodeEditor.aceHelper = {}));


// =====================================================================================================================

// canvas2d.js


;(function(exports) {

  exports.create = create;

  function create(width, height) {
    var el = document.createElement("canvas");
    document.body.appendChild(el);
    el.width = width; el.height = height;
    el.style.position = "absolute";
    el.style.left = 0;
    el.style.top = 0;
    el.style.width = width + "px";
    el.style.height = height + "px";
    el.style.visibility = 'hidden';
    el.cleanup = function() { el.parentNode.removeChild(el) };
    return el;
  }

})(THREE.CodeEditor.canvas2d || (THREE.CodeEditor.canvas2d = {}));


// =====================================================================================================================

// domevents.js


;(function(exports) {

  exports.retargetDOMEvent = retargetDOMEvent;
  exports.isFullscreen;

  // -=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-

  var isFirefox = !!navigator.userAgent.match(/Firefox\//);

  exports.isFullscreen = function isFullscreen() {
    return !!document.fullScreenElement
        || !!document.webkitFullScreenElement
        || !!document.mozFullScreenElement;
  };

  function retargetDOMEvent(evt, newTargetPos, newTargetEl) {
    newTargetPos = newTargetPos || {x:0, y:0};
    if (evt.hasCodeEditor3DPatch) return evt;

    var x = newTargetPos.x,
        y = newTargetPos.y,
        fakeEvt = Object.create(evt)

    if (isFirefox) { // Firefox throws errors when we try to access the inherited attributes...
      // https://developer.mozilla.org/en-US/docs/Web/API/UIEvent
      Object.defineProperty(fakeEvt, "detail",        {value: evt.detail});
      Object.defineProperty(fakeEvt, "view",          {value: evt.view});
      // https://developer.mozilla.org/en-US/docs/Web/API/MouseEvent
      Object.defineProperty(fakeEvt, "altKey",        {value: evt.altKey});
      Object.defineProperty(fakeEvt, "button",        {value: evt.button});
      Object.defineProperty(fakeEvt, "buttons",       {value: evt.buttons});
      // Object.defineProperty(fakeEvt, "clientX",       {value: evt.clientX});
      // Object.defineProperty(fakeEvt, "clientY",       {value: evt.clientY});
      Object.defineProperty(fakeEvt, "ctrlKey",       {value: evt.ctrlKey});
      Object.defineProperty(fakeEvt, "metaKey",       {value: evt.metaKey});
      Object.defineProperty(fakeEvt, "movementX",     {value: evt.movementX});
      Object.defineProperty(fakeEvt, "movementY",     {value: evt.movementY});
      Object.defineProperty(fakeEvt, "mozMovementX",     {value: evt.mozMovementX});
      Object.defineProperty(fakeEvt, "mozMovementY",     {value: evt.mozMovementY});
      Object.defineProperty(fakeEvt, "relatedTarget", {value: evt.relatedTarget});
      Object.defineProperty(fakeEvt, "screenX",       {value: evt.screenX});
      Object.defineProperty(fakeEvt, "screenY",       {value: evt.screenY});
      Object.defineProperty(fakeEvt, "shiftKey",      {value: evt.shiftKey});
      Object.defineProperty(fakeEvt, "which",         {value: evt.which});

      Object.defineProperty(fakeEvt, "eventPhase",    {value: evt.eventPhase});
      Object.defineProperty(fakeEvt, "bubbles",       {value: evt.bubbles});
      Object.defineProperty(fakeEvt, "cancelable",    {value: evt.cancelable});
      Object.defineProperty(fakeEvt, "timeStamp",     {value: evt.timeStamp});
    }

    Object.defineProperty(fakeEvt, "pageX",                {value: x});
    Object.defineProperty(fakeEvt, "pageY",                {value: y});
    Object.defineProperty(fakeEvt, "clientX",              {value: x});
    Object.defineProperty(fakeEvt, "clientY",              {value: y});
    Object.defineProperty(fakeEvt, "x",                    {value: x});
    Object.defineProperty(fakeEvt, "y",                    {value: y});
    Object.defineProperty(fakeEvt, "layerX",               {value: x});
    Object.defineProperty(fakeEvt, "layerY",               {value: y});
    Object.defineProperty(fakeEvt, "target",               {value: newTargetEl});
    // Object.defineProperty(fakeEvt, "currentTarget", {value: evt.currentTarget});
    Object.defineProperty(fakeEvt, "srcElement",           {value: newTargetEl});
    Object.defineProperty(fakeEvt, "hasCodeEditor3DPatch", {value: true});
    Object.defineProperty(fakeEvt, "preventDefault",       {value: function() { evt.preventDefault(); }});
    Object.defineProperty(fakeEvt, "stopPropagation",       {value: function() { evt.stopPropagation(); }});
    Object.defineProperty(fakeEvt, "type",                 {value: evt.type});

    if (evt.type === 'mousewheel' || evt.type === 'wheel') patchWheelEvent(evt, fakeEvt);
    // if (evt.type === 'mousewheel') console.log("%s,%s", fakeEvt.wheelX, fakeEvt.wheelY);

    return fakeEvt;
  }

  var patchWheelEvent = (function() {
    var el = document.body;
    if ("onmousewheel" in el) {
      return function(origEvt, fakeEvt) {
        var factor = 8;
        if (origEvt.wheelDeltaX !== undefined) {
          fakeEvt.wheelX = -origEvt.wheelDeltaX / factor;
          fakeEvt.wheelY = -origEvt.wheelDeltaY / factor;
        } else {
          fakeEvt.wheelX = 0;
          fakeEvt.wheelY = -origEvt.wheelDelta / factor;
        }
      }
    } else if ("onwheel" in el) {
      return function(origEvt, fakeEvt) {
        var factor = 0.35;
        switch (origEvt.deltaMode) {
          case origEvt.DOM_DELTA_PIXEL:
            fakeEvt.wheelX = origEvt.deltaX * factor || 0;
            fakeEvt.wheelY = origEvt.deltaY * factor || 0;
              break;
          case origEvt.DOM_DELTA_LINE:
          case origEvt.DOM_DELTA_PAGE:
            fakeEvt.wheelX = (origEvt.deltaX || 0) * 5;
            fakeEvt.wheelY = (origEvt.deltaY || 0) * 5;
              break;
        }
      }
    } else {
      return function(origEvt, fakeEvt) {
        if (origEvt.axis && origEvt.axis == origEvt.HORIZONTAL_AXIS) {
          fakeEvt.wheelX = (origEvt.detail || 0) * 5;
          fakeEvt.wheelY = 0;
        } else {
          fakeEvt.wheelX = 0;
          fakeEvt.wheelY = (origEvt.detail || 0) * 5;
        }
      }
    }
  })();

})(THREE.CodeEditor.domevents || (THREE.CodeEditor.domevents = {}));


// =====================================================================================================================

// raycasting.js


;(function(exports) {

  // "imports"
  var retargetDOMEvent = THREE.CodeEditor.domevents.retargetDOMEvent;
  var isFullscreen     = THREE.CodeEditor.domevents.isFullscreen;

  // "exports"
  exports.getRelativeMouseXY          = getRelativeMouseXY;
  exports.getRelativeMouseXYFromEvent = getRelativeMouseXYFromEvent;
  exports.domEventRaycast             = domEventRaycast;
  exports.pickObjFromDOMEvent         = pickObjFromDOMEvent;
  exports.pickingRay                  = pickingRay;
  exports.raycastIntersectionToDomXY  = raycastIntersectionToDomXY;
  exports.convertToBrowserCoords      = convertToBrowserCoords;
  exports.convertEventPos3DtoHTML     = convertEventPos3DtoHTML;

  // -=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-


  function convertXYToOcculusCoords(coords) {
    // FIXME!! Hack...
    if (!window.world.vr || !window.world.vr.control) return coords;

    var x = coords.x, y = coords.y;

    var domainXMin = x < 0 ? -1 : 0, domainXMax = x < 0 ? 0 : 1;
    var domainYMin = -1, domainYMax = 1;

    var relX = (x + (domainXMax - domainXMin)) - domainXMax;
    var rangeXMin = -.9, rangeXMax = .9;

    var relY = (y + (domainYMax - domainYMin)) - domainYMax;
    var rangeYMin = -.8, rangeYMax = .8;

  // ((rangeYMax - rangeYMin) * relY) - (rangeYMax-rangeYMin)

    return {
      x: ((rangeXMax - rangeXMin) * relX) - rangeXMax,
      y: ((rangeYMax - rangeYMin) * relY) - (rangeYMax-rangeYMin),
      z: coords.z
    };
  }

  // convertXYToOcculusCoords({x: -0.2, y: 0})

  function getRelativeMouseXY(x, y, domElement) {
    // Converts the browser global (page) x/y coordinates
    // into relative -1/1 values. These can be used by THREE for raycasting.

		var rect = domElement.getBoundingClientRect(),
    		relX = (x - rect.left) / rect.width,
    		relY = (y - rect.top) / rect.height;

  	return convertXYToOcculusCoords({
  		x : (relX * 2) - 1,
  		y : -(relY * 2) + 1,
  		z: 0.5
  	});
  }

  function getRelativeMouseXYFromEvent(domEvent) {
    return getRelativeMouseXY(domEvent.pageX, domEvent.pageY, domEvent.target || domEvent.srcElement);
  }

  // -=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-

  // see https://github.com/mrdoob/three.js/issues/5587
  function pickingRay(coords, camera) {
    var raycaster = new THREE.Raycaster();
    // the camera is assumed _not_ to be a child of a transformed object
    if ( camera instanceof THREE.PerspectiveCamera ) {
        raycaster.ray.origin.copy( camera.position );
        raycaster.ray.direction.set( coords.x, coords.y, 0.5 ).unproject( camera ).sub( camera.position ).normalize();
    } else if ( camera instanceof THREE.OrthographicCamera ) {
        raycaster.ray.origin.set( coords.x, coords.y, - 1 ).unproject( camera );
        raycaster.ray.direction.set( 0, 0, - 1 ).transformDirection( camera.matrixWorld );
    } else {
        console.error( 'ERROR: unknown camera type.' );
    }
    return raycaster;
  }

  function domEventRaycast(domEvent, camera) {
    var mouseCoords = getRelativeMouseXYFromEvent(domEvent),
      	vector	    = new THREE.Vector3(mouseCoords.x, mouseCoords.y, 0.5);
    return pickingRay(vector, camera);
  }


  // -=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-
  // mapping of scene positions
  // -=-=-=-=-=-=-=-=-=-=-=-=-=-

  function pickObjFromDOMEvent(evt, camera, objsToPick) {
    var intersects = domEventRaycast(evt,camera).intersectObjects(objsToPick);
  	return intersects[0];
  }

  function raycastIntersectionToDomXY(intersection, domElement) {
    // Project the raycast result onto a DOM element and return the x/y coords
    // relative to domElements top left.
    if (!intersection) return null;
    var localCoords = convertToBrowserCoords(intersection, intersection.object);
    var aceCoords = {
      x: domElement.offsetLeft + localCoords.x,
      y: domElement.offsetTop + localCoords.y
    }
    return aceCoords;
  }

  function convertToBrowserCoords(intersection, mesh3D) {
    // Convert the raycast point on mesh3D into the top/left coordinate sytem
    // of the DOM. The result coords are local to the mesh3D, not its scene.
    if (!intersection) return null;
    var cache = intersection.cachedLocalBrowserCoords || (intersection.cachedLocalBrowserCoords = {});
    if (cache[mesh3D.uuid]) return cache[mesh3D.uuid];
    mesh3D.geometry.computeBoundingBox()
    var worldPoint            = intersection.point,
        size                  = mesh3D.geometry.boundingBox.size(),
        worldCenter           = mesh3D.position.clone().add(mesh3D.geometry.boundingBox.center()),
        localTopLeft          = mesh3D.worldToLocal(worldCenter).add(size.multiply(new THREE.Vector3(.5,-.5,.5))),
        localEvt              = mesh3D.worldToLocal(worldPoint.clone()),
        browserLocalTopLeft   = localTopLeft.clone().add(localEvt).multiply(new THREE.Vector3(1,-1,1))
    return cache[mesh3D.uuid] = browserLocalTopLeft;
  }

  function convertEventPos3DtoHTML(domEvent, camera, oldEventTargetEl, newEventTargetEl, sceneObject, offset) {
    // DOM evt on 3D scene -> 2D position onto dom element acting as a hypothetical target.
    // Note that `oldEventTargetEl` can be choosen by the caller, it does not
    // neet to be the actual domEvent.target. We use it when getting e.g. scroll
    // events from the ace editor (target is actually the ace editor element) but
    // while the mouse is over the 3d canvas. We then get the targeted object and
    // determine the position the event would have when we would have scrolled
    // over the ace editor directly.
    // ....
    // Takes a domEvent sent to a canvas3d element. Does a ray cast and figures
    // out if and where `sceneObject` was hit by the event (via the "intersection"
    // ray cast result). Then projects the position onto
    // `newEventTargetEl` and returns the local position where this object
    // would have been hit if it would be the actual event target.
    var offsetX = offset ? offset.x : 0,
        offsetY = offset ? offset.y : 0,
        intersection = pickObjFromDOMEvent(
          retargetDOMEvent(domEvent,
          {x: domEvent.pageX+offsetX, y: domEvent.pageY+offsetY},
          oldEventTargetEl),
          camera, [sceneObject]);
    return raycastIntersectionToDomXY(intersection, newEventTargetEl);
  }

})(THREE.CodeEditor.raycasting || (THREE.CodeEditor.raycasting = {}));


// =====================================================================================================================

// mouseevents.js


;(function(exports) {

  // -=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-
  // "imports"
  var AceMouseEvent = ace.require("ace/mouse/mouse_event").MouseEvent;
  var aceEventLib   = ace.require("ace/lib/event");

  var retargetDOMEvent = THREE.CodeEditor.domevents.retargetDOMEvent;

  var pickingRay                  = THREE.CodeEditor.raycasting.pickingRay;
  var convertToBrowserCoords      = THREE.CodeEditor.raycasting.convertToBrowserCoords;
  var convertEventPos3DtoHTML     = THREE.CodeEditor.raycasting.convertEventPos3DtoHTML;
  var getRelativeMouseXYFromEvent = THREE.CodeEditor.raycasting.getRelativeMouseXYFromEvent;

  var isFirefox = !!navigator.userAgent.match(/Firefox\//);

  // -=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-
  // "exports"
  exports.reemit3DMouseEvent         = reemit3DMouseEvent;
  exports.processScrollbarMouseEvent = processScrollbarMouseEvent;
  exports.patchTHREExDOMEventInstance = patchTHREExDOMEventInstance;
  exports.isLeftMouseButtonPressed;
  exports.isRightMouseButtonPressed;

  // -=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-
  // implementation

  exports.isLeftMouseButtonPressed = (function() {
      return isFirefox ?
          function(evt3D) { var evt = evt3D.origDomEvent; return evt.buttons === 1; } :
          function(evt3D) { var evt = evt3D.origDomEvent; return evt.which === 1 || evt.buttons === 1; }
  })();
  exports.isRightMouseButtonPressed = (function() {
      return isFirefox ?
          function(evt3D) { var evt = evt3D.origDomEvent; return evt.which === 3 || evt.buttons === 2; } :
          function(evt3D) { var evt = evt3D.origDomEvent; return evt.which === 3 || evt.buttons === 2 }
  })();

  function patchTHREExDOMEventInstance(domEvents) {
    // see https://github.com/mrdoob/three.js/issues/5587
    domEvents._projector.pickingRay = pickingRay;
    THREEx.DomEvents.prototype._getRelativeMouseXY	= getRelativeMouseXYFromEvent;
  }

  function processScrollbarMouseEvent(THREExDOMEvents, codeEditor, clickState, evt3D) {
    if (evt3D.type !== 'mousedown') return false;
    var scrollbar = codeEditor.getScrollbar(),
        localBrowserPos = convertToBrowserCoords(evt3D.intersect, codeEditor),
        hit = scrollbar.left <= localBrowserPos.x && localBrowserPos.x <= scrollbar.left + scrollbar.width
           && scrollbar.top <= localBrowserPos.y && localBrowserPos.y <= scrollbar.top + scrollbar.height;

    if (!hit) return false;

    codeEditor.aceEditor.focus();
    clickState.scrollbarClickPoint = localBrowserPos;

    var evt = evt3D.origDomEvent;
    var lastMousePosY = evt.layerY || evt.pageY;
    var scrollSpeed = codeEditor.scrollSpeed ||  1;

    function releaseScrollbar(evt) {
      evt.stopPropagation();
      clickState.scrollbarClickPoint = null;
      window.removeEventListener('mouseup', releaseScrollbar, false);
      window.removeEventListener('mousemove', moveScrollbar, false);
    }

    function moveScrollbar(evt) {
      evt.stopPropagation();
      var posY = evt.layerY || evt.pageY;
      var MAGIC = 50; // FIXME, this is for zoom = 1, fov = 75
      var scrollSpeed = THREExDOMEvents.camera().position.distanceTo(codeEditor.position) / MAGIC * codeEditor.scrollSpeed;
      var yDiff = (posY - lastMousePosY) * scrollSpeed;
      lastMousePosY = posY;
      codeEditor.aceEditor.renderer.scrollBy(0, yDiff);
    }

    window.addEventListener('mouseup', releaseScrollbar, false);
    window.addEventListener('mousemove', moveScrollbar, false);
    return true;
  }

  function reemit3DMouseEvent(THREExDOMEvents, evt, clickState, codeEditor, globalPosForRealEditor) {
    // evt is a DOM event emitted when clicked on the 3D canvas. We patch it up
    // (for coords, target element, etc) and feed this to ace so that the normal ace
    // mouse handlers are invoked.
    // codeEditor is the 3D editor mesh object

    var aceEd   = codeEditor.aceEditor,
        type    = evt.type.replace(/^pointer/, "mouse").toLowerCase(),
        fakeEvt = retargetDOMEvent(evt, globalPosForRealEditor, aceEd.renderer.content);

    patchAceEventMethods(THREExDOMEvents, aceEd, codeEditor);

    if (type === 'mousedown') {
      if (Date.now()-clickState.lastClickTime <= clickState.doubleClickTriggerTime) {
        aceEd._emit("dblclick", new AceMouseEvent(fakeEvt, aceEd));
      }
      clickState.lastClickTime = Date.now();
    }

    if (type === 'mousedown') aceEd.$mouseHandler.onMouseEvent("mousedown", fakeEvt)
    else if (type === 'mousemove') aceEd.$mouseHandler.onMouseMove('mousemove', fakeEvt);
    else if ((type === 'mousewheel' || type === 'wheel') && aceEd.isFocused()) aceEd.$mouseHandler.onMouseWheel('mousewheel', fakeEvt);
    else aceEd._emit(type, new AceMouseEvent(fakeEvt, aceEd));

    // Is this really necessary?
    if (type === "mousedown") {
        if (!aceEd.isFocused() && aceEd.textInput)
            aceEd.textInput.moveToMouse(new AceMouseEvent(evt, aceEd));
        aceEd.focus();
    }

  }

  // -=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-
  // event conversion
  // -=-=-=-=-=-=-=-=-=-

  function patchAceEventMethods(THREExDOMEvents, aceEd, codeEditor) {
    // ace internally installs new event handler when the mosue is clicked, which
    // e.g. track mouse moves and such. The events coming in are emitted from the 3D
    // environment and actually don't target the ace editor. We install patch
    // functions that will adapt the events so that they make sense for ace

    var chain = lively.lang.chain,
        aceEdEl = aceEd.renderer.content;

    // we patch methods so that we can install method patchers... uuuuha
    aceEd.$mouseHandler.captureMouse = chain(aceEd.$mouseHandler.captureMouse)
      .getOriginal().wrap(function(proceed, evt, mouseMoveHandler) {
        evt.domEvent = retargetDOMEvent(evt.domEvent, convertEventPos3DtoHTML(evt, THREExDOMEvents._camera, THREExDOMEvents._domElement, aceEdEl, codeEditor, {x:0,y:aceEd.renderer.layerConfig.offset}), aceEdEl);

        mouseMoveHandler = mouseMoveHandler && chain(mouseMoveHandler)
          .getOriginal()
          .wrap(function(proceed, evt) {
            return evt && proceed(
              retargetDOMEvent(evt, convertEventPos3DtoHTML(evt, THREExDOMEvents._camera, THREExDOMEvents._domElement, aceEdEl, codeEditor, {x:0,y:aceEd.renderer.layerConfig.offset}), aceEdEl));
          }).value();
        return proceed(evt, mouseMoveHandler);
      }).value();

    aceEventLib.capture = chain(aceEventLib.capture)
      .getOriginal().wrap(function(proceed, el, eventHandler, releaseCaptureHandler) {
        if (aceEd.container !== el) return proceed(el, eventHandler, releaseCaptureHandler);
        eventHandler = chain(eventHandler)
          .getOriginal()
          .wrap(function(proceed, evt) {
            return evt && proceed(
              retargetDOMEvent(evt, convertEventPos3DtoHTML(evt, THREExDOMEvents._camera, THREExDOMEvents._domElement, aceEdEl, codeEditor, {x:0,y:aceEd.renderer.layerConfig.offset}), aceEdEl));
          }).value();

        releaseCaptureHandler = chain(releaseCaptureHandler)
          .getOriginal()
          .wrap(function(proceed, evt) {
            return evt && proceed(
              retargetDOMEvent(evt, convertEventPos3DtoHTML(evt, THREExDOMEvents._camera, THREExDOMEvents._domElement, aceEdEl, codeEditor, {x:0,y:aceEd.renderer.layerConfig.offset}), aceEdEl));
          }).value();

        return proceed(el, eventHandler, releaseCaptureHandler);
      }).value();
  }

})(THREE.CodeEditor.mouseevents || (THREE.CodeEditor.mouseevents = {}));


// =====================================================================================================================

// rendering.js


;(function(exports) {

  exports.onAceEditorAfterRenderEvent = onAceEditorAfterRenderEvent;

  // features
  var FOLDSUPPORT = false;
  var SHOWINVISIBLES = false;
  var DISPLAYINDENTGUIDES = false;
  var GUTTERLAYER = false;

  function onAceEditorAfterRenderEvent(aceEditor, codeEditor) {
    // rendering on canvas using the ace editor "model".
    // codeEditor is an instance of THREE.CodeEditor, a mesh.
    // aceEditor is... an ace editor
    // Here we react to render events of ace and attempt to render a similar
    // document using the canvas element we control here;

    var ed = aceEditor;
    var canvasEditor = codeEditor.canvas2d;
    var ctx = canvasEditor.getContext("2d");

    // base style
    var scrollLeft = ed.renderer.getScrollLeft();
    var editorStyle = computeStyle(aceEditor.renderer.container);
    ctx.textBaseline = 'alphabetic';
    ctx.fillStyle = editorStyle.backgroundColor;
    ctx.strokeStyle = editorStyle.borderColor;

    ctx.fillRect(0,0,canvasEditor.width,canvasEditor.height);

    drawMarkerLayer(ctx, ed, scrollLeft, ed.renderer.$markerBack);

    drawTextLayer(ctx, ed, scrollLeft);

    drawMarkerLayer(ctx, ed, scrollLeft, ed.renderer.$markerFront);

    drawCursorLayer(ctx, ed, scrollLeft, ed.renderer.$cursorLayer);

    drawScrollbar(ctx, codeEditor.getScrollbar());

    codeEditor.material.map.needsUpdate = true;
  }

  // -=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-
  // text layer
  // -=-=-=-=-=-

  function drawTextLayer(ctx, ed, scrollLeft) {
    // take the text and span dom elements, extract their text and style and
    // render them on the 2d canvas

    var r            = ed.renderer,
        bounds       = ed.renderer.container.getBoundingClientRect(),
        config       = ed.renderer.layerConfig,
        lineHeight   = config.lineHeight,
        screenPos    = ed.session.documentToScreenPosition(config.firstRowScreen, 0),
        lineElements = r.$textLayer.element.childNodes,
        localCoords  = {
          x: config.padding,
          y: (config.firstRowScreen*config.lineHeight) - r.scrollTop + r.$fontSize
        },
        leftOffset   = localCoords.x,
        fontStyle    = computeStyle(r.container);

    ctx.font = fontStyle.fontSize + " " + fontStyle.fontFamily;

    for (var i = 0; i < lineElements.length; i++) { // render lines
      var tokenEls = lineElements[i].childNodes;
      for (var j = 0; j < tokenEls.length; j++) { // render tokens
          var tokenEl = tokenEls[j];

          var cssDecl = computeStyle(tokenEl);
          if (cssDecl) ctx.fillStyle = cssDecl.color;

          var text = tokenEl.textContent,
              measured = ctx.measureText(text);

          if (measured) {
            // ctx.strokeRect(localCoords.x, localCoords.y-r.$fontSize, measured.width, lineHeight);
            if (cssDecl && cssDecl.textAlign === 'right')
              localCoords.x = config.width - measured.width;

            ctx.fillText(text, localCoords.x - r.scrollLeft, localCoords.y);
            localCoords.x += measured.width;
          }
      }

      localCoords.x = leftOffset;
      localCoords.y += lineHeight;
    }
  }

  // -=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-
  // cursor layer
  // -=-=-=-=-=-

  function drawCursorLayer(ctx, ed, scrollLeft, cursorLayer) {
    var config = cursorLayer.config;

    var selections = cursorLayer.session.$selectionMarkers;
    var i = 0, cursorIndex = 0;

    if (selections === undefined || selections.length === 0){
        selections = [{cursor: null}];
    }

    var cursorEls = cursorLayer.element.querySelectorAll('.ace_cursor');

    for (var i = 0, n = selections.length; i < n; i++) {

        var pixelPos = cursorLayer.getPixelPosition(selections[i].cursor, true);
        if ((pixelPos.top > config.height + config.offset ||
             pixelPos.top < 0) && i > 1) {
            continue;
        }

        var style = computeStyle(cursorEls[i]);
        var width = config.characterWidth;
        // var style = (cursorLayer.cursors[cursorIndex++] || cursorLayer.addCursor()).style;
        if (style) {
          if (style.backgroundColor && style.backgroundColor !== "transparent") {
            ctx.fillStyle = style.backgroundColor;
          } else {
            ctx.fillStyle = style.color;
            width = parseInt(style.borderLeftWidth) || parseInt(style.width);
          }
          ctx.strokeStyle = style.color;
        }

        ctx.fillRect(
          pixelPos.left - scrollLeft,
          pixelPos.top-config.offset,
          width,config.lineHeight);
    }
  }

  // -=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-
  // marker layer
  // -=-=-=-=-=-

  function drawMarkerLayer(ctx, ed, scrollLeft, markerLayer) {
    var r = ed.renderer;
    var config = markerLayer.config
    for (var key in markerLayer.markers) {

        var marker = markerLayer.markers[key];
        if (!marker.range) {
            marker.updateCanvas3D && marker.updateCanvas3D(ctx, markerLayer, scrollLeft, markerLayer.session, config);
            continue;
        }
        var range = marker.range.clipRows(config.firstRow, config.lastRow);
        if (range.isEmpty()) continue;
        range = range.toScreenRange(markerLayer.session);
        if (marker.renderer && false) {
            var top = markerLayer.$getTop(range.start.row, config);
            var left = markerLayer.$padding + range.start.column * config.characterWidth;
            marker.renderer(markerLayer, range, left, top, config);
        } else if (marker.type == "fullLine") {
            drawFullLineMarker(ctx, markerLayer, scrollLeft, range, marker.clazz, config);
        } else if (marker.type == "screenLine") {
            drawScreenLineMarker(ctx, markerLayer, scrollLeft, range, marker.clazz, config);
        } else if (range.isMultiLine()) {
            if (marker.type == "text")
              markerLayer.drawTextMarker(ctx, markerLayer, scrollLeft, range, marker.clazz, config);
            else
              drawMultiLineMarker(ctx, markerLayer, scrollLeft, range, marker.clazz, config);
        } else {
          drawSingleLineMarker(ctx, markerLayer, scrollLeft, range, marker.clazz + " ace_start", config)
        }
    }
  }

  function markerGetTop(marker, range, layerConfig) {
    return marker.$getTop ?
      marker.$getTop(range.start.row, layerConfig) :
      (range.start.row - layerConfig.firstRowScreen) * layerConfig.lineHeight;
  }

  function drawMultiLineMarker(ctx, markerLayer, scrollLeft, range, clazz, config) {
    var padding = markerLayer.$padding;
    var height = config.lineHeight;
    var top = markerLayer.$getTop(range.start.row, config)-config.offset;
    var left = (padding + range.start.column * config.characterWidth) - scrollLeft;

    // firs line
    // console.log("drawMultiLineMarker %s", clazz);
    var markerEl = markerLayer.element.querySelector("."+clazz.replace(/ /g, "."));
    var style = markerEl && computeStyle(markerEl);
    if (style) {
      ctx.strokeStyle = style.borderColor;
      ctx.fillStyle = style.backgroundColor;
    }

    ctx.fillRect(left,top, config.width,height);

    top = markerLayer.$getTop(range.end.row, config)-config.offset;;
    var width = range.end.column * config.characterWidth;
    ctx.fillRect(padding,top,width,height);

    height = (range.end.row - range.start.row - 1) * config.lineHeight;
    if (height < 0) return;
    top = markerLayer.$getTop(range.start.row + 1, config)-config.offset;;
    ctx.fillRect(padding,top, config.width,height);
  }

  function drawScreenLineMarker(ctx, markerLayer, scrollLeft, range, clazz, config) {
    var top = markerLayer.$getTop(range.start.row, config) - config.offset;
    var height = config.lineHeight;
    var left = 0;

    // console.log("drawScreenLineMarker %s", clazz);
    var markerEl = markerLayer.element.querySelector("."+clazz.replace(/ /g, "."));
    var style = markerEl && computeStyle(markerEl);
    if (style) {
      ctx.strokeStyle = style.borderColor;
      ctx.fillStyle = style.backgroundColor;
    }
    ctx.fillRect(left,top, config.width,height);
  }

  function drawSingleLineMarker(ctx, markerLayer, scrollLeft, range, clazz, config, extraLength, extraStyle) {
    var height = config.lineHeight;
    var width = (range.end.column + (extraLength || 0) - range.start.column) * config.characterWidth;

    var top = markerLayer.$getTop(range.start.row, config)-config.offset;
    var left = (markerLayer.$padding + range.start.column * config.characterWidth) - scrollLeft;

    var markerEl = markerLayer.element.querySelector("."+clazz.replace(/ /g, "."));

    var style = markerEl && computeStyle(markerEl);
    if (style) {
      ctx.strokeStyle = style.borderColor;
      ctx.fillStyle = style.backgroundColor;
    }
    // console.log("drawSingleLineMarker %s %s", clazz, style.backgroundColor);
    // show("drawSingleLineMarker %s %s %s %s", left,top,width,height)
    ctx.fillRect(left,top,width,height);
  }

  function drawFullLineMarker(ctx, markerLayer, scrollLeft, range, clazz, config) {
    var top = markerLayer.$getTop(range.start.row, config);
    var height = config.lineHeight;
    if (range.start.row != range.end.row)
        height += markerLayer.$getTop(range.end.row, config) - top;

    var left = (markerLayer.$padding + range.start.column * config.characterWidth) - scrollLeft;
    var markerEl = markerLayer.element.querySelector("."+clazz.replace(/ /g, "."));
    var style = markerEl && computeStyle(markerEl);
    if (style) {
      ctx.strokeStyle = style.borderColor;
      ctx.fillStyle = style.backgroundColor;
    }
    ctx.fillRect(left,top, config.width,height);
  }

  function drawTextMarker(ctx, markerLayer, scrollLeft, range, clazz, config, extraStyle) {
      // selection start
      var row = range.start.row;

      var lineRange = new range.constructor(
          row, range.start.column,
          row, markerLayer.session.getScreenLastRowColumn(row)
      );

      // markerLayer.drawSingleLineMarker(stringBuilder, lineRange, clazz + " ace_start", layerConfig, 1, extraStyle);
      drawSingleLineMarker(ctx, markerLayer, scrollLeft, range, clazz, config, 1, extraStyle);

      // selection end
      row = range.end.row;
      lineRange = new range.constructor(row, 0, row, range.end.column);
      drawSingleLineMarker(ctx, markerLayer, scrollLeft, lineRange, clazz, config, 0, extraStyle);

      for (row = range.start.row + 1; row < range.end.row; row++) {
        lineRange.start.row = row;
        lineRange.end.row = row;
        lineRange.end.column = markerLayer.session.getScreenLastRowColumn(row);
        drawSingleLineMarker(ctx, markerLayer, scrollLeft, lineRange, clazz, config, 1, extraStyle);
      }
  }

  function drawScrollbar(ctx, scrollbar) {
    ctx.fillStyle = scrollbar.backgroundColor;
    ctx.strokeStyle = scrollbar.borderColor
    ctx.lineWidth = scrollbar.borderWidth;
    roundRect(ctx,
      scrollbar.left,scrollbar.top,
      scrollbar.width,scrollbar.height,
      scrollbar.borderRounding, true, true);
  }

// -=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-
// rendering helper
// -=-=-=-=-=-=-=-=-
  function roundRect(ctx, x, y, width, height, radius, fill, stroke) {
    if (typeof stroke == "undefined" ) stroke = true;
    if (typeof radius === "undefined") radius = 5;
    ctx.beginPath();
    ctx.moveTo(x + radius, y);
    ctx.lineTo(x + width - radius, y);
    ctx.quadraticCurveTo(x + width, y, x + width, y + radius);
    ctx.lineTo(x + width, y + height - radius);
    ctx.quadraticCurveTo(x + width, y + height, x + width - radius, y + height);
    ctx.lineTo(x + radius, y + height);
    ctx.quadraticCurveTo(x, y + height, x, y + height - radius);
    ctx.lineTo(x, y + radius);
    ctx.quadraticCurveTo(x, y, x + radius, y);
    ctx.closePath();
    if (stroke) ctx.stroke();
    if (fill) ctx.fill();
  }

  function computeStyle(el) {
    if (el.nodeType === el.TEXT_NODE) return null;
    try { return window.getComputedStyle(el); } catch (e) {
      console.error("Cannot compute style of %s:\n%s", el.nodeType, e);
      return null;
    }
  }

  // -=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-
  // ace additions + patches
  var lang = ace.require("ace/lib/lang");
  var Range = ace.require("ace/range").Range;

  ace.require("ace/search_highlight").SearchHighlight.prototype.updateCanvas3D = function(ctx, markerLayer, scrollLeft, session, config) {
    if (!this.regExp)
        return;
    var start = config.firstRow, end = config.lastRow;

    for (var i = start; i <= end; i++) {
        var ranges = this.cache[i];
        if (ranges == null) {
            ranges = lang.getMatchOffsets(session.getLine(i), this.regExp);
            if (ranges.length > this.MAX_RANGES)
                ranges = ranges.slice(0, this.MAX_RANGES);
            ranges = ranges.map(function(match) {
                return new Range(i, match.offset, i, match.offset + match.length);
            });
            this.cache[i] = ranges.length ? ranges : "";
        }

        for (var j = ranges.length; j --; ) {
          drawSingleLineMarker(
              ctx, markerLayer, scrollLeft, ranges[j].toScreenRange(session), this.clazz, config);
        }
    }
  }

})(THREE.CodeEditor.rendering || (THREE.CodeEditor.rendering = {}));


// =====================================================================================================================

// autocomplete.js


;(function(exports) {

  // imports
  var oop = ace.require("ace/lib/oop");
  var fun = lively.lang.fun;
  var AutoComplete = ace.require("ace/autocomplete").Autocomplete;
  var FilteredList = ace.require("ace/autocomplete").FilteredList;

  // exports
  exports.installDynamicJSCompleterInto = installDynamicJSCompleterInto;

  // -=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-

  function installDynamicJSCompleterInto(aceEditor) {

    var completer = {
      isDynamicJSCompleter: true,

      getCompletions: function(editor, session, pos, prefix, thenDo) {

        var result = dynamicCompleter.getCompletions(
          getSelectionOrLineString(editor, pos),
          function(code) {
            var evaled = lively.vm.syncEval(code, {topLevelVarRecorder: {}, sourceURL: "completions-"+Date.now()});
            return evaled instanceof Error ? null : evaled;
          });

        if (!result || !result.completions) return thenDo(null, []);

        thenDo(null, result.completions.reduce(function(completions, group) {
          var groupName = lively.lang.string.truncate(group[0], 20);
          return completions.concat(group[1].map(function(compl) {
            return {
              caption: "[" + groupName+ "] " + compl,
              value: compl, score: 210, meta: "dynamic",
              completer: compl[0] !== "[" ? null : {
                insertMatch: function(ed, completion) {
                  var pos = ed.getCursorPosition();
                  var dotRange = ed.find(".", {
                    start: ed.getCursorPosition(),
                    preventScroll: true, backwards: true
                  });
                  if (dotRange.start.row === pos.row) {
                    // remove everything until (including) the "." before inserting completion
                    ed.session.replace({start: dotRange.start, end: pos}, "");
                  }
                  ed.execCommand("insertstring", completion.value || completion);
                }
              }
            }
          }))
        }, []));

        // -=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-
        function getSelectionOrLineString(ed, pos) {
          var range = ed.selection.getRange()
          if (range.isEmpty())
            range = ed.selection.getLineRange(pos.row, true);
          return ed.session.getTextRange(range);
        }
      }
    }

    aceEditor.completers = (aceEditor.completers || [])
      .filter(function(ea) { return !ea.isDynamicJSCompleter; })
      .concat([completer]);

  };

  // -=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-
  // dynamic JavaScript completer
  // -=-=-=-=-=-=-=-=-=-=-=-=-=-=-

  // FIXME this should go into lively.vm!
  var dynamicCompleter = {

      getCompletions: function(code, evalFunc) {
          var err, completions
          getCompletions(evalFunc, code, function(e, c, pre) {
              err = e, completions = {prefix: pre, completions: c}; })
          if (err) { alert(err); return {error: String(err.stack || err), prefix: '', completions: []}; }
          else return completions;
  // -=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-
  // rk 2013-10-10 I extracted the code below into a nodejs module (since this
  // stuff is also useful on a server and in other contexts). Right now we have no
  // good way to load nodejs modules into Lively and I inline the code here. Please
  // fix soon!
  // -=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-
  // helper
  function signatureOf(name, func) {
      var source = String(func),
          match = source.match(/function\s*[a-zA-Z0-9_$]*\s*\(([^\)]*)\)/),
          params = (match && match[1]) || '';
      return makeValidCompletion(name) + '(' + params + ')';
  }

  function isClass(obj) {
      if (obj === obj
        || obj === Array
        || obj === Function
        || obj === String
        || obj === Boolean
        || obj === Date
        || obj === RegExp
        || obj === Number) return true;
      return (obj instanceof Function)
          && ((obj.superclass !== undefined)
           || (obj._superclass !== undefined));
  }

  function pluck(list, prop) { return list.map(function(ea) { return ea[prop]; }); }

  function getObjectForCompletion(evalFunc, stringToEval, thenDo) {
      // thenDo = function(err, obj, startLetters)
      var idx = stringToEval.lastIndexOf('.'),
          startLetters = '';
      if (idx >= 0) {
          startLetters = stringToEval.slice(idx+1);
          stringToEval = stringToEval.slice(0,idx);
      } else {
          startLetters = stringToEval;
          stringToEval = 'Global';
      }
      var completions = [];
      try {
          var obj = evalFunc(stringToEval);
      } catch (e) { thenDo(e, null, null); }
      thenDo(null, obj, startLetters);
  }

  function propertyExtract(excludes, obj, extractor) {
      // show(''+excludes)
      return Object.getOwnPropertyNames(obj)
          .filter(function(key) { return excludes.indexOf(key) === -1; })
          .map(extractor)
          .filter(function(ea) { return !!ea; })
          .sort(function(a,b) {
              return a.name < b.name ? -1 : (a.name > b.name ? 1 : 0); });
  }

  function isValidIdentifier(string) {
    // FIXME real identifier test is more complex...
    return /^[a-zA-Z_$][0-9a-zA-Z_$]*$/.test(string);
  }

  function makeValidCompletion(string) {
    return isValidIdentifier(string) ? string : "['" + string.replace(/'/g, "\\'") + "']";
  }

  function getMethodsOf(excludes, obj) {
      return propertyExtract(excludes, obj, function(key) {

          if ((obj.__lookupGetter__ && obj.__lookupGetter__(key)) || typeof obj[key] !== 'function') return null;
          return {name: key, completion: signatureOf(key, obj[key])}; })
  }

  function getAttributesOf(excludes, obj) {
      return propertyExtract(excludes, obj, function(key) {
          if ((obj.__lookupGetter__ && !obj.__lookupGetter__(key)) && typeof obj[key] === 'function') return null;
          return {name: key, completion: makeValidCompletion(key)}; })
  }

  function getProtoChain(obj) {
      var protos = [], proto = obj;
      while (obj) { protos.push(obj); obj = obj.__proto__ }
      return protos;
  }

  function getDescriptorOf(originalObj, proto) {
      function shorten(s, len) {
          if (s.length > len) s = s.slice(0,len) + '...';
          return s.replace(/\n/g, '').replace(/\s+/g, ' ');
      }

      var stringified;
      try { stringified = String(originalObj); } catch (e) { stringified = "{/*...*/}"; }

      if (originalObj === proto) {
          if (typeof originalObj !== 'function') return shorten(stringified, 50);
          var funcString = stringified,
              body = shorten(funcString.slice(funcString.indexOf('{')+1, funcString.lastIndexOf('}')), 50);
          return signatureOf(originalObj.displayName || originalObj.name || 'function', originalObj) + ' {' + body + '}';
      }

      var klass = proto.hasOwnProperty('constructor') && proto.constructor;
      if (!klass) return 'prototype';
      if (typeof klass.type === 'string' && klass.type.length) return shorten(klass.type, 50);
      if (typeof klass.name === 'string' && klass.name.length) return shorten(klass.name, 50);
      return "anonymous class";
  }

  function getCompletionsOfObj(obj, thenDo) {
      if (!obj) return thenDo(null, []);
      var err, completions;
      try {
          var excludes = [];
          completions = getProtoChain(obj).map(function(proto) {
              var descr = getDescriptorOf(obj, proto),
                  methodsAndAttributes = getMethodsOf(excludes, proto)
                      .concat(getAttributesOf(excludes, proto));
              excludes = excludes.concat(pluck(methodsAndAttributes, 'name'));
              return [descr, pluck(methodsAndAttributes, 'completion')];
          });
      } catch (e) { err = e; }
      thenDo(err, completions);
  }

  function getCompletions(evalFunc, string, thenDo) {
      // thendo = function(err, completions/*ARRAY*/)
      // eval string and for the resulting object find attributes and methods,
      // grouped by its prototype / class chain
      // if string is something like "foo().bar.baz" then treat "baz" as start
      // letters = filter for properties of foo().bar
      // ("foo().bar.baz." for props of the result of the complete string)
      getObjectForCompletion(evalFunc, string, function(err, obj, startLetters) {
          if (err) { thenDo(err); return }
          var excludes = [];
          var completions = getProtoChain(obj).map(function(proto) {
              var descr = getDescriptorOf(obj, proto),
                  methodsAndAttributes = getMethodsOf(excludes, proto)
                      .concat(getAttributesOf(excludes, proto));
              excludes = excludes.concat(pluck(methodsAndAttributes, 'name'));
              return [descr, pluck(methodsAndAttributes, 'completion')];
          });
          thenDo(err, completions, startLetters);
      })
  }

  /*
  ;(function testCompletion() {
      function assertCompletions(err, completions, prefix) {
          assert(!err, 'getCompletions error: ' + err);
          assert(prefix === '', 'prefix: ' + prefix);
          assert(completions.length === 3, 'completions does not contain 3 groups ' + completions.length)
          assert(completions[2][0] === 'Object', 'last completion group is Object')
          objectCompletions = completions.slice(0,2)
          expected = [["[object Object]", ["m1(a)","m2(x)","a"]],
                      ["prototype", ["m3(a,b,c)"]]]
          assert(Objects.equals(expected, objectCompletions), 'compl not equal');
          alertOK('all good!')

      }
      function evalFunc(string) { return eval(string); }
      var code = "obj1 = {m2: function() {}, m3:function(a,b,c) {}}\n"
               + "obj2 = {a: 3, m1: function(a) {}, m2:function(x) {}, __proto__: obj1}\n"
               + "obj2."
      getCompletions(evalFunc, code, assertCompletions)
  })();
  */
      }
  };

  // -=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-
  // ace extensions
  // -=-=-=-=-=-=-=-

  AutoComplete.prototype.showPopup = fun.wrap(
    fun.getOriginal(AutoComplete.prototype.showPopup),
    function(proceed, editor) {
      // completion should also work with "backwards" selection: reverse the
      // selection before cursor movements are interpreted to close the completion
      // popup
      var sel = editor.selection;
      if (sel.isBackwards()) sel.setRange(sel.getRange(), false);
      return proceed(editor);
    });

  AutoComplete.prototype.openPopup = fun.wrap(
    fun.getOriginal(AutoComplete.prototype.openPopup),
    function(proceed, editor, prefix, keepPopupPosition) {

      proceed(editor, prefix, keepPopupPosition);

      if (!this.activated) return;

      setTimeout(function() {
        // delayed so that we still have the selection when computing the
        // completions but not for the insertion...
        if (!editor.selection.isEmpty())
          collapseSelection(editor, "end");
      }, 20);

      this.popup.renderer.container.style.zIndex=-1000;
      this.popup.setFontSize(editor.getFontSize()-3);


      var parentEditor = editor.parent3d;
      var popupEditor3d = this.popupEditor3d;
      if (!popupEditor3d) {
        popupEditor3d = this.popupEditor3d = new THREE.CodeEditor(
          world.renderer.domElement, parentEditor.events,
          this.popup);
      }

      var size = this.popup.renderer.$size;
      popupEditor3d.setSize(size.scrollerWidth, size.scrollerHeight);

      var bounds = this.popup.renderer.container.getBoundingClientRect();
      alignPlanesTopLeft(popupEditor3d, parentEditor, new THREE.Vector3(bounds.left,-bounds.top,.1));

      if (!popupEditor3d.parent) world.scene.add(popupEditor3d);
    });

  AutoComplete.prototype.detach = fun.wrap(
    fun.getOriginal(AutoComplete.prototype.detach),
    function(proceed) {
      this.popupEditor3d && this.popupEditor3d.parent && this.popupEditor3d.parent.remove(this.popupEditor3d);
      proceed();
    });

  FilteredList.prototype.filterCompletions = fun.wrap(
    fun.getOriginal(FilteredList.prototype.filterCompletions),
    function(proceed, items,needle) {
      var dynamicCompletions = items.filter(function(ea) { return ea.meta === "dynamic"; });
      var result = proceed(items, needle);
      if (!needle) { // make sure the dynamic completions come first
        var maxScore = lively.lang.arr.max(result, function(ea) { return ea.score; }).score;
        if (!result.length) result = dynamicCompletions;
        dynamicCompletions.forEach(function(ea) { ea.score += maxScore; });
      }
      return result;
      // var matchedDynamic = result.filter(function(ea) { return ea.meta === "dynamic"; });
      // var unmatchedDynamic = lively.lang.arr.withoutAll(dynamicCompletions, matchedDynamic);
      // console.log("#all / #unmatched: %s/%s", matchedDynamic.length, unmatchedDynamic.length);
      // return matchedDynamic
      //   .concat(lively.lang.arr.withoutAll(result, matchedDynamic))
      //   .concat(unmatchedDynamic);
    })


  AutoComplete.prototype.commands = lively.lang.obj.merge(AutoComplete.prototype.commands, {
    "Alt-Shift-,": function(editor) { editor.completer.goTo("start"); },
    "Alt-Shift-.": function(editor) { editor.completer.goTo("end"); },
    "Alt-V": function(editor) { editor.completer.popup.gotoPageUp(); },
    "Ctrl-V": function(editor) { editor.completer.popup.gotoPageDown(); }
  });

  // -=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-
  // helper functions
  // -=-=-=-=-=-=-=-=-

  function alignPlanesTopLeft(plane1, plane2, offset) {
    plane1.rotation.copy(plane2.rotation.clone());
    plane1.updateMatrixWorld(true);
    var a = plane1.geometry.vertices[0].clone().applyMatrix4(plane1.matrixWorld);
    var b = plane2.geometry.vertices[0].clone().applyMatrix4(plane2.matrixWorld);
    var offsetWorld = offset.applyMatrix4(plane1.matrixWorld).sub(plane1.position);
    var fromAtoB = b.clone().sub(a).add(offsetWorld);
    plane1.position.add(fromAtoB);
    plane1.updateMatrixWorld(true);
  }

  // FIXME move to another place
  function collapseSelection(ed, dir) {
    // dir = 'start' || 'end'
    var sel = ed.selection, range = sel.getRange();
    dir && sel.moveCursorToPosition(range[dir]);
    sel.clearSelection();
  }

})(THREE.CodeEditor.autocomplete || (THREE.CodeEditor.autocomplete = {}));


// @==================================================== eof ==========================================================@
