(function() {

var define, requireModule, require, requirejs;

(function() {

  var _isArray;
  if (!Array.isArray) {
    _isArray = function (x) {
      return Object.prototype.toString.call(x) === "[object Array]";
    };
  } else {
    _isArray = Array.isArray;
  }
  
  var registry = {}, seen = {}, state = {};
  var FAILED = false;

  define = function(name, deps, callback) {
  
    if (!_isArray(deps)) {
      callback = deps;
      deps     =  [];
    }
  
    registry[name] = {
      deps: deps,
      callback: callback
    };
  };

  function reify(deps, name, seen) {
    var length = deps.length;
    var reified = new Array(length);
    var dep;
    var exports;

    for (var i = 0, l = length; i < l; i++) {
      dep = deps[i];
      if (dep === 'exports') {
        exports = reified[i] = seen;
      } else {
        reified[i] = require(resolve(dep, name));
      }
    }

    return {
      deps: reified,
      exports: exports
    };
  }

  requirejs = require = requireModule = function(name) {
    if (state[name] !== FAILED &&
        seen.hasOwnProperty(name)) {
      return seen[name];
    }

    if (!registry[name]) {
      throw new Error('Could not find module ' + name);
    }

    var mod = registry[name];
    var reified;
    var module;
    var loaded = false;

    seen[name] = { }; // placeholder for run-time cycles

    try {
      reified = reify(mod.deps, name, seen[name]);
      module = mod.callback.apply(this, reified.deps);
      loaded = true;
    } finally {
      if (!loaded) {
        state[name] = FAILED;
      }
    }

    return reified.exports ? seen[name] : (seen[name] = module);
  };

  function resolve(child, name) {
    if (child.charAt(0) !== '.') { return child; }

    var parts = child.split('/');
    var nameParts = name.split('/');
    var parentBase;

    if (nameParts.length === 1) {
      parentBase = nameParts;
    } else {
      parentBase = nameParts.slice(0, -1);
    }

    for (var i = 0, l = parts.length; i < l; i++) {
      var part = parts[i];

      if (part === '..') { parentBase.pop(); }
      else if (part === '.') { continue; }
      else { parentBase.push(part); }
    }

    return parentBase.join('/');
  }

  requirejs.entries = requirejs._eak_seen = registry;
  requirejs.clear = function(){
    requirejs.entries = requirejs._eak_seen = registry = {};
    seen = state = {};
  };
})();

define('orbit', ['exports', 'orbit/main', 'orbit/action', 'orbit/action-queue', 'orbit/document', 'orbit/evented', 'orbit/notifier', 'orbit/operation', 'orbit/requestable', 'orbit/request-connector', 'orbit/transaction', 'orbit/transformable', 'orbit/transformation', 'orbit/transform-connector', 'orbit/lib/assert', 'orbit/lib/config', 'orbit/lib/deprecate', 'orbit/lib/diffs', 'orbit/lib/eq', 'orbit/lib/exceptions', 'orbit/lib/functions', 'orbit/lib/objects', 'orbit/lib/operations', 'orbit/lib/strings', 'orbit/lib/stubs', 'orbit/lib/uuid'], function (exports, Orbit, Action, ActionQueue, Document, Evented, Notifier, Operation, Requestable, RequestConnector, Transaction, Transformable, Transformation, TransformConnector, assert, config, deprecate, diffs, eq, exceptions, functions, objects, operations, strings, stubs, uuid) {

	'use strict';

	Orbit['default'].Action = Action['default'];
	Orbit['default'].ActionQueue = ActionQueue['default'];
	Orbit['default'].Document = Document['default'];
	Orbit['default'].Evented = Evented['default'];
	Orbit['default'].Notifier = Notifier['default'];
	Orbit['default'].Operation = Operation['default'];
	Orbit['default'].Requestable = Requestable['default'];
	Orbit['default'].RequestConnector = RequestConnector['default'];
	Orbit['default'].Transaction = Transaction['default'];
	Orbit['default'].Transformable = Transformable['default'];
	Orbit['default'].Transformation = Transformation['default'];
	Orbit['default'].TransformConnector = TransformConnector['default'];
	// lib fns
	Orbit['default'].assert = assert.assert;
	Orbit['default'].arrayToOptions = config.arrayToOptions;
	Orbit['default'].deprecate = deprecate.deprecate;
	Orbit['default'].diffs = diffs.diffs;
	Orbit['default'].eq = eq.eq;
	Orbit['default'].Exception = exceptions.Exception;
	Orbit['default'].PathNotFoundException = exceptions.PathNotFoundException;
	Orbit['default'].spread = functions.spread;
	Orbit['default'].Class = objects.Class;
	Orbit['default'].clone = objects.clone;
	Orbit['default'].defineClass = objects.defineClass;
	Orbit['default'].expose = objects.expose;
	Orbit['default'].extend = objects.extend;
	Orbit['default'].extendClass = objects.extendClass;
	Orbit['default'].isArray = objects.isArray;
	Orbit['default'].isObject = objects.isObject;
	Orbit['default'].isNone = objects.isNone;
	Orbit['default'].coalesceOperations = operations.coalesceOperations;
	Orbit['default'].capitalize = strings.capitalize;
	Orbit['default'].noop = stubs.noop;
	Orbit['default'].required = stubs.required;
	Orbit['default'].uuid = uuid.uuid;

	exports['default'] = Orbit['default'];

});
define('orbit/action-queue', ['exports', 'orbit/main', 'orbit/action', 'orbit/evented', 'orbit/lib/assert', 'orbit/lib/objects'], function (exports, Orbit, Action, Evented, assert, objects) {

  'use strict';

  exports['default'] = objects.Class.extend({
    processing: false,

    content: null,

    current: null,

    init: function(options) {
      assert.assert('ActionQueue requires Orbit.Promise to be defined', Orbit['default'].Promise);

      Evented['default'].extend(this);

      options = options || {};
      this.autoProcess = options.autoProcess !== undefined ? options.autoProcess : true;

      this.content = [];
    },

    push: function(action) {
      var actionObject;

      if (action instanceof Action['default']) {
        actionObject = action;
      } else {
        actionObject = new Action['default'](action);
      }

      this.content.push(actionObject);

      if (this.autoProcess) this.process();

      return actionObject;
    },

    process: function() {
      var _this = this;
      var processing = this.processing;

      if (!processing) {
        if (_this.content.length === 0) {
          processing = new Orbit['default'].Promise(function(resolve) { resolve(); });

        } else {
          var settleEach = function() {
            if (_this.content.length === 0) {
              _this.current = null;
              _this.processing = null;
              _this.emit('didProcess');

            } else {
              var action = _this.current = _this.content[0];

              action.process().then(function() {
                _this.emit('didProcessAction', action);
                _this.content.shift();
                settleEach();

              }, function(e) {
                _this.current = null;
                _this.processing = null;
                _this.emit('didNotProcessAction', action, e);
              });
            }
          };

          processing = _this.processing = new Orbit['default'].Promise(function(resolve, reject) {
            _this.one('didProcess', function () {
              resolve();
            });

            _this.one('didNotProcessAction', function(action, e) {
              _this.emit('didNotProcess', {action: action}, e);
              reject(e);
            });
          });

          settleEach();
        }
      }

      return processing;
    }
  });

});
define('orbit/action', ['exports', 'orbit/main', 'orbit/evented', 'orbit/lib/objects'], function (exports, Orbit, Evented, objects) {

  'use strict';

  exports['default'] = objects.Class.extend({
    id: null,
    data: null,
    _process: null,

    processing: false,
    complete: null,

    init: function(options) {
      Evented['default'].extend(this);

      this.id = options.id;
      this.data = options.data;
      this._process = options.process;

      this.reset();
    },

    reset: function() {
      var _this = this;

      this.processing = false;

      this.complete = new Orbit['default'].Promise(function(resolve, reject) {
        _this.one('didProcess', function() {
          resolve();
        });
        _this.one('didNotProcess', function(e) {
          _this.processing = false;
          reject(e);
        });
      });
    },

    process: function() {
      var _this = this;

      if (!this.processing) {
        this.processing = true;

        var didProcess = function() {
          _this.emit('didProcess');
        };

        var didNotProcess = function(e) {
          _this.emit('didNotProcess', e);
        };

        try {
          var ret = _this._process.call(_this);
          if (ret) {
            ret.then(didProcess, didNotProcess);
          } else {
            didProcess();
          }

        } catch(e) {
          didNotProcess(e);
        }
      }

      return this.complete;
    }
  });

});
define('orbit/document', ['exports', 'orbit/lib/objects', 'orbit/lib/diffs', 'orbit/lib/eq', 'orbit/lib/exceptions'], function (exports, objects, diffs, eq, exceptions) {

  'use strict';

  var Document = objects.Class.extend({
    init: function(data, options) {
      options = options || {};
      this.arrayBasedPaths = options.arrayBasedPaths !== undefined ? options.arrayBasedPaths : false;
      this.reset(data);
    },

    /**
     Reset the contents of the whole document.

     If no data is specified, the contents of the document will be reset to an
     empty object.

     @method reset
     @param {Object} [data] New root object
     */
    reset: function(data) {
      this._data = data || {};
    },

    /**
     Retrieve the value at a path.

     Throws `PathNotFoundException` if the path does not exist in the document.

     @method retrieve
     @param {Array or String} path
     @returns {Object} Object at the specified `path`
     */
    retrieve: function(path) {
      return this._retrieve(this.deserializePath(path));
    },

    /**
     Sets the value at a path.

     If the target location specifies an array index, inserts a new value
     into the array at the specified index.

     If the target location specifies an object member that does not
     already exist, adds a new member to the object.

     If the target location specifies an object member that does exist,
     replaces that member's value.

     If the target location does not exist, throws `PathNotFoundException`.

     @method add
     @param {Array or String} path
     @param {Object} value
     @param {Boolean} [invert=false] Return the inverse operations?
     @returns {Array} Array of inverse operations if `invert === true`
     */
    add: function(path, value, invert) {
      return this._add(this.deserializePath(path), value, invert);
    },

    /**
     Removes the value from a path.

     If removing an element from an array, shifts any elements above the
     specified index one position to the left.

     If the target location does not exist, throws `PathNotFoundException`.

     @method remove
     @param {Array or String} path
     @param {Boolean} [invert=false] Return the inverse operations?
     @returns {Array} Array of inverse operations if `invert === true`
     */
    remove: function(path, invert) {
      return this._remove(this.deserializePath(path), invert);
    },

    /**
     Replaces the value at a path.

     This operation is functionally identical to a "remove" operation for
     a value, followed immediately by an "add" operation at the same
     location with the replacement value.

     If the target location does not exist, throws `PathNotFoundException`.

     @method replace
     @param {Array or String} path
     @param {Object} value
     @param {Boolean} [invert=false] Return the inverse operations?
     @returns {Array} Array of inverse operations if `invert === true`
     */
    replace: function(path, value, invert) {
      return this._replace(this.deserializePath(path), value, invert);
    },

    /**
     Moves an object from one path to another.

     Identical to calling `remove()` followed by `add()`.

     Throws `PathNotFoundException` if either path does not exist in the document.

     @method move
     @param {Array or String} fromPath
     @param {Array or String} toPath
     @param {Boolean} [invert=false] Return the inverse operations?
     @returns {Array} Array of inverse operations if `invert === true`
     */
    move: function(fromPath, toPath, invert) {
      return this._move(this.deserializePath(fromPath), this.deserializePath(toPath), invert);
    },

    /**
     Copies an object at one path and adds it to another.

     Identical to calling `add()` with the value at `fromPath`.

     Throws `PathNotFoundException` if either path does not exist in the document.

     @method copy
     @param {Array or String} fromPath
     @param {Array or String} toPath
     @param {Boolean} [invert=false] Return the inverse operations?
     @returns {Array} Array of inverse operations if `invert === true`
     */
    copy: function(fromPath, toPath, invert) {
      return this._copy(this.deserializePath(fromPath), this.deserializePath(toPath), invert);
    },

    /**
     Tests that the value at a path matches an expectation.

     Uses `Orbit.eq` to test equality.

     Throws `PathNotFoundException` if the path does not exist in the document.

     @method test
     @param {Array or String} path
     @param {Object} value Expected value to test
     @returns {Boolean} Does the value at `path` equal `value`?
     */
    test: function(path, value) {
      return eq.eq(this._retrieve(this.deserializePath(path)), value);
    },

    /**
     Transforms the document with an RFC 6902-compliant operation.

     Throws `PathNotFoundException` if the path does not exist in the document.

     @method transform
     @param {Object} operation
     @param {String} operation.op Must be "add", "remove", "replace", "move", "copy", or "test"
     @param {Array or String} operation.path Path to target location
     @param {Array or String} operation.from Path to source target location. Required for "copy" and "move"
     @param {Object} operation.value Value to set. Required for "add", "replace" and "test"
     @param {Boolean} [invert=false] Return the inverse operations?
     @returns {Array} Array of inverse operations if `invert === true`
     */
    transform: function(operation, invert) {
      if (operation.op === 'add') {
        return this.add(operation.path, operation.value, invert);

      } else if (operation.op === 'remove') {
        return this.remove(operation.path, invert);

      } else if (operation.op === 'replace') {
        return this.replace(operation.path, operation.value, invert);

      } else if (operation.op === 'move') {
        return this.move(operation.from, operation.path, invert);

      } else if (operation.op === 'copy') {
        return this.copy(operation.from, operation.path, invert);

      } else if (operation.op === 'test') {
        return this.copy(operation.path, operation.value);
      }
    },

    serializePath: function(path) {
      if (this.arrayBasedPaths) {
        return path;

      } else {
        if (path.length === 0) {
          return '/';
        } else {
          return '/' + path.join('/');
        }
      }
    },

    deserializePath: function(path) {
      if (typeof path === 'string') {
        if (path.indexOf('/') === 0) {
          path = path.substr(1);
        }

        if (path.length === 0) {
          return [];
        } else {
          return path.split('/');
        }

      } else {
        return path;
      }
    },

    /////////////////////////////////////////////////////////////////////////////
    // Internals
    /////////////////////////////////////////////////////////////////////////////

    _pathNotFound: function(path) {
      throw new exceptions.PathNotFoundException(this.serializePath(path));
    },

    _retrieve: function(path) {
      var ptr = this._data,
          segment;
      if (path) {
        for (var i = 0, len = path.length; i < len; i++) {
          segment = path[i];
          if (objects.isArray(ptr)) {
            if (segment === '-') {
              ptr = ptr[ptr.length-1];
            } else {
              ptr = ptr[parseInt(segment, 10)];
            }
          } else {
            ptr = ptr[segment];
          }
          if (ptr === undefined) {
            this._pathNotFound(path);
          }
        }
      }
      return ptr;
    },

    _add: function(path, value, invert) {
      var inverse;
      value = objects.clone(value);
      if (path.length > 0) {
        var parentKey = path[path.length-1];
        if (path.length > 1) {
          var grandparent = this._retrieve(path.slice(0, -1));
          if (objects.isArray(grandparent)) {
            if (parentKey === '-') {
              if (invert) {
                inverse = [{op: 'remove', path: this.serializePath(path)}];
              }
              grandparent.push(value);
            } else {
              var parentIndex = parseInt(parentKey, 10);
              if (parentIndex > grandparent.length) {
                this._pathNotFound(path);
              } else {
                if (invert) {
                  inverse = [{op: 'remove', path: this.serializePath(path)}];
                }
                grandparent.splice(parentIndex, 0, value);
              }
            }
          } else {
            if (invert) {
              if (grandparent.hasOwnProperty(parentKey)) {
                inverse = [{op: 'replace', path: this.serializePath(path), value: objects.clone(grandparent[parentKey])}];
              } else {
                inverse = [{op: 'remove', path: this.serializePath(path)}];
              }
            }
            grandparent[parentKey] = value;
          }
        } else {
          if (invert) {
            if (this._data.hasOwnProperty(parentKey)) {
              inverse = [{op: 'replace', path: this.serializePath(path), value: objects.clone(this._data[parentKey])}];
            } else {
              inverse = [{op: 'remove', path: this.serializePath(path)}];
            }
          }
          this._data[parentKey] = value;
        }
      } else {
        if (invert) {
          inverse = [{op: 'replace', path: this.serializePath([]), value: objects.clone(this._data)}];
        }
        this._data = value;
      }
      return inverse;
    },

    _remove: function(path, invert) {
      var inverse;
      if (path.length > 0) {
        var parentKey = path[path.length-1];
        if (path.length > 1) {
          var grandparent = this._retrieve(path.slice(0, -1));
          if (objects.isArray(grandparent)) {
            if (grandparent.length > 0) {
              if (parentKey === '-') {
                if (invert) {
                  inverse = [{op: 'add', path: this.serializePath(path), value: objects.clone(grandparent.pop())}];
                } else {
                  grandparent.pop();
                }
              } else {
                var parentIndex = parseInt(parentKey, 10);
                if (grandparent[parentIndex] === undefined) {
                  this._pathNotFound(path);
                } else {
                  if (invert) {
                    inverse = [{op: 'add', path: this.serializePath(path), value: objects.clone(grandparent.splice(parentIndex, 1)[0])}];
                  } else {
                    grandparent.splice(parentIndex, 1);
                  }
                }
              }
            } else {
              this._pathNotFound(path);
            }

          } else if (grandparent[parentKey] === undefined) {
            this._pathNotFound(path);

          } else {
            if (invert) {
              inverse = [{op: 'add', path: this.serializePath(path), value: objects.clone(grandparent[parentKey])}];
            }
            delete grandparent[parentKey];
          }
        } else if (this._data[parentKey] === undefined) {
          this._pathNotFound(path);

        } else {
          if (invert) {
            inverse = [{op: 'add', path: this.serializePath(path), value: objects.clone(this._data[parentKey])}];
          }
          delete this._data[parentKey];
        }
      } else {
        if (invert) {
          inverse = [{op: 'add', path: this.serializePath(path), value: objects.clone(this._data)}];
        }
        this._data = {};
      }
      return inverse;
    },

    _replace: function(path, value, invert) {
      var inverse;
      value = objects.clone(value);
      if (path.length > 0) {
        var parentKey = path[path.length-1];
        if (path.length > 1) {
          var grandparent = this._retrieve(path.slice(0, -1));
          if (objects.isArray(grandparent)) {
            if (grandparent.length > 0) {
              if (parentKey === '-') {
                if (invert) {
                  inverse = [{op: 'replace', path: this.serializePath(path), value: objects.clone(grandparent[grandparent.length-1])}];
                }
                grandparent[grandparent.length-1] = value;
              } else {
                var parentIndex = parseInt(parentKey, 10);
                if (grandparent[parentIndex] === undefined) {
                  this._pathNotFound(path);
                } else {
                  if (invert) {
                    inverse = [{op: 'replace', path: this.serializePath(path), value: objects.clone(grandparent.splice(parentIndex, 1, value)[0])}];
                  } else {
                    grandparent.splice(parentIndex, 1, value);
                  }
                }
              }
            } else {
              this._pathNotFound(path);
            }

          } else if (grandparent[parentKey] === undefined) {
            this._pathNotFound(path);

          } else {
            if (invert) {
              inverse = [{op: 'replace', path: this.serializePath(path), value: objects.clone(grandparent[parentKey])}];
            }
            grandparent[parentKey] = value;
          }
        } else if (this._data[parentKey] === undefined) {
          this._pathNotFound(path);

        } else {
          if (invert) {
            inverse = [{op: 'replace', path: this.serializePath(path), value: objects.clone(this._data[parentKey])}];
          }
          this._data[parentKey] = value;
        }
      } else {
        if (invert) {
          inverse = [{op: 'replace', path: this.serializePath([]), value: objects.clone(this._data)}];
        }
        this._data = value;
      }
      return inverse;
    },

    _move: function(fromPath, toPath, invert) {
      if (eq.eq(fromPath, toPath)) {
        if (invert) return [];
        return;

      } else {
        var value = this._retrieve(fromPath);
        if (invert) {
          return this._remove(fromPath, true)
              .concat(this._add(toPath, value, true))
              .reverse();

        } else {
          this._remove(fromPath);
          this._add(toPath, value);
        }
      }
    },

    _copy: function(fromPath, toPath, invert) {
      if (eq.eq(fromPath, toPath)) {
        if (invert) return [];
        return;

      } else {
        return this._add(toPath, this._retrieve(fromPath), invert);
      }
    }
  });

  exports['default'] = Document;

});
define('orbit/evented', ['exports', 'orbit/main', 'orbit/notifier', 'orbit/lib/assert', 'orbit/lib/objects'], function (exports, Orbit, Notifier, assert, objects) {

  'use strict';

  var notifierForEvent = function(object, eventName, createIfUndefined) {
    var notifier = object._eventedNotifiers[eventName];
    if (!notifier && createIfUndefined) {
      notifier = object._eventedNotifiers[eventName] = new Notifier['default']();
    }
    return notifier;
  };

  var removeNotifierForEvent = function(object, eventName) {
    delete object._eventedNotifiers[eventName];
  };

  /**
   The `Evented` interface uses notifiers to add events to an object. Like
   notifiers, events will send along all of their arguments to subscribed
   listeners.

   The `Evented` interface can extend an object or prototype as follows:

   ```javascript
   var source = {};
   Orbit.Evented.extend(source);
   ```

   Listeners can then register themselves for particular events with `on`:

   ```javascript
   var listener1 = function(message) {
         console.log('listener1 heard ' + message);
       },
       listener2 = function(message) {
         console.log('listener2 heard ' + message);
       };

   source.on('greeting', listener1);
   source.on('greeting', listener2);

   evented.emit('greeting', 'hello'); // logs "listener1 heard hello" and
                                      //      "listener2 heard hello"
   ```

   Listeners can be unregistered from events at any time with `off`:

   ```javascript
   source.off('greeting', listener2);
   ```

   A listener can register itself for multiple events at once:

   ```javascript
   source.on('greeting salutation', listener2);
   ```

   And multiple events can be triggered sequentially at once,
   assuming that you want to pass them all the same arguments:

   ```javascript
   source.emit('greeting salutation', 'hello', 'bonjour', 'guten tag');
   ```

   Last but not least, listeners can be polled
   (note that spaces can't be used in event names):

   ```javascript
   source.on('question', function(question) {
     if (question === 'favorite food?') return 'beer';
   });

   source.on('question', function(question) {
     if (question === 'favorite food?') return 'wasabi almonds';
   });

   source.on('question', function(question) {
     // this listener doesn't return anything, and therefore won't participate
     // in the poll
   });

   source.poll('question', 'favorite food?'); // returns ['beer', 'wasabi almonds']
   ```

   @class Evented
   @namespace Orbit
   @extension
   @constructor
   */
  var Evented = {
    /**
     Mixes the `Evented` interface into an object

     @method extend
     @param {Object} object Object to extend
     @returns {Object} Extended object
     */
    extend: function(object) {
      assert.assert('Evented requires Orbit.Promise be defined', Orbit['default'].Promise);

      if (object._evented === undefined) {
        objects.extend(object, this.interface);
        object._eventedNotifiers = {};
      }
      return object;
    },

    interface: {
      _evented: true,

      on: function(eventNames, callback, binding) {
        binding = binding || this;

        eventNames.split(/\s+/).forEach(function(eventName) {
          notifierForEvent(this, eventName, true).addListener(callback, binding);
        }, this);
      },

      off: function(eventNames, callback, binding) {
        var notifier;

        binding = binding || this;

        eventNames.split(/\s+/).forEach(function(eventName) {
          notifier = notifierForEvent(this, eventName);
          if (notifier) {
            if (callback) {
              notifier.removeListener(callback, binding);
            } else {
              removeNotifierForEvent(this, eventName);
            }
          }
        }, this);
      },

      one: function(eventName, callback, binding) {
        var callOnce,
            notifier;

        binding = binding || this;

        notifier = notifierForEvent(this, eventName, true);

        callOnce = function() {
          callback.apply(binding, arguments);
          notifier.removeListener(callOnce, binding);
        };

        notifier.addListener(callOnce, binding);
      },

      emit: function(eventNames) {
        var args = Array.prototype.slice.call(arguments, 1),
            notifier;

        eventNames.split(/\s+/).forEach(function(eventName) {
          notifier = notifierForEvent(this, eventName);
          if (notifier) {
            notifier.emit.apply(notifier, args);
          }
        }, this);
      },

      poll: function(eventNames) {
        var args = Array.prototype.slice.call(arguments, 1),
            notifier,
            responses = [];

        eventNames.split(/\s+/).forEach(function(eventName) {
          notifier = notifierForEvent(this, eventName);
          if (notifier) {
            responses = responses.concat(notifier.poll.apply(notifier, args));
          }
        }, this);

        return responses;
      },

      listeners: function(eventNames) {
        var notifier,
            listeners = [];

        eventNames.split(/\s+/).forEach(function(eventName) {
          notifier = notifierForEvent(this, eventName);
          if (notifier) {
            listeners = listeners.concat(notifier.listeners);
          }
        }, this);

        return listeners;
      },

      resolve: function(eventNames) {
        var listeners = this.listeners(eventNames),
            args = Array.prototype.slice.call(arguments, 1);

        return new Orbit['default'].Promise(function(resolve, reject) {
          var resolveEach = function() {
            if (listeners.length === 0) {
              reject();
            } else {
              var listener = listeners.shift();
              var response = listener[0].apply(listener[1], args);

              if (response) {
                response.then(
                  function(success) {
                    resolve(success);
                  },
                  function(error) {
                    resolveEach();
                  }
                );
              } else {
                resolveEach();
              }
            }
          };

          resolveEach();
        });
      },

      settle: function(eventNames) {
        var listeners = this.listeners(eventNames),
            args = Array.prototype.slice.call(arguments, 1);

        return new Orbit['default'].Promise(function(resolve) {
          var settleEach = function() {
            if (listeners.length === 0) {
              resolve();
            } else {
              var listener = listeners.shift();
              var response;
              try {
                response = listener[0].apply(listener[1], args);
              } catch (e) {
                console.error('Orbit ignored error in event listener', eventNames);
                console.error(e.stack || e);
              }

              if (response) {
                return response.then(
                  function(success) {
                    settleEach();
                  },
                  function(error) {
                    settleEach();
                  }
                );
              } else {
                settleEach();
              }
            }
          };

          settleEach();
        });
      }
    }
  };

  exports['default'] = Evented;

});
define('orbit/lib/assert', ['exports'], function (exports) {

  'use strict';

  /**
   Throw an exception if `test` is not truthy.

   @method assert
   @for Orbit
   @param desc Description of the error thrown
   @param test Value that should be truthy for assertion to pass
   */
  var assert = function(desc, test) {
    if (!test) throw new Error("Assertion failed: " + desc);
  };

  exports.assert = assert;

});
define('orbit/lib/config', ['exports'], function (exports) {

  'use strict';

  /**
   Converts an array of values to an object with those values as properties
   having a value of `true`.

   This is useful for converting an array of settings to a more efficiently
   accessible settings object.

   @example

   ``` javascript
   Orbit.arrayToOptions(['a', 'b']); // returns {a: true, b: true}
   ```

   @method arrayToOptions
   @for Orbit
   @param {Array} a
   @returns {Object} Set of options, keyed by the elements in `a`
   */
  var arrayToOptions = function(a) {
    var options = {};
    if (a) {
      for (var i in a) {
        if (a.hasOwnProperty(i)) options[a[i]] = true;
      }
    }
    return options;
  };

  exports.arrayToOptions = arrayToOptions;

});
define('orbit/lib/deprecate', ['exports'], function (exports) {

  'use strict';

  /**
   Display a deprecation warning with the provided message.

   @method deprecate
   @for Orbit
   @param {String} message Description of the deprecation
   @param {Boolean} test An optional boolean. If false, the deprecation will be displayed.
   */
  var deprecate = function(message, test) {
    if (typeof test === 'function') {
      if (test()) return;
    } else {
      if (test) return;
    }
    console.warn(message);
  };

  exports.deprecate = deprecate;

});
define('orbit/lib/diffs', ['exports', 'orbit/lib/eq', 'orbit/lib/objects', 'orbit/lib/config'], function (exports, eq, objects, config) {

  'use strict';

  var diffs = function(a, b, options) {
    if (a === b) {
      return undefined;

    } else {
      options = options || {};

      var ignore = config.arrayToOptions(options.ignore),
          basePath = options.basePath || '';

      if (objects.isArray(basePath)) {
        basePath = basePath.join('/');
      }

      var type = Object.prototype.toString.call(a);
      if (type === Object.prototype.toString.call(b)) {
        if (a !== null && typeof a === 'object') {
          var i,
              d;

          if (objects.isArray(a)) {
            var aLength = a.length,
                bLength = b.length,
                maxLength = bLength > aLength ? bLength : aLength,
                match,
                ai = 0,
                bi = 0,
                bj;

            for (i = 0; i < maxLength; i++) {
              if (ai >= aLength) {
                if (d === undefined) d = [];
                d.push({op: 'add', path: basePath + '/' + bi, value: objects.clone(b[bi])});
                bi++;

              } else if (bi >= bLength) {
                if (d === undefined) d = [];
                d.push({op: 'remove', path: basePath + '/' + ai});
                ai++;

              } else if (!eq.eq(a[ai], b[bi])) {
                match = -1;
                for (bj = bi + 1; bj < bLength; bj++) {
                  if (eq.eq(a[ai], b[bj])) {
                    match = bj;
                    break;
                  }
                }
                if (match === -1) {
                  if (d === undefined) d = [];
                  d.push({op: 'remove', path: basePath + '/' + ai});
                  ai++;

                } else {
                  if (d === undefined) d = [];
                  d.push({op: 'add', path: basePath + '/' + bi, value: objects.clone(b[bi])});
                  bi++;
                }
              } else {
                ai++;
                bi++;
              }
            }
          } else if (a instanceof Date) {
            if (a.getTime() === b.getTime()) return;
            if (d === undefined) d = [];
            d.push({op: 'replace', path: basePath, value: objects.clone(b)});

          } else { // general (non-array) object
            for (i in b) {
              if (!ignore[i] && b.hasOwnProperty(i)) {
                if (a[i] === undefined) {
                  if (d === undefined) d = [];
                  d.push({op: 'add', path: basePath + '/' + i, value: objects.clone(b[i])});

                } else if (!eq.eq(a[i], b[i])) {
                  if (d === undefined) d = [];
                  d = d.concat(diffs(a[i], b[i], {basePath: basePath + '/' + i}));
                }
              }
            }

            for (i in a) {
              if (!ignore[i] && a.hasOwnProperty(i)) {
                if (b[i] === undefined) {
                  if (d === undefined) d = [];
                  d.push({op: 'remove', path: basePath + '/' + i});
                }
              }
            }
          }

          return d;

        } else if (eq.eq(a, b)) {
          return undefined;
        }
      }

      return [{op: 'replace', path: basePath, value: objects.clone(b)}];
    }
  };

  exports.diffs = diffs;

});
define('orbit/lib/eq', ['exports'], function (exports) {

  'use strict';

  /* jshint eqeqeq: false, -W041: false */

  /**
   `eq` checks the equality of two objects.

   The properties belonging to objects (but not their prototypes) will be
   traversed deeply and compared.

   Includes special handling for strings, numbers, dates, booleans, regexes, and
   arrays.

   @method eq
   @for Orbit
   @param a
   @param b
   @returns {Boolean} are `a` and `b` equal?
   */
  var eq = function(a, b) {
    // Some elements of this function come from underscore
    // (c) 2009-2013 Jeremy Ashkenas, DocumentCloud and Investigative Reporters & Editors
    //
    // https://github.com/jashkenas/underscore/blob/master/underscore.js

    // Identical objects are equal. `0 === -0`, but they aren't identical.
    // See the [Harmony `egal` proposal](http://wiki.ecmascript.org/doku.php?id=harmony:egal).
    if (a === b) return a !== 0 || 1 / a == 1 / b;
    // A strict comparison is necessary because `null == undefined`.
    if (a == null || b == null) return a === b;

    var type = Object.prototype.toString.call(a);
    if (type !== Object.prototype.toString.call(b)) return false;

    switch(type) {
      case '[object String]':
        return a == String(b);
      case '[object Number]':
        // `NaN`s are equivalent, but non-reflexive. An `egal` comparison is performed for
        // other numeric values.
        return a != +a ? b != +b : (a == 0 ? 1 / a == 1 / b : a == +b);
      case '[object Date]':
      case '[object Boolean]':
        // Coerce dates and booleans to numeric primitive values. Dates are compared by their
        // millisecond representations. Note that invalid dates with millisecond representations
        // of `NaN` are not equivalent.
        return +a == +b;
      // RegExps are compared by their source patterns and flags.
      case '[object RegExp]':
        return a.source == b.source &&
               a.global == b.global &&
               a.multiline == b.multiline &&
               a.ignoreCase == b.ignoreCase;
    }
    if (typeof a != 'object' || typeof b != 'object') return false;

    if (type === '[object Array]') {
      if (a.length !== b.length) return false;
    }

    var d, i;
    for (i in b) {
      if (b.hasOwnProperty(i)) {
        if (!eq(a[i], b[i])) return false;
      }
    }
    for (i in a) {
      if (a.hasOwnProperty(i)) {
        if (!eq(a[i], b[i])) return false;
      }
    }
    return true;
  };

  exports.eq = eq;

});
define('orbit/lib/exceptions', ['exports', 'orbit/lib/objects'], function (exports, objects) {

  'use strict';

  var Exception = objects.Class.extend();

  /**
   Exception thrown when a path in a document can not be found.

   @class PathNotFoundException
   @namespace Orbit
   @param {String} path
   @constructor
   */
  var PathNotFoundException = Exception.extend({
    init: function(path) {
      this.path = path;
    }
  });

  exports.Exception = Exception;
  exports.PathNotFoundException = PathNotFoundException;

});
define('orbit/lib/functions', ['exports'], function (exports) {

  'use strict';

  /**
   Wraps a function that expects parameters with another that can accept the parameters as an array

   @method spread
   @for Orbit
   @param {Object} func
   @returns {function}
   */
  var spread = function(func) {
    return function(args) {
      func.apply(null, args);
    };
  };

  exports.spread = spread;

});
define('orbit/lib/objects', ['exports', 'orbit/lib/eq'], function (exports, eq) {

  'use strict';

  var clone = function(obj) {
    if (obj === undefined || obj === null || typeof obj !== 'object') return obj;

    var dup,
        type = Object.prototype.toString.call(obj);

    if (type === "[object Date]") {
      dup = new Date();
      dup.setTime(obj.getTime());

    } else if (type === "[object RegExp]") {
      dup = obj.constructor(obj);

    } else if (type === "[object Array]") {
      dup = [];
      for (var i = 0, len = obj.length; i < len; i++) {
        if (obj.hasOwnProperty(i)) {
          dup.push(clone(obj[i]));
        }
      }

    } else  {
      var val;

      dup = {};
      for (var key in obj) {
        if (obj.hasOwnProperty(key)) {
          val = obj[key];
          if (typeof val === 'object') val = clone(val);
          dup[key] = val;
        }
      }
    }
    return dup;
  };

  /**
   Expose properties and methods from one object on another.

   Methods will be called on `source` and will maintain `source` as the
   context.

   @method expose
   @for Orbit
   @param {Object} destination
   @param {Object} source
   */
  var expose = function(destination, source) {
    var properties;
    if (arguments.length > 2) {
      properties = Array.prototype.slice.call(arguments, 2);
    } else {
      properties = Object.keys(source);
    }

    properties.forEach(function(p) {
      if (typeof source[p] === 'function') {
        destination[p] = function() {
          return source[p].apply(source, arguments);
        };
      } else {
        destination[p] = source[p];
      }
    });
  };

  /**
   Extend an object with the properties of one or more other objects.

   @method extend
   @for Orbit
   @param {Object} destination The object to merge into
   @param {Object} source One or more source objects
   */
  var extend = function(destination) {
    var sources = Array.prototype.slice.call(arguments, 1);
    sources.forEach(function(source) {
      for (var p in source) {
        if (source.hasOwnProperty(p)) {
          destination[p] = source[p];
        }
      }
    });
    return destination;
  };

  /**
   Extend a class with the properties and methods of one or more other classes.

   When a method is replaced with another method, it will be wrapped in a
   function that makes the replaced method accessible via `this._super`.

   @method extendClass
   @for Orbit
   @param {Object} destination The class to merge into
   @param {Object} source One or more source classes
   */
  var extendClass = function(destination) {
    var sources = Array.prototype.slice.call(arguments, 1);
    sources.forEach(function(source) {
      for (var p in source) {
        if (source.hasOwnProperty(p) &&
            destination[p] &&
            typeof destination[p] === 'function' &&
            typeof source[p] === 'function') {

          /* jshint loopfunc:true */
          destination[p] =
            (function(destinationFn, sourceFn) {
              var wrapper = function() {
                var prevSuper = this._super;
                this._super = destinationFn;

                var ret = sourceFn.apply(this, arguments);

                this._super = prevSuper;

                return ret;
              };
              wrapper.wrappedFunction = sourceFn;
              return wrapper;
            })(destination[p], source[p]);

        } else {
          destination[p] = source[p];
        }
      }
    });
  };

  // `subclassing` is a state flag used by `defineClass` to track when a class is
  // being subclassed. It allows constructors to avoid calling `init`, which can
  // be expensive and cause undesireable side effects.
  var subclassing = false;

  /**
   Define a new class with the properties and methods of one or more other classes.

   The new class can be based on a `SuperClass`, which will be inserted into its
   prototype chain.

   Furthermore, one or more mixins (object that contain properties and/or methods)
   may be specified, which will be applied in order. When a method is replaced
   with another method, it will be wrapped in a function that makes the previous
   method accessible via `this._super`.

   @method defineClass
   @for Orbit
   @param {Object} SuperClass A base class to extend. If `mixins` are to be included
                              without a `SuperClass`, pass `null` for SuperClass.
   @param {Object} mixins One or more objects that contain properties and methods
                          to apply to the new class.
   */
  var defineClass = function(SuperClass) {
    var Class = function() {
      if (!subclassing && this.init) {
        this.init.apply(this, arguments);
      }
    };

    if (SuperClass) {
      subclassing = true;
      Class.prototype = new SuperClass();
      subclassing = false;
    }

    if (arguments.length > 1) {
      var extendArgs = Array.prototype.slice.call(arguments, 1);
      extendArgs.unshift(Class.prototype);
      extendClass.apply(Class.prototype, extendArgs);
    }

    Class.constructor = Class;

    Class.extend = function() {
      var args = Array.prototype.slice.call(arguments, 0);
      args.unshift(Class);
      return defineClass.apply(Class, args);
    };

    return Class;
  };

  /**
   A base class that can be extended.

   @example

   ```javascript
   var CelestialObject = Class.extend({
     init: function(name) {
       this._super();
       this.name = name;
       this.isCelestialObject = true;
     },
     greeting: function() {
       return 'Hello from ' + this.name;
     }
   });

   var Planet = CelestialObject.extend({
     init: function(name) {
       this._super.apply(this, arguments);
       this.isPlanet = true;
     },
     greeting: function() {
       return this._super() + '!';
     },
   });

   var earth = new Planet('Earth');

   console.log(earth instanceof Class);           // true
   console.log(earth instanceof CelestialObject); // true
   console.log(earth instanceof Planet);          // true

   console.log(earth.isCelestialObject);          // true
   console.log(earth.isPlanet);                   // true

   console.log(earth.greeting());                 // 'Hello from Earth!'
   ```

   @class Class
   @for Orbit
   */
  var Class = defineClass(null, {
    init: function() {}
  });

  /**
   Checks whether an object is an instance of an `Array`

   @method isArray
   @for Orbit
   @param {Object} obj
   @returns {boolean}
   */
  var isArray = function(obj) {
    return Object.prototype.toString.call(obj) === '[object Array]';
  };

  /**
   Checks whether a value is a non-null object

   @method isObject
   @for Orbit
   @param {Object} obj
   @returns {boolean}
   */
  var isObject = function(obj) {
    return obj !== null && typeof obj === 'object';
  };

  /**
   Checks whether an object is null or undefined

   @method isNone
   @for Orbit
   @param {Object} obj
   @returns {boolean}
   */
  var isNone = function(obj) {
    return obj === undefined || obj === null;
  };

  /**
   Combines two objects values

   @method merge
   @for Orbit
   @param {Object} base
   @param {Object} source
   @returns {Object}
   */
  var merge =  function(base, source) {
    var merged = clone(base);
    if (source) {
      Object.keys(source).forEach(function(field) {
        if (source.hasOwnProperty(field)) {
          var fieldDef = source[field];
          merged[field] = fieldDef;
        }
      });
    }

    return merged;
  };

  exports.Class = Class;
  exports.clone = clone;
  exports.defineClass = defineClass;
  exports.expose = expose;
  exports.extend = extend;
  exports.extendClass = extendClass;
  exports.isArray = isArray;
  exports.isObject = isObject;
  exports.isNone = isNone;
  exports.merge = merge;

});
define('orbit/lib/operations', ['exports', 'orbit/lib/objects', 'orbit/document', 'orbit/lib/eq', 'orbit/operation'], function (exports, objects, Document, eq, Operation) {

  'use strict';

  exports.coalesceOperations = coalesceOperations;

  function _requiresMerge(superceded, superceding){
    return (
      superceded.path.join("/").indexOf(superceding.path.join("/")) === 0 ||
      superceding.path.join("/").indexOf(superceded.path.join("/")) === 0
    );
  }

  function _valueTypeForPath(path) {
    if(path[2] === '__rel') return 'link';
    if(path.length === 2) return 'record';
    return 'field';
  }

  function _linkTypeFor(path){
    return path.length === 4 ? 'hasOne' : 'hasMany';
  }

  function _mergeAttributeWithRecord(superceded, superceding){
    var record = superceded.value;
    var fieldName = superceding.path[2];
    record[fieldName] = superceding.value;
    return new Operation['default']({ op: 'add', path: superceded.path, value: record });
  }

  function _mergeRecordWithAttribute(superceded, superceding){
    var record = superceding.value,
        recordPath = superceding.path;
    var fieldName = superceded.path[2];
    record[fieldName] = record[fieldName] || superceded.value;
    return new Operation['default']({ op: 'add', path: recordPath, value: record });
  }

  function _mergeLinkWithRecord(superceded, superceding){
    var record = superceded.value;
    var linkName = superceding.path[3];
    var linkId = superceding.path[4];
    var linkType = _linkTypeFor(superceding.path);

    record.__rel = record.__rel || {};

    if(linkType === 'hasMany'){
      record.__rel[linkName] = record.__rel[linkName] || {};
      record.__rel[linkName][linkId] = true;

    }
    else if(linkType === 'hasOne') {
      record.__rel[linkName] = superceding.value;

    }
    else {
      throw new Error("linkType not supported: " + linkType);
    }

    return new Operation['default']({ op: 'add', path: superceded.path, value: record });
  }

  function _mergeRecordWithLink(superceded, superceding){
    var record = superceding.value;
    var linkName = superceded.path[3];
    var linkId = superceded.path[4];
    var linkType = _linkTypeFor(superceded.path);

    record.__rel = record.__rel || {};

    if(linkType === 'hasMany'){
      record.__rel[linkName] = record.__rel[linkName] || {};
      record.__rel[linkName][linkId] = true;

    }
    else if(linkType === 'hasOne') {
      record.__rel[linkName] = record.__rel[linkName] || superceded.value;

    }
    else {
      throw new Error("linkType not supported: " + linkType);
    }

    return new Operation['default']({ op: 'add', path: superceding.path, value: record });
  }

  function _valueTypeForLinkValue(value){
    if(!value) return 'unknown';
    if(objects.isObject(value)) return 'hasMany';
    return 'hasOne';
  }

  function _mergeRecords(target, source) {
    Object.keys(source).forEach( function(attribute) {
      var attributeValue = source[attribute];
      if (attribute !== '__rel') {
        target[attribute] = attributeValue;
      }
    });

    source.__rel = source.__rel || {};
    target.__rel = target.__rel || {};

    var sourceLinks = Object.keys(source.__rel);
    var targetLinks = Object.keys(target.__rel);
    var links = sourceLinks.concat(targetLinks);

    links.forEach( function(link) {
      var linkType = _valueTypeForLinkValue(source.__rel[link] || target.__rel[link]);

      if (linkType === 'hasOne') {
        target.__rel[link] = source.__rel[link];
      } else if (linkType === 'unknown') {
        target.__rel[link] = null;
      } else {
        target.__rel[link] = target.__rel[link] || {};
        target.__rel[link] = objects.merge(target.__rel[link], source.__rel[link]);
      }
    });

    return target;
  }

  function _mergeRecordWithRecord(superceded, superceding) {
    var mergedRecord = { id: superceded.id, __rel: {} },
        supercededRecord = superceded.value,
        supercedingRecord = superceding.value,
        record;

    record = _mergeRecords({}, supercededRecord);
    record = _mergeRecords(record, supercedingRecord);

    return new Operation['default']({ op: 'add', path: superceding.path, value: record });
  }

  function _merge(superceded, superceding){
    var supercedingType = _valueTypeForPath(superceding.path),
        supercededType = _valueTypeForPath(superceded.path);

    if(supercededType === 'record' && supercedingType === 'field'){
      return _mergeAttributeWithRecord(superceded, superceding);
    }
    else if(supercededType === 'field' && supercedingType === 'record'){
      return _mergeRecordWithAttribute(superceded, superceding);
    }
    else if (supercededType === 'record' && supercedingType === 'link'){
      return _mergeLinkWithRecord(superceded, superceding);
    }
    else if (supercededType === 'link' && supercedingType === 'record'){
      return _mergeRecordWithLink(superceded, superceding);
    }
    else if (supercededType === 'record' && supercedingType === 'record'){
      return _mergeRecordWithRecord(superceded, superceding);
    }
    else {
      return superceding;
    }
  }

  /**
   Coalesces operations into a minimal set of equivalent operations

   @method coalesceOperations
   @for Orbit
   @param {Array} operations
   @returns {Array}
   */
  function coalesceOperations(operations) {
    var coalesced = [];
    var superceding;

    operations.forEach(function(superceding){
      coalesced.slice(0).forEach(function(superceded){

        if(_requiresMerge(superceded, superceding)){
          var index = coalesced.indexOf(superceded);
          coalesced.splice(index, 1);
          superceding = _merge(superceded, superceding);
        }

      });
      coalesced.push(superceding);
    });

    return coalesced;
  }

});
define('orbit/lib/strings', ['exports'], function (exports) {

  'use strict';

  /**
   Uppercase the first letter of a string. The remainder of the string won't
   be affected.

   @method capitalize
   @for Orbit
   @param {String} str
   @returns {String} capitalized string
   */
  var capitalize = function(str) {
    return str.charAt(0).toUpperCase() + str.slice(1);
  };

  exports.capitalize = capitalize;

});
define('orbit/lib/stubs', ['exports'], function (exports) {

	'use strict';

	/**
	 Empty method that does nothing.

	 Use as a placeholder for non-required static methods.

	 @method noop
	 @for Orbit
	 */
	var noop = function() {};

	/**
	 Empty method that should be overridden. Otherwise, it will throw an Error.

	 Use as a placeholder for required static methods.

	 @method required
	 @for Orbit
	 */
	var required = function() { throw new Error("Missing implementation"); };

	exports.noop = noop;
	exports.required = required;

});
define('orbit/lib/uuid', ['exports'], function (exports) {

  'use strict';

  /**
   * Fast UUID generator, RFC4122 version 4 compliant.
   * @author Jeff Ward (jcward.com).
   * @license MIT license
   * @link http://stackoverflow.com/questions/105034/how-to-create-a-guid-uuid-in-javascript/21963136#21963136
   **/

  /**
   * ES 6 Module
   * @author Andrew Hacking (ahacking@gmail.com)
   *
   **/
  var lut = []; for (var i=0; i<256; i++) { lut[i] = (i<16?'0':'')+(i).toString(16); }

  /**
   `uuid` generates a Version 4 UUID using Jeff Wards high performance generator.

   @method v4uuid
   @for Orbit
   @returns {String} a version 4 UUID
   */
  var uuid = function() {
    var d0 = Math.random()*0xffffffff|0;
    var d1 = Math.random()*0xffffffff|0;
    var d2 = Math.random()*0xffffffff|0;
    var d3 = Math.random()*0xffffffff|0;
    return lut[d0&0xff]+lut[d0>>8&0xff]+lut[d0>>16&0xff]+lut[d0>>24&0xff]+'-'+
      lut[d1&0xff]+lut[d1>>8&0xff]+'-'+lut[d1>>16&0x0f|0x40]+lut[d1>>24&0xff]+'-'+
      lut[d2&0x3f|0x80]+lut[d2>>8&0xff]+'-'+lut[d2>>16&0xff]+lut[d2>>24&0xff]+
      lut[d3&0xff]+lut[d3>>8&0xff]+lut[d3>>16&0xff]+lut[d3>>24&0xff];
  };

  exports.uuid = uuid;

});
define('orbit/main', ['exports'], function (exports) {

	'use strict';

	/**
	 Contains core methods and classes for Orbit.js

	 @module orbit
	 @main orbit
	 */

	/**
	 Namespace for core Orbit methods and classes.

	 @class Orbit
	 @static
	 */
	var Orbit = {};

	exports['default'] = Orbit;

});
define('orbit/notifier', ['exports', 'orbit/lib/objects'], function (exports, objects) {

  'use strict';

  var Notifier = objects.Class.extend({
    init: function() {
      this.listeners = [];
    },

    /**
     Add a callback as a listener, which will be triggered when sending
     notifications.

     @method addListener
     @param {Function} callback Function to call as a notification
     @param {Object} binding Context in which to call `callback`
     */
    addListener: function(callback, binding) {
      binding = binding || this;
      this.listeners.push([callback, binding]);
    },

    /**
     Remove a listener so that it will no longer receive notifications.

     @method removeListener
     @param {Function} callback Function registered as a callback
     @param {Object} binding Context in which `callback` was registered
     */
    removeListener: function(callback, binding) {
      var listeners = this.listeners,
          listener;

      binding = binding || this;
      for (var i = 0, len = listeners.length; i < len; i++) {
        listener = listeners[i];
        if (listener && listener[0] === callback && listener[1] === binding) {
          listeners.splice(i, 1);
          return;
        }
      }
    },

    /**
     Notify registered listeners.

     Any responses from listeners will be ignored.

     @method emit
     @param {*} Any number of parameters to be sent to listeners
     */
    emit: function() {
      var args = arguments;
      this.listeners.slice(0).forEach(function(listener) {
        listener[0].apply(listener[1], args);
      });
    },

    /**
     Poll registered listeners.

     Any responses from listeners will be returned in an array.

     @method poll
     @param {*} Any number of parameters to be sent to listeners
     @returns {Array} Array of responses
     */
    poll: function() {
      var args = arguments,
          allResponses = [],
          response;

      this.listeners.slice(0).forEach(function(listener) {
        response = listener[0].apply(listener[1], args);
        if (response !== undefined) { allResponses.push(response); }
      });

      return allResponses;
    }
  });

  exports['default'] = Notifier;

});
define('orbit/operation', ['exports', 'orbit/lib/objects', 'orbit/lib/uuid'], function (exports, objects, uuid) {

  'use strict';

  function includeValue(operation) {
    return operation.op !== 'remove';
  }

  /**
   `Operation` provides a thin wrapper over a JSON Patch operation.

   Operations maintain the standard Patch attributes: `op`, `path`, and `value`.

   Operations are automatically assigned a UUID `id`. They can maintain their
   ancestry in a `log`. In this way, it is possible to determine whether
   operations preceded each other.

   Operations can `spawn` descendants, which automatically adds the parent to
   the child's history.

   @class Operation
   @namespace Orbit
   @param {Object}    [options]
   @param {String}    [options.op] Patch attribute `op`
   @param {String}    [options.path] Patch attribute `path`
   @param {Object}    [options.value] Patch attribute `value`
   @param {Operation} [options.parent] parent operation that spawned this one
   @constructor
   */
  var Operation = objects.Class.extend({
    op: null,
    path: null,
    value: null,
    log: null,

    init: function(options) {
      options = options || {};

      var path = options.path;
      if (typeof path === 'string') {
        if (path.indexOf('/') === 0) {
          path = path.substr(1);
        }
        if (path.length === 0) {
          path = [];
        } else {
          path = path.split('/');
        }
      }

      this.op = options.op;
      this.path = path;
      if (includeValue(this)) {
        this.value = options.value;
      } else {
        this.value = undefined;
      }

      this.id = options.id || uuid.uuid();

      if (options.parent) {
        this.log = options.parent.log.concat(options.parent.id);
      } else {
        this.log = options.log || [];
      }
    },

    descendedFrom: function(operation) {
      return this.log.indexOf(operation.id || operation) > -1;
    },

    relatedTo: function(operation) {
      if (operation instanceof Operation) {
        return (operation.descendedFrom(this.log[0] || this.id) ||
                this.descendedFrom(operation.log[0] || operation.id) ||
                this.id === operation.id);
      } else {
        return this.descendedFrom(operation) || this.id === operation;
      }
    },

    spawn: function(data) {
      return new Operation({
        op: data.op,
        path: data.path,
        value: data.value,
        parent: this
      });
    },

    serialize: function() {
      var serialized = {
        op: this.op,
        path: this.path.join('/')
      };

      if (includeValue(this)) {
        serialized.value = this.value;
      }

      return serialized;
    }
  });

  exports['default'] = Operation;

});
define('orbit/request-connector', ['exports', 'orbit/requestable', 'orbit/lib/assert', 'orbit/lib/config', 'orbit/lib/objects', 'orbit/lib/strings'], function (exports, Requestable, assert, config, objects, strings) {

  'use strict';

  var RequestConnector = objects.Class.extend({
    init: function(primarySource, secondarySource, options) {
      this.primarySource = primarySource;
      this.secondarySource = secondarySource;

      options = options || {};

      this.actions = options.actions || Requestable['default'].defaultActions;
      if (options.types) this.types = config.arrayToOptions(options.types);

      this.mode = options.mode !== undefined ? options.mode : 'rescue';
      assert.assert("`mode` must be 'assist' or 'rescue'", this.mode === 'assist' ||
                                                    this.mode === 'rescue');

      var active = options.active !== undefined ? options.active : true;
      if (active) this.activate();
    },

    activate: function() {
      if (this._active) return;

      if (!this.handlers) {
        this.handlers = {};
      }

      this.actions.forEach(function(action) {
        var handler = this.handlers[action] || this._handlerFor(action);

        this.primarySource.on(this.mode + strings.capitalize(action),
          handler,
          this.secondarySource
        );

        this.handlers[action] = handler;
      }, this);

      this._active = true;
    },

    deactivate: function() {
      var _this = this;

      this.actions.forEach(function(action) {
        _this.primarySource.off(_this.mode + strings.capitalize(action),
          _this.handlers[action],
          _this.secondarySource
        );
      });

      this._active = false;
    },

    isActive: function() {
      return this._active;
    },

    /**
     * Should return the handler for a Requestable action.
     *
     * @param {String} action - I.E. 'find', 'findLink'
     * @returns {Function} handler to call for that action
     */
    _handlerFor: function(action) {
      if (!this.types) {
        return this.secondarySource[action];
      }

      var _this = this;
      return function filterRequestByType(type) {
        if (_this.types[type]) {
          return _this.secondarySource[action].apply(_this.secondarySource, arguments);
        }
      };
    }
  });

  exports['default'] = RequestConnector;

});
define('orbit/requestable', ['exports', 'orbit/evented', 'orbit/lib/assert', 'orbit/lib/objects', 'orbit/lib/strings'], function (exports, Evented, assert, objects, strings) {

  'use strict';

  var Requestable = {
    defaultActions: ['find'],

    extend: function(object, actions) {
      if (object._requestable === undefined) {
        object._requestable = true;
        Evented['default'].extend(object);
        this.defineAction(object, actions || this.defaultActions);
      }
      return object;
    },

    defineAction: function(object, action) {
      if (objects.isArray(action)) {
        action.forEach(function(name) {
          this.defineAction(object, name);
        }, this);
      } else {
        object[action] = function() {
          assert.assert('_' + action + ' must be defined', object['_' + action]);

          var args = Array.prototype.slice.call(arguments, 0),
              Action = strings.capitalize(action);

          return object.resolve.apply(object, ['assist' + Action].concat(args)).then(
            undefined,
            function() {
              return object['_' + action].apply(object, args);
            }
          ).then(
            undefined,
            function(error) {

              return object.resolve.apply(object, ['rescue' + Action].concat(args)).then(
                undefined,
                function() {
                  throw error;
                }
              );
            }
          ).then(
            function(result) {
              args.unshift('did' + Action);
              args.push(result);

              return object.settle.apply(object, args).then(
                function() {
                  return result;
                }
              );
            },
            function(error) {
              args.unshift('didNot' + Action);
              args.push(error);

              return object.settle.apply(object, args).then(
                function() {
                  throw error;
                }
              );
            }
          );
        };
      }
    }
  };

  exports['default'] = Requestable;

});
define('orbit/transaction', ['exports', 'orbit/lib/objects'], function (exports, objects) {

  'use strict';

  var Transaction = objects.Class.extend({
    init: function(source, options) {
      this.source = source;

      options = options || {};
      var active = options.active !== undefined ? options.active : true;
      if (active) this.begin();
    },

    begin: function() {
      this.ops = [];
      this.inverseOps = [];
      this._activate();
    },

    commit: function() {
      this._deactivate();
    },

    rollback: function() {
      this._deactivate();
      return this.source.transform(this.inverseOps);
    },

    /////////////////////////////////////////////////////////////////////////////
    // Internals
    /////////////////////////////////////////////////////////////////////////////

    _activate: function() {
      this.source.on('didTransform', this._processTransform, this);
      this.active = true;
    },

    _deactivate: function() {
      this.source.off('didTransform', this._processTransform, this);
      this.active = false;
    },

    _processTransform: function(op, inverseOps) {
      this.ops.push(op);
      this.inverseOps.push.apply(this.inverseOps, inverseOps);
    }
  });

  exports['default'] = Transaction;

});
define('orbit/transform-connector', ['exports', 'orbit/lib/objects', 'orbit/lib/diffs', 'orbit/lib/eq', 'orbit/lib/config'], function (exports, objects, diffs, eq, config) {

  'use strict';

  var TransformConnector = objects.Class.extend({
    init: function(source, target, options) {
      this.source = source;
      this.target = target;

      options = options || {};
      this.blocking = options.blocking !== undefined ? options.blocking : true;
      var active = options.active !== undefined ? options.active : true;

      if (options.rollbackTransformsOnFailure) {
        console.error('TransformConnector#rollbackTransformsOnFailure is no longer supported.');
      }

      if (active) this.activate();
    },

    activate: function() {
      if (this._active) return;

      this.source.on('didTransform',  this._processTransform,  this);

      this._active = true;
    },

    deactivate: function() {
      this.source.off('didTransform',  this._processTransform,  this);

      this._active = false;
    },

    isActive: function() {
      return this._active;
    },

    transform: function(operation) {
      // console.log('****', ' transform from ', this.source.id, ' to ', this.target.id, operation);

      var _this = this;

      // If the target is currently processing a transformation and this
      // operation does not belong to that transformation, then wait for the
      // transformation to complete before applying this operation.
      //
      // This will be called recursively to process multiple transformations if
      // necessary.
      var currentTransformation = this.target.currentTransformation();
      if (currentTransformation && !currentTransformation.verifyOperation(operation)) {
        // console.log('>>>> TransformConnector#transform - waiting', this.source.id, this.target.id, operation);
        return currentTransformation.process().then(function() {
          // console.log('<<<< TransformConnector#transform - done waiting', _this.source.id, _this.target.id, operation);
          return _this.transform(operation);
        });
      }

      if (this.target.retrieve) {
        var currentValue = this.target.retrieve(operation.path);

        // console.log('currentValue', currentValue, ' transform from ', this.source.id, ' to ', this.target.id, operation);

        if (objects.isNone(currentValue)) {
          // Removing a null value, or replacing it with another null value, is unnecessary
          if ((operation.op === 'remove') ||
              (operation.op === 'replace' && objects.isNone(operation.value))) {
            return;
          }

        } else if (operation.op === 'add' || operation.op === 'replace') {
          if (eq.eq(currentValue, operation.value)) {
            // Replacing a value with its equivalent is unnecessary
            return;

          } else {
            return this.resolveConflicts(operation.path, currentValue, operation.value, operation);
          }
        }
      }

      return this.target.transform(operation);
    },

    resolveConflicts: function(path, currentValue, updatedValue, operation) {
      var ops = diffs.diffs(currentValue, updatedValue, { basePath: path });

      if (ops) {
        var spawnedOps = ops.map(function(op) {
          return operation.spawn(op);
        });

        // console.log(this.target.id, 'resolveConflicts', path, currentValue, updatedValue, spawnedOps);

        return this.target.transform(spawnedOps);
      }
    },

    /**
     @method filterFunction
     @param {Object} operation
     @return {Boolean} `true` if the operation should be processed
     */
    filterFunction: null,

    /////////////////////////////////////////////////////////////////////////////
    // Internals
    /////////////////////////////////////////////////////////////////////////////

    _processTransform: function(operation, inverseOps) {
      // console.log('****', ' processTransform from ', this.source.id, ' to ', this.target.id, operation);

      if (this.filterFunction) {
        if (!this.filterFunction(operation)) return;
      }

      if (this.blocking) {
        return this.transform(operation);

      } else {
        this.transform(operation);
      }
    }
  });

  exports['default'] = TransformConnector;

});
define('orbit/transformable', ['exports', 'orbit/main', 'orbit/evented', 'orbit/action-queue', 'orbit/transformation', 'orbit/operation', 'orbit/lib/objects', 'orbit/lib/assert'], function (exports, Orbit, Evented, ActionQueue, Transformation, Operation, objects, assert) {

  'use strict';

  function normalize(operation) {
    if (objects.isArray(operation)) {
      return operation.map(function(o) {
        return normalize(o);
      });

    } else {
      if (operation instanceof Operation['default']) {
        return operation;
      } else {
        return new Operation['default'](operation);
      }
    }
  }

  function transformationFor(operation) {
    var transformation;
    var i;

    if (objects.isArray(operation)) {
      for (i = 0; i < operation.length; i++) {
        var t = transformationFor.call(this, operation[i]);
        if (transformation) {
          if (t !== transformation) return;
        } else {
          transformation = t;
        }
      }
      return transformation;

    } else {
      var queue = this._transformationQueue.content;

      // console.log('transformationFor', operation, queue.length);

      for (i = 0; i < queue.length; i++) {
        transformation = queue[i].data;
        if (transformation.verifyOperation(operation)) {
          return transformation;
        }
      }
    }
  }

  function queueTransformation(transformation) {
    var _this = this;

    var processor = this._transformationQueue.push({
      data: transformation,
      process: function() {
        return transformation.process();
      }
    });

    return processor;
  }

  var Transformable = {
    extend: function(object, actions) {
      if (object._transformable === undefined) {
        object._transformable = true;
        object._transformationQueue = new ActionQueue['default']();

        Evented['default'].extend(object);

        object.didTransform = function(operation, inverse) {
          var normalized = normalize(operation);
          var transformation = transformationFor.call(this, normalized);
          if (transformation) {
            // console.log('Transformable#didTransform - matching transformation found', this.id, normalized, inverse);
            transformation.pushCompletedOperation(normalized, inverse);

          } else {
            // console.log('Transformable#didTransform - createTransformation', this.id, normalized, inverse);
            transformation = new Transformation['default'](this);
            transformation.pushCompletedOperation(normalized, inverse);
            queueTransformation.call(this, transformation);
          }
        };

        object.currentTransformation = function() {
          if (this._transformationQueue.current) return this._transformationQueue.current.data;
        };

        object.transform = function(operation) {
          var normalized = normalize(operation);
          var transformation = transformationFor.call(this, normalized);
          var action;

          if (transformation) {
            // console.log('transform - matching transformation found', this.id, normalized);
            action = transformation.pushOperation(normalized);

            if (objects.isArray(action)) {
              return action[action.length - 1].complete;
            } else {
              return action.complete;
            }

          } else {
            // console.log('transform - createTransformation', this.id, normalized);
            transformation = new Transformation['default'](this);
            action = transformation.pushOperation(normalized);
            var transformationProcessor = queueTransformation.call(this, transformation);
            return transformationProcessor.complete;
          }
        };

        object.settleTransforms = function() {
          return this._transformationQueue.process();
        };
      }

      return object;
    }
  };

  exports['default'] = Transformable;

});
define('orbit/transformation', ['exports', 'orbit/main', 'orbit/lib/objects', 'orbit/action-queue', 'orbit/evented', 'orbit/operation', 'orbit/lib/assert'], function (exports, Orbit, objects, ActionQueue, Evented, Operation, assert) {

  'use strict';

  exports['default'] = objects.Class.extend({
    target: null,

    queue: null,

    originalOperations: null,

    completedOperations: null,

    inverseOperations: null,

    init: function(target) {
      var _this = this;

      assert.assert('_transform must be defined', target._transform);

      Evented['default'].extend(this);

      this.target = target;
      this.queue = new ActionQueue['default']({autoProcess: false});
      this.completedOperations = [];
      this.originalOperations = [];
      this.inverseOperations = [];
    },

    verifyOperation: function(operation) {
      var original;
      for (var i = 0; i < this.originalOperations.length; i++) {
        original = this.originalOperations[i];
        if (operation.relatedTo(original)) {
          // console.log('Transformation#verifyOperation - TRUE', this.target.id, operation);
          return true;
        }
      }
      // console.log('Transformation#verifyOperation - FALSE', this.target.id, operation);
      return false;
    },

    pushOperation: function(operation) {
      var _this = this;

      if (objects.isArray(operation)) {
        if (_this.originalOperations.length === 0) {
          operation.forEach(function(o) {
            _this.originalOperations.push(o);
          });
        }

        return operation.map(function(o) {
          return _this.pushOperation(o);
        });

      } else {
        assert.assert('operation must be an `Operation`', operation instanceof Operation['default']);

        // console.log('Transformation#push - queued', _this.target.id, operation);

        if (_this.originalOperations.length === 0) {
          _this.originalOperations.push(operation);
        }

        if (_this.currentOperation && operation.relatedTo(_this.currentOperation)) {
          // console.log('!!! Transformation spawned from current op');

          return _this._transform(operation);

        } else {
          return this.queue.push({
            id: operation.id,
            data: operation,
            process: function() {
              _this.currentOperation = this.data;
              return _this._transform(this.data).then(function() {
                _this.currentOperation = null;
              });
            }
          });
        }
      }
    },

    pushCompletedOperation: function(operation, inverse) {
      assert.assert('completed operation must be an `Operation`', operation instanceof Operation['default']);

      if (this.originalOperations.length === 0) {
        this.originalOperations.push(operation);
      }

      this.inverseOperations = this.inverseOperations.concat(inverse);
      this.completedOperations.push([operation, inverse]);
    },

    process: function() {
      var _this = this;
      var processing = this.processing;

      // console.log('Transformation#process', _this.target.id, this.queue.content);

      if (!processing) {
        processing = this.processing = this.queue.process().then(function() {
          return _this._settle().then(function() {
            // console.log('Transformation#process settled', _this.target.id);
            // _this.emit('didProcess');
            return _this.inverseOperations;
          // }, function() {
            // _this.emit('didNotProcess');
          });
        });
      }

      return processing;
    },

    _transform: function(operation) {
      // console.log('Transformation#_transform', this.target.id, operation);
      var res = this.target._transform(operation);
      if (res) {
        var _this = this;
        return res.then(function(inverse) {
          // console.log('Transformation#_transform promise resolved - not yet settled', _this.target.id);
          return _this._settle();
        });

      } else {
        return this._settle();
      }
    },

    _settle: function() {
      var _this = this;

      var ops = this.completedOperations;

      // console.log('Transformation#_settle', this.target.id, ops);

      if (!ops || !ops.length) {
        return new Orbit['default'].Promise(function(resolve) {
          resolve();
        });
      }

      if (this.settlingTransforms) {
        return this.settlingTransforms;
      }

      return this.settlingTransforms = new Orbit['default'].Promise(function(resolve) {
        var settleEach = function() {
          if (ops.length === 0) {
            // console.log('Transformation#_settle complete', _this.target.id);
            _this.settlingTransforms = false;
            resolve();

          } else {
            var op = ops.shift();

            // console.log('settle#settleEach', _this.target.id, ops.length + 1, 'didTransform', op[0], op[1]);

            var response = _this.target.settle.call(_this.target, 'didTransform', op[0], op[1]);
            if (response) {
              return response.then(settleEach, settleEach);
            } else {
              settleEach();
            }
          }
        };

        settleEach();
      });
    }
  });

});
var Orbit = requireModule("orbit")["default"];

// Globalize loader properties for use by other Orbit packages
Orbit.__define__ = define;
Orbit.__requireModule__ = requireModule;

window.Orbit = Orbit;

})();
//# sourceMappingURL=orbit.map