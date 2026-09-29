/*
 * manifest.js — the ordered list of scripts that make up the rig.  A page loads this one file
 * (<script src="manifest.js"></script>); it writes the rest in order.  Node tools can require() it for the list.
 *
 * To add a character: create characters/<id>.js (see characters/_template.js) and add it below, before scene.js.
 */
(function (root) {
  'use strict';

  const RIG_SCRIPTS = [
    'vendor/brush.js',
    'brush-style.js',
    'core/rig-core.js',
    'core/stage.js',
    'core/registry.js',
    'characters/brian.js',
    'characters/bluemark.js',
    'core/scene.js',          // after the characters
  ];

  if (typeof document !== 'undefined' && document.write) {
    for (const s of RIG_SCRIPTS) document.write('<script src="' + s + '"><\/script>');
  }
  if (typeof module === 'object' && module.exports) module.exports = { RIG_SCRIPTS };
  root.RIG_SCRIPTS = RIG_SCRIPTS;
})(typeof globalThis !== 'undefined' ? globalThis : this);
