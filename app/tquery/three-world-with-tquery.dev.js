// Users/robert/Lively/3D/three-world/three-world-with-tquery.dev.js

// THREE.WORLD.JS

(function(code) {
  var exports = typeof module !== "undefined" && module.exports ?
    module.exports : THREE.World || (THREE.World = {}); /*evil globals...*/
  code(exports);
})(function(exports) {

  // exports
  exports.create = create;

  // -=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-

  var hasVRSupport = !!navigator.mozGetVRDevices || !!navigator.getVRDevices;

  function create(domEl, options, thenDo) {
    // Options:
    // see the options defaults for currently supported flags
    if (typeof thenDo === "undefined" && typeof options === 'function') {
      thenDo = options; options = null;
    }

    options                 = options || {};
    options.useVR           = options.useVR || false;
    options.useOrbitControl = options.useOrbitControl || false;
    options.width           = options.width || window.innerWidth;
    options.height          = options.height || window.innerHeigh;

    // Export the "world" object that let's us access the state of the scene from
    // the outside.
    var world = {
      renderer:            null,
      events:              null,
      scene:               null,
      camera:              null,
      orbitControl:        null,
      vr:                  {},
      _animationCallbacks: {},
      _timedAnimationCallbacks: {}
    }

    world.startLoop               = startLoop.bind(null, world),
    world.stopLoop                = stopLoop.bind(null, world),
    world.addAnimationCallback    = addAnimationCallback.bind(null, world),
    world.removeAnimationCallback = removeAnimationCallback.bind(null, world),
    world.onResize                = onResize.bind(null, world),
    world.enterFullScreen         = enterFullScreen.bind(null, world),
    world.destroy                 = destroy.bind(null, world)

    init(world, domEl, options);

    thenDo && thenDo(null, world);
    return world;
  }


  // -=-=-=-=-=-=-=-=-=-=-=-
  // Helper functions below
  // -=-=-=-=-=-=-=-=-=-=-=-

  // Sets up the scene.
  function init(world, domElement, options) {

    // Create the scene and set the scene size.
    var scene = world.scene = new THREE.Scene();

    // -=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-
    // Create a renderer and add it to the DOM.
    var r = world.renderer = new THREE.WebGLRenderer({antialias:true});
    domElement.appendChild(r.domElement);

    // -=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-
    // Create a camera, zoom it out from the model a bit, and add it to the scene.
    // camera = new THREE.PerspectiveCamera(75, width / height, 0.1, 20000);
    var camera = world.camera = new THREE.PerspectiveCamera(75, options.width / options.height, 0.1, 1000);
    camera.aspect = options.width/options.height;
    camera.updateProjectionMatrix();
    scene.add(camera);

    if (options.useVR) {
      if (!hasVRSupport) {
        alert("Trying to enable webVR but your browser has no support for it!");
      } else {
        world.vr = {
          effect: new THREE.VREffect(r),
          control: new THREE.VRControls(camera)
        }
    	  world.vr.effect.setSize(options.width, options.height);
        whenHeadmountDisplayReady(world.vr, function() {});
    	  world.onResize();
      }
    } else {
      r.setSize(options.width, options.height);
    }

    // -=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-
    // Create an event listener that resizes the renderer with the browser window.
    world._onResize = onResize.bind(null, world);
    window.addEventListener('resize', world._onResize);

    // world.events = new DOMEvents(world.camera, world.renderer.domElement);

    // -=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-
    // controls
    if (options.useOrbitControl)
      world.orbitControl = new THREE.OrbitControls(camera, r.domElement);

    world.onResize();
  }

  // animate is called every once in a while, you can register callbacks
  function animate(world) {
    world.loop = requestAnimationFrame(animate.bind(null, world));

    var evt = {
      type: 'animate',
      defaultPrevented: false,
      preventDefault: function() { this.defaultPrevented = true; }
    }

    var callbackIds = Object.keys(world._animationCallbacks);
    for (var i = 0; i < callbackIds.length; i++) {
      world._animationCallbacks[callbackIds[i]](evt);
      if (evt.defaultPrevented) break;
    }

    if (world.vr.control) world.vr.control.update();
    else if (world.orbitControl) world.orbitControl.update();

    (world.vr.effect || world.renderer).render(world.scene, world.camera);
  }

  function onResize(world) {
    var width = window.innerWidth,
        height = window.innerHeight;
    world.camera.aspect = width / height;
    world.camera.updateProjectionMatrix();
    (world.vr.effect || world.renderer).setSize(width, height);
  }

  function whenHeadmountDisplayReady(state, thenDo) {
    if (!hasVRSupport) { thenDo(new Error("no vr support")); return; }
    (navigator.mozGetVRDevices || navigator.getVRDevices)().then(function(devices) {

      devices.forEach(function(dev) {
        if (dev instanceof HMDVRDevice) state.hmd = dev;
        else if (dev instanceof PositionSensorVRDevice) state.positionSensor = dev;
      });

      var posState = state.positionSensor && state.positionSensor.getState();
      var hasHeadmountDisplay = posState && posState.timeStamp > 0;
      state.isPseudoVR = !hasHeadmountDisplay;
      thenDo && thenDo(null, state);
    });
  }

  function startLoop(world) {
    Object.keys(world._timedAnimationCallbacks).forEach(function(name) {
      var timed = world._timedAnimationCallbacks[name];
      clearInterval(timed.intervalId);
      timed.intervalId = setInterval(timed.callback);
    });
    animate(world);
    return world;
  }

  function stopLoop(world) {
    cancelAnimationFrame(world.loop);
    Object.keys(world._timedAnimationCallbacks).forEach(function(name) {
      var timed = world._timedAnimationCallbacks[name];
      clearInterval(timed.intervalId);
    });
    return world;
  }

  function addAnimationCallback(world, name, intervalTime, fn) {
    if (typeof name === "function") { // called just with anim callback
      fn = name;
      intervalTime = name = undefined;
    }
    if (typeof intervalTime === "function") { // called with name and anim callback
      fn = intervalTime;
      intervalTime = undefined;
    }
    if (!name) name = "anonymous-callback-" + Date.now();

    if (!intervalTime) return world._animationCallbacks[name] = fn;
    var time = Date.now();
    return world._timedAnimationCallbacks[name] = {
      intervalTime: intervalTime,
      intervalId: setInterval(function() {
        var now = Date.now(), delta = now - time;
        time = now;
        fn(delta);
      }, intervalTime),
      callback: fn
    };
  }

  function removeAnimationCallback(world, name) {
    if (world._animationCallbacks[name]) {
      delete world._animationCallbacks[name];
    } else {
      var timed = world._timedAnimationCallbacks[name];
      if (timed) {
        clearInterval(timed.intervalId);
        delete world._timedAnimationCallbacks[name];
      }
    }
  }

  function removeAllAnimationCallback(world) {
    Object.keys(world._animationCallbacks).forEach(function(k) { removeAnimationCallback(world, k); });
    Object.keys(world._timedAnimationCallbacks).forEach(function(k) { removeAnimationCallback(world, k); });
  }

  function gatherDisposal(obj) {
    var thrash = [obj.geometry,obj.material,obj.material && obj.material.map]
    .filter(function(ea) { ea && ea.dispose; });
    
    return (obj.children || []).reduce(function(thrash, ea) {
      return thrash.concat(gatherDisposal(ea)); }, thrash);
  }

  function enterFullScreen(world) {
    if (world.vr && world.vr.effect) world.vr.effect.setFullScreen(true);
    else world.renderer.domElement[world.renderer.domElement.mozRequestFullScreen? 'mozRequestFullScreen' : 'webkitRequestFullScreen']();
  }

  function destroy(world, thenDo) {
    if (world._onResize) {
      window.removeEventListener('resize', world._onResize);
      delete world._onResize;
    }

    cancelAnimationFrame(world.loop);

    removeAllAnimationCallback(world);

    gatherDisposal(world.scene)
      .forEach(function(ea) { ea.dispose(); });

    var r = world.renderer;
    if (r.domElement.parentNode)
      r.domElement.parentNode.removeChild(r.domElement);

    thenDo && thenDo();
  }

});

// ===================================================================================================================