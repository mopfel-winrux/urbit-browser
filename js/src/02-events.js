// ------------------------------------------------------------------ Events
class EventImpl {
  constructor(type, init) {
    init = init || {};
    this.type = String(type);
    this.bubbles = !!init.bubbles; this.cancelable = !!init.cancelable; this.composed = !!init.composed;
    this.target = null; this.currentTarget = null; this.eventPhase = 0;
    this.defaultPrevented = false; this.isTrusted = false; this.timeStamp = R.clock.now;
    this._stop = false; this._stopNow = false; this._dispatching = false;
  }
  get srcElement() { return this.target; }
  get returnValue() { return !this.defaultPrevented; }
  set returnValue(v) { if (!v) this.preventDefault(); }
  get cancelBubble() { return this._stop; }
  set cancelBubble(v) { if (v) this._stop = true; }
  preventDefault() { if (this.cancelable) this.defaultPrevented = true; }
  stopPropagation() { this._stop = true; }
  stopImmediatePropagation() { this._stop = true; this._stopNow = true; }
  composedPath() { return this._path ? this._path.slice() : []; }
  initEvent(type, bubbles, cancelable) { this.type = type; this.bubbles = !!bubbles; this.cancelable = !!cancelable; }
}
EventImpl.NONE = 0; EventImpl.CAPTURING_PHASE = 1; EventImpl.AT_TARGET = 2; EventImpl.BUBBLING_PHASE = 3;
class UIEventImpl extends EventImpl { constructor(t, i) { super(t, i); i = i || {}; this.detail = i.detail || 0; this.view = i.view || null; } }
class MouseEventImpl extends UIEventImpl {
  constructor(t, i) { super(t, i); i = i || {}; for (const k of ['screenX', 'screenY', 'clientX', 'clientY', 'button', 'buttons']) this[k] = i[k] || 0; for (const k of ['ctrlKey', 'shiftKey', 'altKey', 'metaKey']) this[k] = !!i[k]; this.relatedTarget = i.relatedTarget || null; this.pageX = this.clientX; this.pageY = this.clientY; this.offsetX = 0; this.offsetY = 0; this.x = this.clientX; this.y = this.clientY; this.movementX = 0; this.movementY = 0; }
  getModifierState() { return false; }
}
class PointerEventImpl extends MouseEventImpl { constructor(t, i) { super(t, i); i = i || {}; this.pointerId = i.pointerId || 1; this.pointerType = i.pointerType || 'mouse'; this.isPrimary = true; this.width = 1; this.height = 1; this.pressure = 0; } }
class WheelEventImpl extends MouseEventImpl { constructor(t, i) { super(t, i); i = i || {}; this.deltaX = i.deltaX || 0; this.deltaY = i.deltaY || 0; this.deltaZ = 0; this.deltaMode = 0; } }
// subclasses that only add defaulted fields
const eventClass = (Base, fields) => class extends Base { constructor(t, i) { super(t, i); i = i || {}; for (const k of Object.keys(fields)) this[k] = i[k] === undefined ? fields[k] : i[k]; } };
const FocusEventImpl = eventClass(UIEventImpl, { relatedTarget: null });
const KEY_CODES = { Enter: 13, Tab: 9, Escape: 27, Backspace: 8, Delete: 46, ArrowUp: 38, ArrowDown: 40, ArrowLeft: 37, ArrowRight: 39, ' ': 32, Space: 32, Home: 36, End: 35, PageUp: 33, PageDown: 34 };
class KeyboardEventImpl extends UIEventImpl {
  constructor(t, i) { super(t, i); i = i || {}; this.key = i.key || ''; this.code = i.code || ''; this.location = 0; this.repeat = !!i.repeat; this.isComposing = false; for (const k of ['ctrlKey', 'shiftKey', 'altKey', 'metaKey']) this[k] = !!i[k]; this.keyCode = i.keyCode !== undefined ? i.keyCode : (KEY_CODES[this.key] !== undefined ? KEY_CODES[this.key] : (this.key.length === 1 ? this.key.toUpperCase().charCodeAt(0) : 0)); this.which = this.keyCode; this.charCode = this.key.length === 1 ? this.key.charCodeAt(0) : 0; }
  getModifierState() { return false; }
}
const InputEventImpl = eventClass(UIEventImpl, { data: null, inputType: '', isComposing: false });
class CustomEventImpl extends eventClass(EventImpl, { detail: null }) { initCustomEvent(t, b, c, d) { this.initEvent(t, b, c); this.detail = d; } }
const SubmitEventImpl = eventClass(EventImpl, { submitter: null });
const PopStateEventImpl = eventClass(EventImpl, { state: null });
const HashChangeEventImpl = eventClass(EventImpl, { oldURL: '', newURL: '' });
const StorageEventImpl = eventClass(EventImpl, { key: null, oldValue: null, newValue: null, url: '', storageArea: null });
const ErrorEventImpl = eventClass(EventImpl, { message: '', filename: '', lineno: 0, colno: 0, error: undefined });
const PromiseRejectionEventImpl = eventClass(EventImpl, { promise: undefined, reason: undefined });
const ProgressEventImpl = eventClass(EventImpl, { lengthComputable: false, loaded: 0, total: 0 });
const MessageEventImpl = eventClass(EventImpl, { data: null, origin: '', lastEventId: '', source: null, ports: [] });
const TransitionEventImpl = eventClass(EventImpl, { propertyName: '', elapsedTime: 0, pseudoElement: '' });
const AnimationEventImpl = eventClass(EventImpl, { animationName: '', elapsedTime: 0, pseudoElement: '' });
const DragEventImpl = eventClass(MouseEventImpl, { dataTransfer: null });
const TouchEventImpl = eventClass(UIEventImpl, { touches: [], targetTouches: [], changedTouches: [] });
const ClipboardEventImpl = eventClass(EventImpl, { clipboardData: null });
const BeforeUnloadEventImpl = eventClass(EventImpl, {});
const CompositionEventImpl = eventClass(UIEventImpl, { data: '' });

