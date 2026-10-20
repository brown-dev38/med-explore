import { setImmediate } from "node:timers/promises";

export function browser(context, fetchImpl) {
  const pageWindow = new EventTarget();
  const pageDocument = new EventTarget();
  pageDocument.visibilityState = "visible";
  const intervals = new Map();
  const timeouts = new Map();
  let id = 0;
  pageWindow.setInterval = (fn, ms) => { intervals.set(++id, { fn, ms }); return id; };
  pageWindow.clearInterval = (key) => intervals.delete(key);
  pageWindow.setTimeout = (fn) => { timeouts.set(++id, fn); return id; };
  pageWindow.clearTimeout = (key) => timeouts.delete(key);
  for (const [name, value] of [["window", pageWindow], ["document", pageDocument], ["navigator", { onLine: true }]]) {
    const previous = Object.getOwnPropertyDescriptor(globalThis, name);
    Object.defineProperty(globalThis, name, { configurable: true, value });
    context.after(() => previous ? Object.defineProperty(globalThis, name, previous) : delete globalThis[name]);
  }
  context.mock.method(globalThis, "fetch", fetchImpl);
  return { pageWindow, pageDocument, intervals, timeouts,
    tick: async () => { for (const { fn } of intervals.values()) fn(); await setImmediate(); },
  };
}

// Preserve hook state while running effect cleanup/setup like React Activity.
export function reactHarness() {
  const slots = [];
  let cursor = 0;
  let setups = [];
  const react = {
    useState(initial) {
      const index = cursor++;
      slots[index] ??= { value: typeof initial === "function" ? initial() : initial };
      return [slots[index].value, (next) => { slots[index].value = typeof next === "function" ? next(slots[index].value) : next; }];
    },
    useRef(initial) {
      const index = cursor++;
      slots[index] ??= { current: initial };
      return slots[index];
    },
    useEffect(effect, deps) {
      const index = cursor++;
      const previous = slots[index];
      if (!previous?.deps || deps.some((value, i) => !Object.is(value, previous.deps[i]))) {
        setups.push(() => { previous?.cleanup?.(); slots[index] = { effect, deps, cleanup: effect() }; });
      }
    },
    useCallback: (callback) => callback,
    useMemo: (factory) => factory(),
  };
  return { react,
    render(fn) {
      cursor = 0;
      setups = [];
      const result = fn();
      setups.forEach((setup) => setup());
      return result;
    },
    hide() {
      for (const slot of slots) if (slot.effect) { slot.cleanup?.(); slot.cleanup = null; slot.deps = null; }
    },
  };
}

export function nodes(node) {
  if (Array.isArray(node)) return node.flatMap(nodes);
  if (!node || typeof node !== "object") return [];
  return [node, ...nodes(node.props?.children), ...nodes(node.props?.render)];
}

export function text(node) {
  if (Array.isArray(node)) return node.map(text).join("");
  if (typeof node === "string" || typeof node === "number") return String(node);
  return node && typeof node === "object" ? text(node.props?.children ?? node.props?.render) : "";
}
