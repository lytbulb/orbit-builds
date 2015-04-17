(function() {

// Share loader properties from globalized Orbit package
var define = window.Orbit.__define__;
var requireModule = window.Orbit.__requireModule__;

define('orbit-common', ['exports', 'orbit-common/main', 'orbit-common/cache', 'orbit-common/schema', 'orbit-common/serializer', 'orbit-common/source', 'orbit-common/memory-source', 'orbit-common/lib/exceptions'], function (exports, OC, Cache, Schema, Serializer, Source, MemorySource, exceptions) {

	'use strict';

	OC['default'].Cache = Cache['default'];
	OC['default'].Schema = Schema['default'];
	OC['default'].Serializer = Serializer['default'];
	OC['default'].Source = Source['default'];
	OC['default'].MemorySource = MemorySource['default'];
	// exceptions
	OC['default'].OperationNotAllowed = exceptions.OperationNotAllowed;
	OC['default'].RecordNotFoundException = exceptions.RecordNotFoundException;
	OC['default'].LinkNotFoundException = exceptions.LinkNotFoundException;
	OC['default'].RecordAlreadyExistsException = exceptions.RecordAlreadyExistsException;

	exports['default'] = OC['default'];

});
define('orbit-common/cache', ['exports', 'orbit/document', 'orbit/evented', 'orbit/operation', 'orbit/lib/objects', 'orbit-common/lib/exceptions', 'orbit/lib/eq', 'orbit/lib/deprecate'], function (exports, Document, Evented, Operation, objects, exceptions, eq, deprecate) {

  'use strict';

  var Cache = objects.Class.extend({
    init: function(schema, options) {
      options = options || {};

      if (options.trackRevLinks !== undefined && options.maintainRevLinks === undefined) {
        deprecate.deprecate('Please convert usage of the Cache option `trackRevLinks` to `maintainRevLinks`.');
        options.maintainRevLinks = options.trackRevLinks;
      }

      this.trackChanges = options.trackChanges !== undefined ? options.trackChanges : true;
      this.maintainRevLinks = options.maintainRevLinks !== undefined ? options.maintainRevLinks : true;
      this.maintainInverseLinks = options.maintainInverseLinks !== undefined ? options.maintainRevLinks : true;
      this.maintainDependencies = options.maintainDependencies !== undefined ? options.maintainDependencies : true;

      this._doc = new Document['default'](null, {arrayBasedPaths: true});

      if (this.maintainRevLinks) {
        this._rev = {};
      }

      this._pathsToRemove = [];

      Evented['default'].extend(this);

      this.schema = schema;
      for (var model in schema.models) {
        if (schema.models.hasOwnProperty(model)) {
          this._registerModel(model);
        }
      }

      // TODO - clean up listener
      this.schema.on('modelRegistered', this._registerModel, this);
    },

    _registerModel: function(model) {
      var modelRootPath = [model];
      if (!this.retrieve(modelRootPath)) {
        this._doc.add(modelRootPath, {});
      }
    },

    reset: function(data) {
      this._doc.reset(data);
      this.schema.registerAllKeys(data);
    },

    /**
     Return the size of data at a particular path

     @method length
     @param path
     @returns {Number}
     */
    length: function(path) {
      var data = this.retrieve(path);
      if (data === null || data === undefined) {
        return data;
      } else if (objects.isArray(data)) {
        return data.length;
      } else {
        return Object.keys(data).length;
      }
    },

    /**
     Return data at a particular path.

     Returns `null` if the path does not exist in the document.

     @method retrieve
     @param path
     @returns {Object}
     */
    retrieve: function(path) {
      try {
        // console.log('Cache#retrieve', path, this._doc.retrieve(path));
        return this._doc.retrieve(path);
      } catch(e) {
        return undefined;
      }
    },

    /**
     * Retrieves a link value.  Returns a null value for empty links.
     * For hasOne links will return a string id value of the link.
     * For hasMany links will return an array of id values.
     *
     * @param  {String} type Model Type.
     * @param  {String} id   Model ID.
     * @param  {String} link Link Key.
     * @return {Array|String|null}      The value of the link
     */
    retrieveLink: function(type, id, link) {
      var val = this.retrieve([type, id, '__rel', link]);
      if (val !== null && typeof val === 'object') {
        val = Object.keys(val);
      }
      return val;
    },


    /**
     Returns whether a path exists in the document.

     @method exists
     @param path
     @returns {Boolean}
     */
    exists: function(path) {
      try {
        this._doc.retrieve(path);
        return true;
      } catch(e) {
        return false;
      }
    },

    /**
     Transforms the document with an RFC 6902-compliant operation.

     Currently limited to `add`, `remove` and `replace` operations.

     Throws `PathNotFoundException` if the path does not exist in the document.

     @method transform
     @param {Object} operation
     @param {String} operation.op Must be "add", "remove", or "replace"
     @param {Array or String} operation.path Path to target location
     @param {Object} operation.value Value to set. Required for "add" and "replace"
     @returns {Boolean} true if operation is applied or false
     */
    transform: function(operation) {
      var normalizedOperation;
      if (operation instanceof Operation['default']) {
        normalizedOperation = operation;
      } else {
        normalizedOperation = new Operation['default'](operation);
      }

      var op = normalizedOperation.op;
      var path = normalizedOperation.path;
      var value = normalizedOperation.value;
      var currentValue = this.retrieve(path);
      var _this = this;
      var dependentOperations = [];
      var pushOps = function(ops) {
        if (ops) {
          if (ops.forEach) {
            ops.forEach(function(op) {
              if (op) dependentOperations.push(op);
            });
          } else {
            dependentOperations.push(op);
          }
        }
        return dependentOperations;
      };

      var performDependentOps = function() {
        dependentOperations.forEach(function(operation) {
          _this.transform(operation);
        });
        dependentOperations = [];
      };
      var inverse;

      // console.log('Cache#transform', op, path.join('/'), value);

      if (op !== 'add' && op !== 'remove' && op !== 'replace') {
        throw new exceptions.OperationNotAllowed('Cache#transform requires an "add", "remove" or "replace" operation.');
      }

      if (path.length < 2) {
        throw new exceptions.OperationNotAllowed('Cache#transform requires an operation with a path >= 2 segments.');
      }

      if (op === 'add' || op === 'replace') {
        if (!this.exists(path.slice(0, path.length - 1))) {
          return false;
        }

      } else if (op === 'remove') {
        if (this._isMarkedForRemoval(path)) {
          // console.log('remove op not required because marked for removal', path);
          return false;
        }
      }

      if (eq.eq(currentValue, value)) return false;

      if (this.maintainDependencies) {
        pushOps(this._dependentOps(normalizedOperation));
      }

      if (op === 'remove' || op === 'replace') {
        this._markForRemoval(path);

        if (this.maintainInverseLinks) {
          if (op === 'replace') {
            pushOps(this._relatedInverseLinkOps(normalizedOperation.spawn({
              op: 'remove',
              path: path
            })));
          }

          pushOps(this._relatedInverseLinkOps(normalizedOperation));
        }

        if (this.maintainRevLinks) {
          this._removeRevLinks(path, normalizedOperation);
        }
      }

      if (this.trackChanges) {
        inverse = this._doc.transform(normalizedOperation, true);
        this.emit('didTransform',
                  normalizedOperation,
                  inverse);

      } else {
        this._doc.transform(normalizedOperation, false);
      }

      performDependentOps();

      if (op === 'remove' || op === 'replace') {
        this._unmarkForRemoval(path);
      }

      if (op === 'add' || op === 'replace') {
        if (this.maintainRevLinks) {
          this._addRevLinks(path, value, normalizedOperation);
        }

        if (this.maintainInverseLinks) {
          if (op === 'replace') {
            pushOps(this._relatedInverseLinkOps(normalizedOperation.spawn({
              op: 'add',
              path: path,
              value: value
            })));

          } else {
            pushOps(this._relatedInverseLinkOps(normalizedOperation));
          }
        }
      }

      performDependentOps();

      return true;
    },

    _markForRemoval: function(path) {
      path = path.join('/');
      // console.log('_markForRemoval', path);
      this._pathsToRemove.push(path);
    },

    _unmarkForRemoval: function(path) {
      path = path.join('/');
      var i = this._pathsToRemove.indexOf(path);
      // console.log('_unmarkForRemoval', path, i);
      if (i > -1) this._pathsToRemove.splice(i, 1);
    },

    _isMarkedForRemoval: function(path) {
      path = path.join('/');
      // console.log('_isMarkedForRemoval', path);
      return (this._pathsToRemove.indexOf(path) > -1);
    },

    _isOperationRequired: function(operation) {
      if (operation.op === 'remove') {
        if (this._isMarkedForRemoval(operation.path)) {
          // console.log('remove op not required because marked for removal', operation.path);
          return false;
        }
      }

      var currentValue = this.retrieve(operation.path);
      var desiredValue = operation.value;

      // console.log('op required', !eq(currentValue, desiredValue), operation);

      return !eq.eq(currentValue, desiredValue);
    },

    _dependentOps: function(operation) {
      var operations = [];
      if (operation.op === 'remove' && operation.path.length === 2) {
        var _this = this,
          type = operation.path[0],
          id = operation.path[1],
          links = _this.schema.models[type].links;

        Object.keys(links).forEach(function(link) {
          var linkSchema = links[link];
          if (linkSchema.dependent !== 'remove') {
            return;
          }

          var linkValue = _this.retrieveLink(type, id, link);
          if (linkValue) {
            [].concat(linkValue).forEach(function(value) {
              var dependentPath = [linkSchema.model, value];
              if (_this.retrieve(dependentPath)) {
                operations.push(operation.spawn({
                  op: 'remove',
                  path: dependentPath
                }));
              }
            });
          }
        });

      }

      return operations;
    },

    _addRevLinks: function(path, value) {
      // console.log('_addRevLinks', path, value);

      if (value) {
        var _this = this,
            type = path[0],
            id = path[1],
            linkSchema,
            linkValue;

        if (path.length === 2) {
          // when a whole record is added, add inverse links for every link
          if (value.__rel) {
            Object.keys(value.__rel).forEach(function(link) {
              linkSchema = _this.schema.models[type].links[link];
              linkValue = value.__rel[link];

              if (linkSchema.type === 'hasMany') {
                Object.keys(linkValue).forEach(function(v) {
                  _this._addRevLink(linkSchema, type, id, link, v);
                });

              } else {
                _this._addRevLink(linkSchema, type, id, link, linkValue);
              }
            });
          }

        } else if (path.length > 3) {
          var link = path[3];

          linkSchema = _this.schema.models[type].links[link];

          if (path.length === 5) {
            linkValue = path[4];
          } else {
            linkValue = value;
          }

          this._addRevLink(linkSchema, type, id, link, linkValue);
        }
      }
    },

    _revLink: function(type, id) {
      var revForType = this._rev[type];
      if (revForType === undefined) {
        revForType = this._rev[type] = {};
      }
      var rev = revForType[id];
      if (rev === undefined) {
        rev = revForType[id] = {};
      }
      return rev;
    },

    _addRevLink: function(linkSchema, type, id, link, value) {
      // console.log('_addRevLink', linkSchema, type, id, link, value);

      if (value && typeof value === 'string') {
        var linkPath = [type, id, '__rel', link];
        if (linkSchema.type === 'hasMany') {
          linkPath.push(value);
        }
        linkPath = linkPath.join('/');

        var revLink = this._revLink(linkSchema.model, value);
        revLink[linkPath] = true;
      }
    },

    _removeRevLinks: function(path, parentOperation) {
      // console.log('_removeRevLinks', path);

      var value = this.retrieve(path);
      if (value) {
        var _this = this,
            type = path[0],
            id = path[1],
            linkSchema,
            linkValue;

        if (path.length === 2) {
          // when a whole record is removed, remove any links that reference it
          if (this.maintainRevLinks) {
            var revLink = this._revLink(type, id);
            var operation;

            Object.keys(revLink).forEach(function(path) {
              path = _this._doc.deserializePath(path);

              if (path.length === 4) {
                operation = parentOperation.spawn({
                  op: 'replace',
                  path: path,
                  value: null
                });
              } else {
                operation = parentOperation.spawn({
                  op: 'remove',
                  path: path
                });
              }

              _this.transform(operation);
            });

            delete this._rev[type][id];
          }

          // when a whole record is removed, remove references corresponding to each link
          if (value.__rel) {
            Object.keys(value.__rel).forEach(function(link) {
              linkSchema = _this.schema.models[type].links[link];
              linkValue = value.__rel[link];

              if (linkSchema.type === 'hasMany') {
                Object.keys(linkValue).forEach(function(v) {
                  _this._removeRevLink(linkSchema, type, id, link, v);
                });

              } else {
                _this._removeRevLink(linkSchema, type, id, link, linkValue);
              }
            });
          }

        } else if (path.length > 3) {
          var link = path[3];

          linkSchema = _this.schema.models[type].links[link];

          if (path.length === 5) {
            linkValue = path[4];
          } else {
            linkValue = value;
          }

          this._removeRevLink(linkSchema, type, id, link, linkValue);
        }
      }
    },

    _removeRevLink: function(linkSchema, type, id, link, value) {
      // console.log('_removeRevLink', linkSchema, type, id, link, value);

      if (value && typeof value === 'string') {
        var linkPath = [type, id, '__rel', link];
        if (linkSchema.type === 'hasMany') {
          linkPath.push(value);
        }
        linkPath = linkPath.join('/');

        var revLink = this._revLink(linkSchema.model, id);
        delete revLink[linkPath];
      }
    },

    _relatedInverseLinkOps: function(operation) {
      var _this = this;
      var op = operation.op;
      var path = operation.path;
      var value = operation.value;
      var type = path[0];
      var record;
      var key;
      var linkDef;
      var linkValue;
      var inverseLinkOp;
      var relId;
      var ops = [];

      if (op === 'add') {
        if (path.length > 3 && path[2] === '__rel') {

          key = path[3];
          linkDef = this.schema.models[type].links[key];

          if (linkDef.inverse) {
            if (path.length > 4) {
              relId = path[4];
            } else {
              relId = value;
            }

            if (objects.isObject(relId)) {
              Object.keys(relId).forEach(function(id) {
                ops.push(_this._relatedAddLinkOp(
                  linkDef.model,
                  id,
                  linkDef.inverse,
                  path[1],
                  operation
                ));
              });

            } else {
              ops.push(_this._relatedAddLinkOp(
                linkDef.model,
                relId,
                linkDef.inverse,
                path[1],
                operation
              ));
            }
          }

        } else if (path.length === 2) {

          record = operation.value;
          if (record.__rel) {
            Object.keys(record.__rel).forEach(function(key) {
              linkDef = _this.schema.models[type].links[key];

              if (linkDef.inverse) {
                if (linkDef.type === 'hasMany') {
                  Object.keys(record.__rel[key]).forEach(function(id) {
                    ops.push(_this._relatedAddLinkOp(
                      linkDef.model,
                      id,
                      linkDef.inverse,
                      path[1],
                      operation
                    ));
                  });

                } else {
                  var id = record.__rel[key];

                  if (!objects.isNone(id)) {
                    ops.push(_this._relatedAddLinkOp(
                      linkDef.model,
                      id,
                      linkDef.inverse,
                      path[1],
                      operation
                    ));
                  }
                }
              }
            });
          }
        }

      } else if (op === 'remove') {

        if (path.length > 3 && path[2] === '__rel') {

          key = path[3];
          linkDef = this.schema.models[type].links[key];

          if (linkDef.inverse) {
            if (path.length > 4) {
              relId = path[4];
            } else {
              relId = this.retrieve(path);
            }

            if (relId) {
              if (objects.isObject(relId)) {
                Object.keys(relId).forEach(function(id) {
                  ops.push(_this._relatedRemoveLinkOp(
                    linkDef.model,
                    id,
                    linkDef.inverse,
                    path[1],
                    operation
                  ));
                });

              } else {
                ops.push(_this._relatedRemoveLinkOp(
                  linkDef.model,
                  relId,
                  linkDef.inverse,
                  path[1],
                  operation
                ));
              }
            }
          }

        } else if (path.length === 2) {

          record = this.retrieve(path);
          if (record.__rel) {
            Object.keys(record.__rel).forEach(function(key) {
              linkDef = _this.schema.models[type].links[key];

              if (linkDef.inverse) {
                if (linkDef.type === 'hasMany') {
                  Object.keys(record.__rel[key]).forEach(function(id) {
                    ops.push(_this._relatedRemoveLinkOp(
                      linkDef.model,
                      id,
                      linkDef.inverse,
                      path[1],
                      operation
                    ));
                  });

                } else {
                  var id = record.__rel[key];

                  if (!objects.isNone(id)) {
                    ops.push(_this._relatedRemoveLinkOp(
                      linkDef.model,
                      id,
                      linkDef.inverse,
                      path[1],
                      operation
                    ));
                  }
                }
              }
            });
          }
        }
      }
      return ops;
    },

    _relatedAddLinkOp: function(type, id, key, value, parentOperation) {
      // console.log('_relatedAddLinkOp', type, id, key, value);

      if (this.retrieve([type, id])) {
        var op = this._addLinkOp(type, id, key, value);

        // Apply operation only if necessary
        if (this.retrieve(op.path) !== op.value) {
          return parentOperation.spawn(op);
        }
      }
    },

    _relatedRemoveLinkOp: function(type, id, key, value, parentOperation) {
      // console.log('_relatedRemoveLinkOp', type, id, key, value);

      var op = this._removeLinkOp(type, id, key, value);

      // Apply operation only if necessary
      if (this.retrieve(op.path) && !this._isMarkedForRemoval(op.path)) {
        return parentOperation.spawn(op);
      }
    },

    _addLinkOp: function(type, id, key, value) {
      var linkDef = this.schema.models[type].links[key];
      var path = [type, id, '__rel', key];
      var op;

      if (linkDef.type === 'hasMany') {
        path.push(value);
        value = true;
        op = 'add';
      } else {
        op = 'replace';
      }

      return new Operation['default']({
        op: op,
        path: path,
        value: value
      });
    },

    _removeLinkOp: function(type, id, key, value) {
      var linkDef = this.schema.models[type].links[key];
      var path = [type, id, '__rel', key];
      var op;

      if (linkDef.type === 'hasMany') {
        path.push(value);
        op = 'remove';
      } else {
        op = 'replace';
        value = null;
      }

      return new Operation['default']({
        op: op,
        path: path,
        value: value
      });
    },

    _updateLinkOp: function(type, id, key, value) {
      var linkDef = this.schema.models[type].links[key];
      var path = [type, id, '__rel', key];

      if (linkDef.type === 'hasMany' &&
          objects.isArray(value)) {
        var obj = {};
        for (var i = 0, l = value.length; i < l; i++) {
          obj[value[i]] = true;
        }
        value = obj;
      }

      return new Operation['default']({
        op: 'replace',
        path: path,
        value: value
      });
    }
  });

  exports['default'] = Cache;

});
define('orbit-common/lib/exceptions', ['exports'], function (exports) {

  'use strict';

  /**
   @module orbit-common
   */

  /**
   Exception thrown when an operation is not allowed.

   @class OperationNotAllowed
   @namespace OC
   @param {Object} description
   @constructor
   */
  var OperationNotAllowed = function(description) {
    this.description = description;
  };

  OperationNotAllowed.prototype = {
    constructor: OperationNotAllowed
  };

  /**
   Exception thrown when a record can not be found.

   @class RecordNotFoundException
   @namespace OC
   @param {String} type
   @param {Object} record
   @constructor
   */
  var RecordNotFoundException = function(type, record) {
    this.type = type;
    this.record = record;
  };

  RecordNotFoundException.prototype = {
    constructor: RecordNotFoundException
  };

  /**
   Exception thrown when a record can not be found.

   @class LinkNotFoundException
   @namespace OC
   @param {String} type
   @param {Object} record
   @constructor
   */
  var LinkNotFoundException = function(type, record, key) {
    this.type = type;
    this.record = record;
    this.key = key;
  };

  LinkNotFoundException.prototype = {
    constructor: LinkNotFoundException
  };

  /**
   Exception thrown when a record already exists.

   @class RecordAlreadyExistsException
   @namespace OC
   @param {String} type
   @param {Object} record
   @constructor
   */
  var RecordAlreadyExistsException = function(type, record) {
    this.type = type;
    this.record = record;
  };

  RecordAlreadyExistsException.prototype = {
    constructor: RecordAlreadyExistsException
  };

  exports.OperationNotAllowed = OperationNotAllowed;
  exports.RecordNotFoundException = RecordNotFoundException;
  exports.LinkNotFoundException = LinkNotFoundException;
  exports.RecordAlreadyExistsException = RecordAlreadyExistsException;

});
define('orbit-common/main', ['exports'], function (exports) {

	'use strict';

	/**
	 The Orbit Common library (namespaced `OC` by default) defines a common set of
	 compatible sources.

	 The Common library contains a base abstract class, `Source`, which supports
	 both `Transformable` and `Requestable` interfaces. The method signatures on
	 `Source` should be supported by other sources that want to be fully compatible
	 with the Common library.

	 @module orbit-common
	 @main orbit-common
	 */

	/**
	 Namespace for Orbit Common methods and classes.

	 @class OC
	 @static
	 */
	var OC = {};

	exports['default'] = OC;

});
define('orbit-common/memory-source', ['exports', 'orbit/main', 'orbit/lib/assert', 'orbit/lib/objects', 'orbit-common/source', 'orbit-common/lib/exceptions'], function (exports, Orbit, assert, objects, Source, exceptions) {

  'use strict';

  var MemorySource = Source['default'].extend({
    init: function(schema, options) {
      assert.assert('MemorySource requires Orbit.Promise to be defined', Orbit['default'].Promise);
      this._super.apply(this, arguments);
    },

    /////////////////////////////////////////////////////////////////////////////
    // Transformable interface implementation
    /////////////////////////////////////////////////////////////////////////////

    _transform: function(operation) {
      // Transform the cache
      // Note: the cache's didTransform event will trigger this source's
      // didTransform event.
      this._cache.transform(operation);
    },

    /////////////////////////////////////////////////////////////////////////////
    // Requestable interface implementation
    /////////////////////////////////////////////////////////////////////////////

    _find: function(type, id, options) {
      var _this = this,
          modelSchema = this.schema.models[type],
          pk = modelSchema.primaryKey.name,
          result;

      options = options || {};

      return new Orbit['default'].Promise(function(resolve, reject) {
        if (objects.isNone(id)) {
          result = _this._filter.call(_this, type);

        } else if (objects.isArray(id)) {
          var res,
              resId,
              notFound;

          result = [];
          notFound = [];

          for (var i = 0, l = id.length; i < l; i++) {
            resId = id[i];

            res = _this._fetchRecord(type, resId, options);

            if (res) {
              result.push(res);
            } else {
              notFound.push(resId);
            }
          }

          if (notFound.length > 0) {
            result = null;
            id = notFound;
          }

        } else if (id !== null && typeof id === 'object') {
          if (id[pk]) {
            result = _this._fetchRecord(type, id[pk], options);

          } else {
            result = _this._filter.call(_this, type, id);
          }

        } else {
          result = _this._fetchRecord(type, id, options);
        }

        if (result) {
          resolve(result);
        } else {
          reject(new exceptions.RecordNotFoundException(type, id));
        }
      });
    },

    _fetchRecord: function(type, id, options) {
      var _this = this;
      var record = this.retrieve([type, id]);
      var include = this._parseInclude(options.include);

      if(include) {
        Object.keys(include).forEach(function(link){
          _this._fetchLinked(type, id, link, options.merge({include: include[link]}));
        });
      }

      return record;
    },

    _parseInclude: function(include) {
      if (!include) return undefined;
      if (!objects.isArray(include)) return include;

      var parsed = {};

      include.forEach(function(inclusion){
        var current = parsed;
        inclusion.split(".").forEach(function(link){
          current[link] = current[link] || {};
          current = current[link];
        });
      });

      return parsed;
    },

    _fetchLinked: function(type, id, link, options) {
      var linkType = this.schema.models[type].links[link].model;
      var linkValue = this.retrieveLink(type, id, link);

      return this.find(linkType, linkValue, options);
    },

    _findLink: function(type, id, link) {
      var _this = this;

      return new Orbit['default'].Promise(function(resolve, reject) {
        id = _this.getId(type, id);

        var record = _this.retrieve([type, id]);

        if (record) {
          var relId;

          if (record.__rel) {
            relId = record.__rel[link];

            if (relId) {
              var linkDef = _this.schema.models[type].links[link];
              if (linkDef.type === 'hasMany') {
                relId = Object.keys(relId);
              }
            }
          }

          if (relId) {
            resolve(relId);

          } else {
            reject(new exceptions.LinkNotFoundException(type, id, link));
          }

        } else {
          reject(new exceptions.RecordNotFoundException(type, id));
        }
      });
    },

    /////////////////////////////////////////////////////////////////////////////
    // Internals
    /////////////////////////////////////////////////////////////////////////////

    _filter: function(type, query) {
      var all = [],
          dataForType,
          i,
          prop,
          match,
          record;

      dataForType = this.retrieve([type]);

      for (i in dataForType) {
        if (dataForType.hasOwnProperty(i)) {
          record = dataForType[i];
          if (query === undefined) {
            match = true;
          } else {
            match = false;
            for (prop in query) {
              if (record[prop] === query[prop]) {
                match = true;
              } else {
                match = false;
                break;
              }
            }
          }
          if (match) all.push(record);
        }
      }
      return all;
    },

    _filterOne: function(type, prop, value) {
      var dataForType,
          i,
          record;

      dataForType = this.retrieve([type]);

      for (i in dataForType) {
        if (dataForType.hasOwnProperty(i)) {
          record = dataForType[i];
          if (record[prop] === value) {
            return record;
          }
        }
      }
    }
  });

  exports['default'] = MemorySource;

});
define('orbit-common/schema', ['exports', 'orbit/lib/objects', 'orbit/lib/uuid', 'orbit-common/lib/exceptions', 'orbit/evented'], function (exports, objects, uuid, exceptions, Evented) {

  'use strict';

  var Schema = objects.Class.extend({
    init: function(options) {
      options = options || {};
      // model defaults
      if (options.modelDefaults) {
        this.modelDefaults = options.modelDefaults;
      } else {
        this.modelDefaults = {
          keys: {
            'id': {primaryKey: true, defaultValue: uuid.uuid}
          }
        };
      }
      // inflection
      if (options.pluralize) {
        this.pluralize = options.pluralize;
      }
      if (options.singularize) {
        this.singularize = options.singularize;
      }

      Evented['default'].extend(this);

      // register provided model schema
      this.models = {};
      if (options.models) {
        for (var model in options.models) {
          if (options.models.hasOwnProperty(model)) {
            this.registerModel(model, options.models[model]);
          }
        }
      }
    },

    /**
     Registers a model's schema definition.

     Emits the `modelRegistered` event upon completion.

     @param {String} model      name of the model
     @param {Object} definition model schema definition
     */
    registerModel: function(model, definition) {
      var modelSchema = this._mergeModelSchemas({}, this.modelDefaults, definition);

      // process key definitions
      for (var name in modelSchema.keys) {
        var key = modelSchema.keys[name];

        key.name = name;

        if (key.primaryKey) {
          if (modelSchema.primaryKey) {
            throw new exceptions.OperationNotAllowed('Schema can only define one primaryKey per model');
          }
          modelSchema.primaryKey = key;

        } else {
          key.primaryKey = false;

          key.secondaryToPrimaryKeyMap = {};
          key.primaryToSecondaryKeyMap = {};

          modelSchema.secondaryKeys = modelSchema.secondaryKeys || {};
          modelSchema.secondaryKeys[name] = key;
        }

        key.type = key.type || 'string';
        if (key.type !== 'string') {
          throw new exceptions.OperationNotAllowed('Model keys must be of type `"string"`');
        }
      }

      // ensure every model has a valid primary key
      if (!modelSchema.primaryKey || typeof modelSchema.primaryKey.defaultValue !== 'function') {
        throw new exceptions.OperationNotAllowed('Model schema ID defaultValue must be a function');
      }

      this.models[model] = modelSchema;

      this.emit('modelRegistered', model);
    },

    /**
     Normalizes a record according to its type and corresponding schema
     definition.

     A record's primary key, links, and meta data will all be initialized.

     A record can only be normalized once. A flag is set on the record
     (`__normalized`) to prevent "re-normalization".

     @param  {String} model   record type
     @param  {Object} data    record data
     @return {Object} normalized version of `data`
     */
    normalize: function(model, data) {
      if (data.__normalized) return data;

      var record = data;

      // set flag
      record.__normalized = true;

      // init forward links
      record.__rel = record.__rel || {};

      // init meta info
      record.__meta = record.__meta || {};

      this.initDefaults(model, record);

      return record;
    },

    initDefaults: function(model, record) {
      if (!record.__normalized) {
        throw new exceptions.OperationNotAllowed('Schema.initDefaults requires a normalized record');
      }

      var modelSchema = this.models[model],
          keys = modelSchema.keys,
          attributes = modelSchema.attributes,
          links = modelSchema.links;

      // init primary key - potentially setting the primary key from secondary keys if necessary
      this._initPrimaryKey(modelSchema, record);

      // init default key values
      for (var key in keys) {
        if (record[key] === undefined) {
          record[key] = this._defaultValue(record, keys[key].defaultValue, null);
        }
      }

      // init default attribute values
      if (attributes) {
        for (var attribute in attributes) {
          if (record[attribute] === undefined) {
            record[attribute] = this._defaultValue(record, attributes[attribute].defaultValue, null);
          }
        }
      }

      // init default link values
      if (links) {
        for (var link in links) {
          if (record.__rel[link] === undefined) {
            record.__rel[link] = this._defaultValue(record,
                                                    links[link].defaultValue,
                                                    links[link].type === 'hasMany' ? {} : null);
          }
        }
      }

      this._mapKeys(modelSchema, record);
    },

    primaryToSecondaryKey: function(model, secondaryKeyName, primaryKeyValue, autoGenerate) {
      var modelSchema = this.models[model];
      var secondaryKey = modelSchema.keys[secondaryKeyName];

      var value = secondaryKey.primaryToSecondaryKeyMap[primaryKeyValue];

      // auto-generate secondary key if necessary, requested, and possible
      if (value === undefined && autoGenerate && secondaryKey.defaultValue) {
        value = secondaryKey.defaultValue();
        this._registerKeyMapping(secondaryKey, primaryKeyValue, value);
      }

      return value;
    },

    secondaryToPrimaryKey: function(model, secondaryKeyName, secondaryKeyValue, autoGenerate) {
      var modelSchema = this.models[model];
      var secondaryKey = modelSchema.keys[secondaryKeyName];

      var value = secondaryKey.secondaryToPrimaryKeyMap[secondaryKeyValue];

      // auto-generate primary key if necessary, requested, and possible
      if (value === undefined && autoGenerate && modelSchema.primaryKey.defaultValue) {
        value = modelSchema.primaryKey.defaultValue();
        this._registerKeyMapping(secondaryKey, value, secondaryKeyValue);
      }

      return value;
    },

    /**
     Given a data object structured according to this schema, register all of its
     primary and secondary key mappings. This data object may contain any number
     of records and types.

     @param {Object} data - data structured according to this schema
     */
    registerAllKeys: function(data) {
      if (data) {
        Object.keys(data).forEach(function(type) {
          var modelSchema = this.models[type];

          if (modelSchema && modelSchema.secondaryKeys) {
            var records = data[type];

            Object.keys(records).forEach(function(id) {
              var record = records[id];
              var altId;

              Object.keys(modelSchema.secondaryKeys).forEach(function(secondaryKey) {
                altId = record[secondaryKey];
                if (altId !== undefined && altId !== null) {
                  var secondaryKeyDef = modelSchema.secondaryKeys[secondaryKey];
                  this._registerKeyMapping(secondaryKeyDef, id, altId);
                }
              }, this);
            }, this);
          }
        }, this);
      }
    },

    /**
     A naive pluralization method.

     Override with a more robust general purpose inflector or provide an
     inflector tailored to the vocabularly of your application.

     @param  {String} word
     @return {String} plural form of `word`
     */
    pluralize: function(word) {
      return word + 's';
    },

    /**
     A naive singularization method.

     Override with a more robust general purpose inflector or provide an
     inflector tailored to the vocabularly of your application.

     @param  {String} word
     @return {String} singular form of `word`
     */
    singularize: function(word) {
      if (word.lastIndexOf('s') === word.length - 1) {
        return word.substr(0, word.length - 1);
      } else {
        return word;
      }
    },

    _defaultValue: function(record, value, defaultValue) {
      if (value === undefined) {
        return defaultValue;

      } else if (typeof value === 'function') {
        return value.call(record);

      } else {
        return value;
      }
    },

    _initPrimaryKey: function(modelSchema, record) {
      var pk = modelSchema.primaryKey.name;
      var id = record[pk];

      // init primary key from secondary keys
      if (!id && modelSchema.secondaryKeys) {
        var keyNames = Object.keys(modelSchema.secondaryKeys);
        for (var i=0, l = keyNames.length; i <l ; i++){
          var key = modelSchema.keys[keyNames[i]];
          var value = record[key.name];
          if (value) {
            id = key.secondaryToPrimaryKeyMap[value];
            if (id) {
              record[pk] = id;
              return;
            }
          }
        }
      }
    },

    _mapKeys: function(modelSchema, record) {
      var id = record[modelSchema.primaryKey.name];

      if (modelSchema.secondaryKeys) {
        Object.keys(modelSchema.secondaryKeys).forEach(function(name) {
          var value = record[name];
          if (value) {
            var key = modelSchema.secondaryKeys[name];
            this._registerKeyMapping(key, id, value);
          }
        }, this);
      }
    },

    _registerKeyMapping: function(secondaryKeyDef, primaryValue, secondaryValue) {
      secondaryKeyDef.primaryToSecondaryKeyMap[primaryValue] = secondaryValue;
      secondaryKeyDef.secondaryToPrimaryKeyMap[secondaryValue] = primaryValue;
    },

    _mergeModelSchemas: function(base) {
      var sources = Array.prototype.slice.call(arguments, 1);

      // ensure model schema has categories set
      base.keys = base.keys || {};
      base.attributes = base.attributes || {};
      base.links = base.links || {};

      sources.forEach(function(source) {
        source = objects.clone(source);
        this._mergeModelFields(base.keys, source.keys);
        this._mergeModelFields(base.attributes, source.attributes);
        this._mergeModelFields(base.links, source.links);
      }, this);

      return base;
    },

    _mergeModelFields: function(base, source) {
      if (source) {
        Object.keys(source).forEach(function(field) {
          if (source.hasOwnProperty(field)) {
            var fieldDef = source[field];
            if (fieldDef) {
              base[field] = fieldDef;
            } else {
              // fields defined as falsey should be removed
              delete base[field];
            }
          }
        });
      }
    }
  });

  exports['default'] = Schema;

});
define('orbit-common/serializer', ['exports', 'orbit/lib/objects', 'orbit/lib/stubs'], function (exports, objects, stubs) {

  'use strict';

  var Serializer = objects.Class.extend({
    init: function(schema) {
      this.schema = schema;
    },

    serialize: stubs.required,

    deserialize: stubs.required
  });

  exports['default'] = Serializer;

});
define('orbit-common/source', ['exports', 'orbit/main', 'orbit/document', 'orbit/transformable', 'orbit/requestable', 'orbit/lib/assert', 'orbit/lib/stubs', 'orbit/lib/objects', 'orbit-common/cache', 'orbit/operation'], function (exports, Orbit, Document, Transformable, Requestable, assert, stubs, objects, Cache, Operation) {

  'use strict';

  var Source = objects.Class.extend({
    init: function(schema, options) {
      assert.assert("Source's `schema` must be specified", schema);

      this.schema = schema;

      options = options || {};

      // Create an internal cache and expose some elements of its interface
      this._cache = new Cache['default'](schema);
      objects.expose(this, this._cache,
             'length', 'reset', 'retrieve', 'retrieveLink',
             '_addLinkOp', '_removeLinkOp', '_updateLinkOp');
      // TODO - clean up listener
      this._cache.on('didTransform', this._cacheDidTransform, this);

      Transformable['default'].extend(this);
      Requestable['default'].extend(this, ['find', 'add', 'update', 'patch', 'remove',
                                'findLink', 'addLink', 'removeLink', 'updateLink',
                                'findLinked']);

      Source.created(this);
    },

    /////////////////////////////////////////////////////////////////////////////
    // Transformable interface implementation
    /////////////////////////////////////////////////////////////////////////////

    /**
     Internal method that applies a single transform to this source.

     `_transform` must be implemented by a `Transformable` source.
     It is called by the public method `transform` in order to actually apply
     transforms.

     `_transform` should return a promise if the operation is asynchronous.

     @method _transform
     @param operation JSON PATCH operation as detailed in RFC 6902
     @private
     */
    _transform: stubs.required,

    /////////////////////////////////////////////////////////////////////////////
    // Requestable interface implementation
    /////////////////////////////////////////////////////////////////////////////

    _find: stubs.required,

    _findLink: stubs.required,

    _findLinked: function(type, id, link, options){
      var modelId = this.getId(type, id);
      var linkType = this.schema.models[type].links[link].model;
      var linkValue = this.retrieveLink(type, modelId, link);

      if(!linkValue) return;

      return this._find(linkType, linkValue, options);
    },

    _add: function(type, data) {
      data = data || {};

      var record = this.normalize(type, data);

      var id = this.getId(type, record),
          path = [type, id],
          _this = this;

      return this.transform({op: 'add', path: path, value: record}).then(function() {
        return _this.retrieve(path);
      });
    },

    _update: function(type, data) {
      var record = this.normalize(type, data);
      var id = this.getId(type, record);
      var path = [type, id];

      return this.transform({op: 'replace', path: path, value: record});
    },

    _patch: function(type, id, property, value) {
      id = this._normalizeId(type, id);
      var path = [type, id].concat(Document['default'].prototype.deserializePath(property));

      return this.transform({op: 'replace', path: path, value: value});
    },

    _remove: function(type, id) {
      id = this._normalizeId(type, id);
      var path = [type, id];

      return this.transform({op: 'remove', path: path});
    },

    _addLink: function(type, id, key, value) {
      id = this._normalizeId(type, id);
      value = this._normalizeLink(type, key, value);

      return this.transform(this._addLinkOp(type, id, key, value));
    },

    _removeLink: function(type, id, key, value) {
      id = this._normalizeId(type, id);
      value = this._normalizeLink(type, key, value);

      return this.transform(this._removeLinkOp(type, id, key, value));
    },

    _updateLink: function(type, id, key, value) {
      var linkDef = this.schema.models[type].links[key];

      assert.assert('hasMany links can only be replaced when flagged as `actsAsSet`',
             linkDef.type !== 'hasMany' || linkDef.actsAsSet);

      id = this._normalizeId(type, id);
      value = this._normalizeLink(type, key, value);

      var op = this._updateLinkOp(type, id, key, value);
      return this.transform(op);
    },

    /////////////////////////////////////////////////////////////////////////////
    // Event handlers
    /////////////////////////////////////////////////////////////////////////////

    _cacheDidTransform: function(operation, inverse) {
      this.didTransform(operation, inverse);
    },

    /////////////////////////////////////////////////////////////////////////////
    // Helpers
    /////////////////////////////////////////////////////////////////////////////

    _normalizeId: function(type, id) {
      if (objects.isObject(id)) {
        var record = this.normalize(type, id);
        id = this.getId(type, record);
      }
      return id;
    },

    _normalizeLink: function(type, key, value) {
      if (objects.isObject(value)) {
        var linkDef = this.schema.models[type].links[key];
        var relatedRecord;

        if (objects.isArray(value)) {
          for (var i = 0, l = value.length; i < l; i++) {
            if (objects.isObject(value[i])) {
              relatedRecord = this.normalize(linkDef.model, value[i]);
              value[i] = this.getId(linkDef.model, relatedRecord);
            }
          }

        } else {
          relatedRecord = this.normalize(linkDef.model, value);
          value = this.getId(linkDef.model, relatedRecord);
        }
      }
      return value;
    },

    normalize: function(type, data) {
      return this.schema.normalize(type, data);
    },

    initDefaults: function(type, record) {
      return this.schema.initDefaults(type, record);
    },

    getId: function(type, data) {
      if (objects.isObject(data)) {
        return data[this.schema.models[type].primaryKey.name];
      } else {
        return data;
      }
    },

    /////////////////////////////////////////////////////////////////////////////
    // Internals
    /////////////////////////////////////////////////////////////////////////////

    _isLinkEmpty: function(linkType, linkValue) {
      return (linkType === 'hasMany' && linkValue && linkValue.length === 0 ||
              linkType === 'hasOne' && objects.isNone(linkValue));
    }
  });

  /**
   * A place to track the creation of any Source, is called in the Source init
   * method.  The source might not be fully configured / setup by the time you
   * receive it, but we provide this hook for potential debugging tools to monitor
   * all sources.
   *
   * @namespace OC
   * @param {OC.Source} source The newly forged Source.
   */
  Source.created = function(/* source */) {};

  exports['default'] = Source;

});
window.OC = requireModule("orbit-common")["default"];

})();
//# sourceMappingURL=orbit-common.map