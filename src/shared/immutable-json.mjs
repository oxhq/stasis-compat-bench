import { types } from "node:util";

export function immutablePlainJsonSnapshot(value, label = "JSON value") {
  const active = new WeakSet();

  function clone(current, location) {
    if (
      current === null ||
      typeof current === "string" ||
      typeof current === "boolean"
    ) return current;
    if (typeof current === "number") {
      if (!Number.isFinite(current)) throw new Error(`${location} contains a non-finite number`);
      return current;
    }
    if (typeof current !== "object") {
      throw new Error(`${location} contains a non-JSON value`);
    }
    if (types.isProxy(current)) throw new Error(`${location} contains a Proxy`);
    if (active.has(current)) throw new Error(`${location} contains a cycle`);
    active.add(current);

    if (Array.isArray(current)) {
      if (Object.getPrototypeOf(current) !== Array.prototype) {
        throw new Error(`${location} has a non-plain array prototype`);
      }
      const descriptors = Object.getOwnPropertyDescriptors(current);
      const keys = Reflect.ownKeys(descriptors);
      if (
        keys.some((key) => typeof key !== "string") ||
        keys.length !== current.length + 1 ||
        !Object.hasOwn(descriptors, "length")
      ) {
        throw new Error(`${location} has non-index array properties or holes`);
      }
      const output = [];
      for (let index = 0; index < current.length; index += 1) {
        const descriptor = descriptors[String(index)];
        if (
          descriptor === undefined ||
          !("value" in descriptor) ||
          descriptor.enumerable !== true
        ) {
          throw new Error(`${location}[${index}] is not one enumerable own data property`);
        }
        output.push(clone(descriptor.value, `${location}[${index}]`));
      }
      active.delete(current);
      return Object.freeze(output);
    }

    if (Object.getPrototypeOf(current) !== Object.prototype) {
      throw new Error(`${location} has a non-plain object prototype`);
    }
    const descriptors = Object.getOwnPropertyDescriptors(current);
    const output = {};
    for (const key of Reflect.ownKeys(descriptors)) {
      if (typeof key !== "string") throw new Error(`${location} contains a symbol property`);
      const descriptor = descriptors[key];
      if (!("value" in descriptor) || descriptor.enumerable !== true) {
        throw new Error(`${location}.${key} is not one enumerable own data property`);
      }
      Object.defineProperty(output, key, {
        value: clone(descriptor.value, `${location}.${key}`),
        enumerable: true,
        writable: false,
        configurable: false,
      });
    }
    active.delete(current);
    return Object.freeze(output);
  }

  return clone(value, label);
}

export function snapshotOwnDataReferences(value, allowedKeys, label = "reference container") {
  if (
    typeof value !== "object" ||
    value === null ||
    types.isProxy(value) ||
    Array.isArray(value) ||
    Object.getPrototypeOf(value) !== Object.prototype
  ) {
    throw new Error(`${label} must be one plain own-data object`);
  }
  const allowed = new Set(allowedKeys);
  const descriptors = Object.getOwnPropertyDescriptors(value);
  const output = {};
  for (const key of Reflect.ownKeys(descriptors)) {
    if (typeof key !== "string" || !allowed.has(key)) {
      throw new Error(`${label} contains an unexpected property`);
    }
    const descriptor = descriptors[key];
    if (!("value" in descriptor) || descriptor.enumerable !== true) {
      throw new Error(`${label}.${key} is not one enumerable own data property`);
    }
    Object.defineProperty(output, key, {
      value: descriptor.value,
      enumerable: true,
      writable: false,
      configurable: false,
    });
  }
  for (const key of allowedKeys) {
    if (!Object.hasOwn(output, key)) {
      Object.defineProperty(output, key, {
        value: undefined,
        enumerable: true,
        writable: false,
        configurable: false,
      });
    }
  }
  return Object.freeze(output);
}
