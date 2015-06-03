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
	OC['default'].LinkNotInitializedException = exceptions.LinkNotInitializedException;
	OC['default'].ModelNotRegisteredException = exceptions.ModelNotRegisteredException;
	OC['default'].LinkNotRegisteredException = exceptions.LinkNotRegisteredException;
	OC['default'].RecordAlreadyExistsException = exceptions.RecordAlreadyExistsException;

	exports['default'] = OC['default'];

});
define('orbit-common/cache', ['exports', 'orbit-common/main', 'orbit/document', 'orbit/evented', 'orbit/operation', 'orbit/lib/objects', 'orbit-common/lib/exceptions', 'orbit/lib/eq', 'orbit/lib/deprecate', 'orbit-common/operation-encoder', 'orbit-common/operation-processors/related-inverse-links'], function (exports, OC, Document, Evented, Operation, objects, exceptions, eq, deprecate, OperationEncoder, RelatedInverseLinksProcessor) {

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
      this._operationEncoder = new OperationEncoder['default'](schema);
      for (var model in schema.models) {
        if (schema.models.hasOwnProperty(model)) {
          this._registerModel(model);
        }
      }

      this._relatedInverseLinksProcessor = new RelatedInverseLinksProcessor['default'](schema, this);

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
     * Determines if a link has been initialized
     *
     * @param  {String} type Model Type.
     * @param  {String} id   Model ID.
     * @param  {String} link Link Key.
     * @return {Boolean}
     */
    isLinkInitialized: function(type, id, link){
      var linkPath = [type, id, '__rel', link].join("/");
      var currentLinkValue = this.retrieve(linkPath);
      return currentLinkValue !== OC['default'].LINK_NOT_INITIALIZED;
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

    _dependentOps: function(operation) {
      var operationType = this._operationEncoder.identify(operation);
      var operations = [];
      if (operationType === 'removeRecord') {
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

    _addRevLinks: function(path, value, operation) {
      // console.log('_addRevLinks', path, value);
      if (value) {
        var type = path[0],
            id = path[1],
            operationType = this._operationEncoder.identify(operation);

        switch(operationType) {
          case 'addRecord': return this._addRecordRevLinks(type, value);
          case 'replaceRecord': return this._addRecordRevLinks(type, value);
          case 'addHasOne': return this._addLinkRevLink(type, id, path[3], value);
          case 'replaceHasOne': return this._addLinkRevLink(type, id, path[3], value);
          case 'addToHasMany': return this._addLinkRevLink(type, id, path[3], path[4]);
          case 'addHasMany': return this._addLinkRevLink(type, id, path[3], value);
          case 'replaceHasMany': return this._addLinkRevLink(type, id, path[3], value);
        }
      }
    },

    _addLinkRevLink: function(type, id, link, linkValue) {
      var linkSchema = this.schema.linkDefinition(type, link);
      this._addRevLink(linkSchema, type, id, link, linkValue);
    },

    _addRecordRevLinks: function(type, record) {
      var id = record.id;
      var linkValue;
      var linkSchema;
      var _this = this;

      if (record.__rel) {
        Object.keys(record.__rel).forEach(function(link) {
          linkSchema = _this.schema.linkDefinition(type, link);
          linkValue = record.__rel[link];

          if(linkValue !== OC['default'].LINK_NOT_INITIALIZED) {
            if (linkSchema.type === 'hasMany') {
              Object.keys(linkValue).forEach(function(relId) {
                _this._addRevLink(linkSchema, type, id, link, relId);
              });

            } else {
              _this._addRevLink(linkSchema, type, id, link, linkValue);
            }
          }

        });
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

      if (value && typeof value === 'string' && value !== OC['default'].LINK_NOT_INITIALIZED) {
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
        var type = path[0],
            id = path[1],
            operationType = this._operationEncoder.identify(parentOperation);

        switch(operationType) {
          case 'removeRecord': return this._removeRecordRevLinks(type, id, value, parentOperation);
          case 'replaceRecord': return this._removeRecordRevLinks(type, id, value, parentOperation);
          case 'removeHasOne': return this._removeLinkRevLink(type, id, path[3], path[4]);
          case 'replaceHasOne': return this._removeLinkRevLink(type, id, path[3], path[4]);
          case 'removeHasMany': return this._removeLinkRevLink(type, id, path[3], value);
          case 'replaceHasMany': return this._removeLinkRevLink(type, id, path[3], value);
          case 'removeFromHasMany': return this._removeLinkRevLink(type, id, path[3], path[4]);
        }
      }
    },

    _removeLinkRevLink: function(type, id, link, linkValue){
      var linkSchema = this.schema.linkDefinition(type, link);
      this._removeRevLink(linkSchema, type, id, link, linkValue);
    },

    _removeRecordRevLinks: function(type, id, value, parentOperation){
      // when a whole record is removed, remove any links that reference it
      if (this.maintainRevLinks) {
        var _this = this;
        var revLink = this._revLink(type, id);
        var operation;
        var linkSchema;
        var linkValue;

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
          linkSchema = _this.schema.linkDefinition(type, link);
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

    _relatedInverseLinkOps: function(operation){
      return this._relatedInverseLinksProcessor.process(operation, this._pathsToRemove);
    }
  });

  exports['default'] = Cache;

});
define('orbit-common/lib/exceptions', ['exports', 'orbit/lib/exceptions'], function (exports, exceptions) {

  'use strict';

  var OperationNotAllowed = exceptions.Exception.extend({
    name: 'OC.OperationNotAllowed',
    init: function(message, operation){
      this.operation = operation;
      this._super(message);
    }
  });

  var ModelNotRegisteredException = exceptions.Exception.extend({
    name: 'OC.ModelNotRegisteredException',
    init: function(model) {
      this.model = model;
      this._super('model "' + model + '" not found');
    },
  });

  var LinkNotRegisteredException = exceptions.Exception.extend({
    name: 'OC.LinkNotRegisteredException',
    init: function(model, link) {
      this.model = model;
      this.link = link;
      this._super('link "' + model + "#" + link + '" not registered');
    },
  });


  var _RecordException = exceptions.Exception.extend({
    init: function(type, record, key) {
      this.type = type;
      this.record = record;
      var message = type + '/' + record;

      if (key) {
        this.key = key;
        message += '/' + key;
      }
      this._super(message);
    },
  });

  /**
   Exception thrown when a record can not be found.

   @class RecordNotFoundException
   @namespace OC
   @param {String} type
   @param {Object} record
   @constructor
   */
  var RecordNotFoundException = _RecordException.extend({
    name: 'OC.RecordNotFoundException',
  });

  /**
   Exception thrown when accessing a link that hasn't been loaded yet.

   @class LinkNotFoundException
   @namespace OC
   @param {String} type
   @param {String} link
   @constructor
   */
  var LinkNotInitializedException = exceptions.Exception.extend({
    name: 'OC.LinkNotInitializedException',
    init: function(type, id, link){
      this.type = type;
      this.link = link;
      this._super('link "' + [type, id, link].join("/") + '" not loaded');
    }
  });

  /**
   Exception thrown when a record already exists.

   @class RecordAlreadyExistsException
   @namespace OC
   @param {String} type
   @param {Object} record
   @constructor
   */
  var RecordAlreadyExistsException = _RecordException.extend({
    name: 'OC.RecordAlreadyExistsException',
  });

  exports.OperationNotAllowed = OperationNotAllowed;
  exports.RecordNotFoundException = RecordNotFoundException;
  exports.LinkNotInitializedException = LinkNotInitializedException;
  exports.RecordAlreadyExistsException = RecordAlreadyExistsException;
  exports.ModelNotRegisteredException = ModelNotRegisteredException;
  exports.LinkNotRegisteredException = LinkNotRegisteredException;

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

	OC.LINK_NOT_INITIALIZED = "___link_not_initialized___";

	exports['default'] = OC;

});
define('orbit-common/memory-source', ['exports', 'orbit/main', 'orbit-common/main', 'orbit/lib/assert', 'orbit/lib/objects', 'orbit-common/source', 'orbit-common/lib/exceptions'], function (exports, Orbit, OC, assert, objects, Source, exceptions) {

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

            res = _this.retrieve([type, resId]);

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
          else if (options.include) {
            _this._fetchRecords(type, id, options);
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

    _fetchRecords: function(type, ids, options) {
      var records = [];

      for (var i = 0, l = ids.length; i < l; i++) {
        var record = this._fetchRecord(type, ids[i], options);
        records.push(record);
      }

      return records;
    },

    _fetchRecord: function(type, id, options) {
      var _this = this;
      var record = this.retrieve([type, id]);
      if (!record) throw new exceptions.RecordNotFoundException(type, id);

      var include = this._parseInclude(options.include);

      if (include) {
        Object.keys(include).forEach(function(link) {
          _this._fetchLinked(type, id, link, objects.merge(options, {include: include[link]}));
        });
      }

      return record;
    },

    _fetchLinked: function(type, id, link, options) {
      var linkType = this.schema.models[type].links[link].model;
      var linkValue = this.retrieveLink(type, id, link);

      if (linkValue === OC['default'].LINK_NOT_INITIALIZED) throw new exceptions.LinkNotInitializedException(type, id, link);
      if (!linkValue) return null;

      return objects.isArray(linkValue)
             ? this._fetchRecords(linkType, linkValue, options)
             : this._fetchRecord(linkType, linkValue, options);
    },

    _parseInclude: function(include) {
      if (!include) return undefined;
      if (objects.isObject(include) && !objects.isArray(include)) return include;
      if (!objects.isArray(include)) include = [include];

      var parsed = {};

      include.forEach(function(inclusion) {
        var current = parsed;
        inclusion.split(".").forEach(function(link) {
          current[link] = current[link] || {};
          current = current[link];
        });
      });

      return parsed;
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

            if(relId === OC['default'].LINK_NOT_INITIALIZED) {
              reject(new exceptions.LinkNotInitializedException(type, id, link));
            }

            if (relId) {
              var linkDef = _this.schema.linkDefinition(type, link);
              if (linkDef.type === 'hasMany') {
                relId = Object.keys(relId);
              }
            }
          }

          resolve(relId);

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
define('orbit-common/operation-encoder', ['exports', 'orbit-common/main', 'orbit/lib/objects', 'orbit-common/lib/exceptions', 'orbit/operation'], function (exports, OC, objects, exceptions, Operation) {

  'use strict';

  exports['default'] = objects.Class.extend({
    init: function(schema){
      this._schema = schema;
    },

    identify: function(operation){
      var op = operation.op;
      var path = operation.path;
      var value = operation.value;

      if(['add', 'replace', 'remove'].indexOf(op) === -1) throw new exceptions.OperationNotAllowed("Op must be add, replace or remove (was " + op + ")", operation);

      if(path.length < 2) throw new exceptions.OperationNotAllowed("Path must have at least 2 segments");
      if(path.length === 2) return op + "Record";
      if(path.length === 3) return op + "Attribute";

      if(path[2] === '__rel'){
        var linkType = this._schema.linkDefinition(path[0], path[3]).type;

        if(linkType === 'hasMany'){
          if(path.length === 4){
            if(objects.isObject(value) || value === OC['default'].LINK_NOT_INITIALIZED && ['add', 'replace'].indexOf(op) !== -1) return op + 'HasMany';
            if(op === 'remove') return 'removeHasMany';
          }
          else if(path.length === 5){
            if(op === 'add') return 'addToHasMany';
            if(op === 'remove') return 'removeFromHasMany';
          }
        }
        else if (linkType === 'hasOne'){
          return op + 'HasOne';
        }
        else {
          throw new exceptions.OperationNotAllowed("Only hasMany and hasOne links area supported (was " + linkType + ")", operation);
        }
      }

      throw new exceptions.OperationNotAllowed("Invalid operation " + operation.op + ":" + operation.path.join("/") + ":" + operation.value);
    },

    describe: function(operation){
      var operationType = this.identify(operation);
      return operationType + "::" + operation.path.join("/") + "::" + JSON.stringify(operation.value);
    },

    addRecordOp: function(type, id, record){
      return new Operation['default']({op: 'add', path: [type, id], value: record});
    },

    replaceRecordOp: function(type, id, record){
      return new Operation['default']({op: 'replace', path: [type, id], value: record});
    },

    removeRecordOp: function(type, id){
      return new Operation['default']({op: 'remove', path: [type, id]});
    },

    replaceAttributeOp: function(type, id, attribute, value){
      var path = [type, id, attribute];
      return new Operation['default']({op: 'replace', path: path, value: value});
    },

    linkOp: function(op, type, id, key, value){
      return this[op + 'LinkOp'](type, id, key, value);
    },

    addLinkOp: function(type, id, key, value) {
      var linkType = this._schema.linkDefinition(type, key).type;
      var path = [type, id, '__rel', key];
      var op;

      if (linkType === 'hasMany') {
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

    replaceLinkOp: function(type, id, key, value) {
      var linkType = this._schema.linkDefinition(type, key).type;
      var path = [type, id, '__rel', key];

      if (linkType === 'hasMany' &&
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
    },

    removeLinkOp: function(type, id, key, value) {
      var linkType = this._schema.linkDefinition(type, key).type;
      var path = [type, id, '__rel', key];
      var op;

      if (linkType === 'hasMany') {
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
    }
  });

});
define('orbit-common/operation-processors/related-inverse-links', ['exports', 'orbit-common/main', 'orbit/lib/objects', 'orbit-common/operation-encoder'], function (exports, OC, objects, OperationEncoder) {

  'use strict';

  exports['default'] = objects.Class.extend({
    init: function(schema, cache){
      this._schema = schema;
      this._cache = cache;
      this._operationEncoder = new OperationEncoder['default'](schema);
    },

    process: function(operation, condemnedPaths) {
      var _this = this;
      condemnedPaths = condemnedPaths || [];
      var path = operation.path;
      var value = operation.value;
      var type = path[0];
      var schema = this._schema;
      var operationType = this._operationEncoder.identify(operation);

      function relatedLinkOps(linkValue, linkDef){
        linkDef = linkDef || schema.linkDefinition(type, path[3]);
        var op = operation.op;
        var ignoredPaths = op === 'remove' ? condemnedPaths : [];
        return _this._relatedLinkOps(linkDef, linkValue, path[1], operation, ignoredPaths);
      }

      function relatedHasManyOps(linkValue){
        if(linkValue === OC['default'].LINK_NOT_INITIALIZED) return [];
        return relatedLinkOps(Object.keys(linkValue));
      }

      function relatedHasOneOps(linkValue){
        if(linkValue === OC['default'].LINK_NOT_INITIALIZED) return [];
        return relatedLinkOps(linkValue);
      }

      function relatedLinksOpsForRecord(record){
        if (!record || !record.__rel) return [];
        var linkDef;
        var ops = [];

        Object.keys(record.__rel).forEach(function(link) {
          linkDef = schema.linkDefinition(type, link);
          var linkValue = record.__rel[link];

          if (linkDef.inverse && linkValue !== OC['default'].LINK_NOT_INITIALIZED) {
            var relIds = linkDef.type === 'hasMany' ? Object.keys(linkValue||{}) : linkValue;
            var linkOps = relatedLinkOps(relIds, linkDef);

            for(var i = 0; i < linkOps.length; i++){
              ops.push(linkOps[i]);
            }
          }
        });

        return ops;
      }

      switch (operationType) {
        case 'addHasOne': return relatedHasOneOps(value);
        case 'replaceHasOne': return relatedHasOneOps(value);
        case 'removeHasOne': return relatedHasOneOps(this._retrieve(path));

        case 'addHasMany': return relatedHasManyOps(operation.value);
        case 'replaceHasMany': return relatedHasManyOps(operation.value);
        case 'removeHasMany': return relatedHasManyOps(this._retrieve(path));
        case 'addToHasMany': return relatedHasOneOps(path[4]);
        case 'removeFromHasMany': return relatedHasOneOps(path[4]);

        case 'addRecord': return relatedLinksOpsForRecord(value);
        case 'removeRecord': return relatedLinksOpsForRecord(this._retrieve(path));

        default: return [];
      }
    },

    _relatedLinkOps: function(linkDef, linkValue, value, parentOperation, ignoredPaths){
      if(objects.isNone(linkValue)) return [];
      var relIds = objects.isArray(linkValue) ? linkValue : [linkValue];
      var linkOps = [];
      var linkOp;

      if (linkDef.inverse) {
        var relatedOp = this._relatedOp(parentOperation.op, linkDef);
        for(var i = 0; i < relIds.length; i++){
          linkOp = this._relatedLinkOp(linkDef.model, relIds[i], linkDef.inverse, value, parentOperation, relatedOp, ignoredPaths);
          if(linkOp) linkOps.push(linkOp);
        }
      }

      return linkOps;
    },

    _relatedOp: function(op, linkDef){
      var relatedLinkDef = this._schema.linkDefinition(linkDef.model, linkDef.inverse);
      if(relatedLinkDef.type === 'hasMany' && op === 'replace') return 'add';
      return op;
    },

    _relatedLinkOp: function(type, id, link, value, parentOperation, relatedOp, ignoredPaths){
      if (this._retrieve([type, id])) {

        if(!this._cache.isLinkInitialized(type, id, link)) return;

        var operation = this._operationEncoder.linkOp(relatedOp, type, id, link, value);
        var path = operation.path.join("/");
        var isIgnoredPath = ignoredPaths.indexOf(path) > -1;

        // Apply operation only if necessary
        if (this._retrieve(operation.path) !== operation.value && !isIgnoredPath) {
          return parentOperation.spawn(operation);
        }
      }
    },

    _retrieve: function(path){
      return this._cache.retrieve(path);
    }
  });

});
define('orbit-common/schema', ['exports', 'orbit/lib/objects', 'orbit/lib/uuid', 'orbit-common/lib/exceptions', 'orbit/evented', 'orbit-common/main'], function (exports, objects, uuid, exceptions, Evented, OC) {

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
    normalize: function(model, data, options) {
      options = options || {};
      if (data.__normalized) return data;

      var record = data;

      // set flag
      record.__normalized = true;

      // init forward links
      record.__rel = record.__rel || {};

      // init meta info
      record.__meta = record.__meta || {};

      this.initDefaults(model, record, options);

      return record;
    },

    modelDefinition: function(model) {
      var modelSchema = this.models[model];
      if (!modelSchema) {
        throw new exceptions.ModelNotRegisteredException(model);
      }
      return modelSchema;
    },

    initDefaults: function(model, record, options) {
      options = options || {};
      if (!record.__normalized) {
        throw new exceptions.OperationNotAllowed('Schema.initDefaults requires a normalized record');
      }

      var modelSchema = this.modelDefinition(model),
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
            if(options.initializeLinks !== false){
              record.__rel[link] = this._defaultValue(record,
                                                      links[link].defaultValue,
                                                      links[link].type === 'hasMany' ? {} : null);
            }
            else {
              record.__rel[link] = OC['default'].LINK_NOT_INITIALIZED;
            }
          }
        }
      }

      this._mapKeys(modelSchema, record);
    },

    primaryToSecondaryKey: function(model, secondaryKeyName, primaryKeyValue, autoGenerate) {
      var modelSchema = this.modelDefinition(model);
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
      var modelSchema = this.modelDefinition(model);
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
          var modelSchema = this.modelDefinition(type);

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

    linkDefinition: function(type, link){
      var model = this.modelDefinition(type);

      var linkProperties = model.links[link];
      if(!linkProperties) throw new exceptions.LinkNotRegisteredException(type, link);

      return linkProperties;
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
define('orbit-common/source', ['exports', 'orbit/main', 'orbit-common/main', 'orbit/document', 'orbit/transformable', 'orbit/requestable', 'orbit/lib/assert', 'orbit/lib/stubs', 'orbit/lib/objects', 'orbit-common/cache', 'orbit/operation', 'orbit-common/lib/exceptions', 'orbit-common/operation-encoder'], function (exports, Orbit, OC, Document, Transformable, Requestable, assert, stubs, objects, Cache, Operation, exceptions, OperationEncoder) {

  'use strict';

  var Source = objects.Class.extend({
    init: function(schema, options) {
      assert.assert("Source's `schema` must be specified", schema);

      this.schema = schema;

      options = options || {};

      // Create an internal cache and expose some elements of its interface
      this._cache = new Cache['default'](schema);
      objects.expose(this, this._cache, 'length', 'reset', 'retrieve', 'retrieveLink');

      this._operationEncoder = new OperationEncoder['default'](schema);

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
      var linkType = this.schema.linkDefinition(type, link).model;
      var linkValue = this.retrieveLink(type, modelId, link);

      if (linkValue === OC['default'].LINK_NOT_INITIALIZED) throw new exceptions.LinkNotInitializedException(type, id, link);
      if (!linkValue) return null;

      return this._find(linkType, linkValue, options);
    },

    _add: function(type, data) {
      data = data || {};

      var record = this.normalize(type, data);

      var id = this.getId(type, record),
          path = [type, id],
          _this = this;

      return this.transform(this._operationEncoder.addRecordOp(type, id, record)).then(function() {
        return _this.retrieve(path);
      });
    },

    _update: function(type, data) {
      var record = this.normalize(type, data);
      var id = this.getId(type, record);

      return this.transform(this._operationEncoder.replaceRecordOp(type, id, record));
    },

    _patch: function(type, id, attribute, value) {
      id = this._normalizeId(type, id);
      // todo - confirm this simplification is valid (i.e. don't attempt to deserialize attribute path)
      return this.transform(this._operationEncoder.replaceAttributeOp(type, id, attribute, value));
    },

    _remove: function(type, id) {
      id = this._normalizeId(type, id);
      return this.transform(this._operationEncoder.removeRecordOp(type, id));
    },

    _addLink: function(type, id, key, value) {
      id = this._normalizeId(type, id);
      value = this._normalizeLink(type, key, value);

      this._confirmLinkIsInitialized(type, id, key);

      return this.transform(this._operationEncoder.addLinkOp(type, id, key, value));
    },

    _removeLink: function(type, id, key, value) {
      id = this._normalizeId(type, id);
      value = this._normalizeLink(type, key, value);

      this._confirmLinkIsInitialized(type, id, key);

      return this.transform(this._operationEncoder.removeLinkOp(type, id, key, value));
    },

    _updateLink: function(type, id, key, value) {
      var linkDef = this.schema.models[type].links[key];

      assert.assert('hasMany links can only be replaced when flagged as `actsAsSet`',
             linkDef.type !== 'hasMany' || linkDef.actsAsSet);

      this._confirmLinkIsInitialized(type, id, key);

      id = this._normalizeId(type, id);
      value = this._normalizeLink(type, key, value);

      var op = this._operationEncoder.replaceLinkOp(type, id, key, value);
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
    },

    _confirmLinkIsInitialized: function(type, id, link){
      id = this.getId(type, id);
      var linkValue = this.retrieveLink(type, id, link);

      if(linkValue === OC['default'].LINK_NOT_INITIALIZED) throw new exceptions.LinkNotInitializedException(type, id, link);
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

});//# sourceMappingURL=orbit-common.amd.map