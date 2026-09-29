/*
 * Compatibility shim: Brian Wagon now lives in characters/brian.js (built on core/).  Node tools and old
 * scripts can still `require('./brian-wagon.js')`; pages load everything through manifest.js.
 */
module.exports = require('./characters/brian.js');
