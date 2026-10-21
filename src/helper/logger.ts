import { inspect } from 'node:util';

/** Prints objects in full (depth: null) instead of [Object] */
function wrapLogger(logger: (...args: unknown[]) => void): (...args: unknown[]) => void {
  return (...args: unknown[]) => {
    logger(...args.map((arg: unknown) => (typeof arg === 'string' ? arg : inspect(arg, { depth: null }))));
  };
}

export const log = wrapLogger(console.log.bind(console));
export const warn = wrapLogger(console.warn.bind(console));
export const error = wrapLogger(console.error.bind(console));
