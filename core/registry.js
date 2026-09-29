/*
 * registry.js — the list of characters the host (Scene, preview page, tools) can build.
 *
 * A character file ends with `RigRegistry.register(TheClass)`, where TheClass has a static META (id, label,
 * layer, emotions, triggers, gestures, defaults, ...; see docs/adding-a-character.md).
 */
(function (root) {
  'use strict';

  const classes = new Map();
  const REQUIRED = ['id', 'label', 'layer', 'emotions', 'triggers'];

  const RigRegistry = {
    register(Class) {
      const meta = Class.META;
      if (!meta) throw new Error(`RigRegistry: ${Class.name} has no static META`);
      for (const k of REQUIRED) if (meta[k] == null) throw new Error(`RigRegistry: ${Class.name}.META.${k} is missing`);
      classes.set(meta.id, Class);
      return Class;
    },
    has(id) { return classes.has(id); },
    get(id) {
      const C = classes.get(id);
      if (!C) throw new Error(`RigRegistry: no character "${id}" (registered: ${[...classes.keys()].join(', ') || 'none'})`);
      return C;
    },
    list() { return [...classes.values()]; },
    ids() { return [...classes.keys()]; },
  };

  if (typeof module === 'object' && module.exports) module.exports = RigRegistry;
  root.RigRegistry = RigRegistry;
})(typeof globalThis !== 'undefined' ? globalThis : this);
