'use strict';

var _ = require('lodash');
/**
 * @class ExampleDataExtractor
 * @constructor
 */
var ExampleDataExtractor = function() {};

/**
 * Recursively build an object from a given schema component that is an example
 * representation of the object defined by the schema.
 *
 * @param {Object} component - valid subschema of the root/parent
 * @param {Object} root - parent schema used as the base
 * @returns {Object}
 */
ExampleDataExtractor.prototype.extract = function(component, root) {
  var reduced = {};

  if (!component) {
    throw new ReferenceError('No schema received to generate example data');
  }
  // If the schema defines an ID, change scope so all local references as resolved
  // relative to the schema with the closest ID
  if (component.id) {
    root = component;
  }

  // We don't (yet) correctly handle arrays alongside
  // combinatorics or object properties, so if we
  // have an array type, skip over the rest of it.
  if (component.type && component.type === "array" ) {
    var minItems = component.minItems || 1;
    var maxItems = component.maxItems || 1;
    reduced = [];
    _.range(_.random(minItems, maxItems)).forEach(function(i) {
      reduced.push( this.extract(component.items, root) );
    }.bind(this));
  } else {
    if (component.allOf) {
      // Recursively extend/overwrite the reduced value.
      _.reduce(component.allOf, function(accumulator, subschema) {
        return _.extend(accumulator, this.extract(subschema, root));
      }, reduced, this);
    } else if (component.oneOf) {
      // Select the first item to build an example object from
      reduced = this.extract(component.oneOf[0], root);
    } else if (component.anyOf) {
      // Select the first item to build an example object from
      reduced = this.extract(component.anyOf[0], root);
    } else if (component.rel === 'self') {
      // Special case where the component is referencing the context schema.
      // Used in the Hyper-Schema spec
      reduced = this.extract(root, root);
    }

    if (component.properties) {
      _.extend(reduced, this.mapPropertiesToExamples(component.properties, root));
    }
  }

  return reduced;
};

/**
 * Maps a `properties` definition to an object containing example values
 *
 * `{attribute1: {type: 'string', example: 'example value'}}` ->
 * `{attribute1: 'example value'}`
 *
 * @param {Object} props - Properties definition object
 * @param {Object} schema - Root schema containing the properties
 * @returns {*}
 */
ExampleDataExtractor.prototype.mapPropertiesToExamples = function(props, schema) {
  return _.transform(props, function(properties, propConfig, propName) {
    // Allow opt-ing out of generating example data
    if (_.startsWith(propName, '__') || propConfig.private) {
      return properties;
    }

    var example = this.getExampleDataFromItem(propConfig);

    if (propConfig.rel === 'self') {
      example = this.extract(schema, schema);
    } else if (propConfig.type === 'array' && propConfig.items && !example) {
      if (propConfig.items.example) {
        example = [propConfig.items.example];
      } else {
        example = [this.extract(propConfig.items, schema)];
      }
    } else if (propConfig.id && !example) {
      example = this.extract(propConfig, propConfig);
    } else {
      if (propConfig.oneOf || propConfig.anyOf) {
        example = this.extract(propConfig, schema);
      } else if (propConfig.allOf) {
        example = _.reduce(propConfig.allOf, function(accumulator, item) {
          return _.extend(accumulator, this.extract(item, schema));
        }, example || {}, this);
      }
      if (propConfig.properties) {
        _.extend(example, this.mapPropertiesToExamples(propConfig.properties, schema));
      }
    }
    // Special case for ID. This is done mostly because
    // the parser gets confused when declaring "id" as a property of an object,
    // because it wants to resolve it as reference to another schema.
    // The current solution is to declare ids as "ID" for the data object in the schema
    // See: http://json-schema.org/latest/json-schema-core.html#anchor27
    // Override with `preserveCase` in the options
    properties[propName === 'ID' ? propName.toLowerCase() : propName] = example;
  }, {}, this);
};

/**
 * @param {Object} reference
 * @returns {String}
 */
ExampleDataExtractor.prototype.getExampleDataFromItem = function(reference) {
  if (!_.isPlainObject(reference)) {
    return 'unknown';
  }
  return _.has(reference, 'example') ? reference.example : reference.default;
};

/**
 * @module lib/example-data-extractor
 * @type {ExampleDataExtractor}
 */
module.exports = new ExampleDataExtractor();