const listenersKey = Symbol('listeners');
class EventTargetImpl {
  constructor() { this[listenersKey] = null; }
  addEventListener(type, fn, opts) {
    if (!fn) return;
    type = String(type);
    const capture = typeof opts === 'boolean' ? opts : !!(opts && opts.capture);
    const once = !!(opts && typeof opts === 'object' && opts.once);
    let map = this[listenersKey]; if (!map) map = this[listenersKey] = Object.create(null);
    let list = map[type]; if (!list) list = map[type] = [];
    if (list.some(l => l.fn === fn && l.capture === capture)) return;
    list.push({ fn, capture, once });
    if (opts && typeof opts === 'object' && opts.signal && typeof opts.signal.addEventListener === 'function') {
      opts.signal.addEventListener('abort', () => this.removeEventListener(type, fn, capture));
    }
  }
  removeEventListener(type, fn, opts) {
    const map = this[listenersKey]; if (!map) return;
    const capture = typeof opts === 'boolean' ? opts : !!(opts && opts.capture);
    const list = map[String(type)]; if (!list) return;
    const i = list.findIndex(l => l.fn === fn && l.capture === capture);
    if (i >= 0) list.splice(i, 1);
  }
  dispatchEvent(ev) {
    if (!(ev instanceof EventImpl)) throw new TypeError('dispatchEvent: not an Event');
    if (ev._dispatching) throw new Error('InvalidStateError: event already dispatched');
    return dispatch(this, ev);
  }
}
function eventPath(target) {
  const path = [];
  let n = target;
  while (n) {
    path.push(n);
    if (n === R.window) break;
    if (n.__isNode) {
      if (n.nodeType === 9) { n = R.window; continue; }
      if (n._host) { n = n._host; continue; }        // shadow root -> host
      n = n.parentNode;
    } else n = null;
  }
  return path;
}
function invokeListeners(node, ev, phase) {
  ev.currentTarget = node; ev.eventPhase = phase;
  const type = ev.type;
  // on<type> IDL handler and inline attribute
  if (phase !== 1) {
    const h = node._handlers && node._handlers[type];
    if (h) { try { const r = h.call(node, ev); if (r === false && type !== 'mouseover') ev.preventDefault(); if (type === 'beforeunload' && r != null) {} } catch (e) { reportError(e, 'on' + type + ' handler'); } if (ev._stopNow) return; }
    else if (node.__isNode && node.nodeType === 1 && node._attrs && node._attrs['on' + type] !== undefined) {
      const code = node._attrs['on' + type];
      try { const fn = new Function('event', code); const r = fn.call(node, ev); if (r === false) ev.preventDefault(); } catch (e) { reportError(e, 'on' + type + ' attribute'); }
      if (ev._stopNow) return;
    }
  }
  const map = node[listenersKey]; if (!map) return;
  const list = map[type]; if (!list || !list.length) return;
  for (const l of list.slice()) {
    if (phase === 1 && !l.capture) continue;
    if (phase === 3 && l.capture) continue;
    if (l.once) { const i = list.indexOf(l); if (i >= 0) list.splice(i, 1); }
    try {
      if (typeof l.fn === 'function') l.fn.call(node, ev);
      else if (l.fn && typeof l.fn.handleEvent === 'function') l.fn.handleEvent(ev);
    } catch (e) { reportError(e, type + ' listener'); }
    if (ev._stopNow) return;
  }
}
function dispatch(target, ev) {
  ev.target = target; ev._dispatching = true; ev._stop = false; ev._stopNow = false;
  const path = eventPath(target); ev._path = path;
  for (let i = path.length - 1; i > 0 && !ev._stop; i--) invokeListeners(path[i], ev, 1);
  if (!ev._stop) invokeListeners(target, ev, 2);
  if (ev.bubbles) for (let i = 1; i < path.length && !ev._stop; i++) invokeListeners(path[i], ev, 3);
  ev._dispatching = false; ev.currentTarget = null; ev.eventPhase = 0;
  return !ev.defaultPrevented;
}
function reportError(e, where) {
  const msg = (e && e.message !== undefined) ? ((e.name || 'Error') + ': ' + e.message) : String(e);
  pushLog('error', [where ? '[' + where + '] ' + msg : msg]);
  R.errors = (R.errors || 0) + 1;
  try {
    if (R.window && (R.window._handlers && R.window._handlers.error || (R.window[listenersKey] && R.window[listenersKey].error))) {
      const ev = new ErrorEventImpl('error', { message: msg, error: e, cancelable: true });
      dispatch(R.window, ev);
    }
  } catch (e2) { /* ignore */ }
}
function fire(target, type, init, Cls) {
  const ev = new (Cls || EventImpl)(type, Object.assign({ bubbles: true, cancelable: true }, init || {}));
  ev.isTrusted = true;
  return dispatch(target, ev);
}
R.Event = EventImpl; R.EventTarget = EventTargetImpl; R.dispatch = dispatch; R.fire = fire; R.reportError = reportError; R.pushLog = pushLog;
R.eventClasses = { Event: EventImpl, UIEvent: UIEventImpl, MouseEvent: MouseEventImpl, PointerEvent: PointerEventImpl, WheelEvent: WheelEventImpl, FocusEvent: FocusEventImpl, KeyboardEvent: KeyboardEventImpl, InputEvent: InputEventImpl, CustomEvent: CustomEventImpl, SubmitEvent: SubmitEventImpl, PopStateEvent: PopStateEventImpl, HashChangeEvent: HashChangeEventImpl, StorageEvent: StorageEventImpl, ErrorEvent: ErrorEventImpl, PromiseRejectionEvent: PromiseRejectionEventImpl, ProgressEvent: ProgressEventImpl, MessageEvent: MessageEventImpl, TransitionEvent: TransitionEventImpl, AnimationEvent: AnimationEventImpl, DragEvent: DragEventImpl, TouchEvent: TouchEventImpl, ClipboardEvent: ClipboardEventImpl, BeforeUnloadEvent: BeforeUnloadEventImpl, CompositionEvent: CompositionEventImpl };
