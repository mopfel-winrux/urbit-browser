// ------------------------------------------------------------ Form controls
const TEXT_INPUT_TYPES = new Set(['text', 'search', 'url', 'tel', 'email', 'password', 'number', 'date', 'datetime-local', 'month', 'week', 'time', 'color', 'range', '']);
class HTMLFormElementImpl extends HTMLElementImpl {
  get elements() { return R.collect(this, e => R.isFormControl(e) && e.form === this); }
  get length() { return this.elements.length; }
  get action() { const a = this._attrs.action; return a ? (R.resolveURL(a, R.base()) || a) : R.location.href; } set action(v) { this.setAttribute('action', v); }
  get method() { const m = (this._attrs.method || 'get').toLowerCase(); return m === 'post' || m === 'dialog' ? m : 'get'; } set method(v) { this.setAttribute('method', v); }
  get enctype() { const e = (this._attrs.enctype || '').toLowerCase(); return e === 'multipart/form-data' || e === 'text/plain' ? e : 'application/x-www-form-urlencoded'; } set enctype(v) { this.setAttribute('enctype', v); }
  get encoding() { return this.enctype; }
  get target() { return this._attrs.target || ''; } set target(v) { this.setAttribute('target', v); }
  get name() { return this._attrs.name || ''; } set name(v) { this.setAttribute('name', v); }
  get noValidate() { return 'novalidate' in this._attrs; } set noValidate(v) { this.toggleAttribute('novalidate', !!v); }
  get autocomplete() { return this._attrs.autocomplete || 'on'; }
  submit() { R.submitForm(this, null, false); }
  requestSubmit(submitter) { R.submitForm(this, submitter || null, true); }
  reset() { for (const e of this.elements) if (e._reset) e._reset(); R.fire(this, 'reset', { cancelable: true }); }
  checkValidity() { return this.elements.every(e => !e.checkValidity || e.checkValidity()); }
  reportValidity() { return this.checkValidity(); }
  item(i) { return this.elements[i] || null; }
  namedItem(n) { return this.elements.find(e => e._attrs.name === n || e._attrs.id === n) || null; }
}
function formOf(el) { const fa = el._attrs.form; if (fa !== undefined) return el.ownerDocument.getElementById(fa); return el.closest('form'); }
const validity = { valid: true, valueMissing: false, typeMismatch: false, patternMismatch: false, tooLong: false, tooShort: false, rangeUnderflow: false, rangeOverflow: false, stepMismatch: false, badInput: false, customError: false };
function mixinControl(Cls) {
  Object.defineProperties(Cls.prototype, {
    form: { get() { return formOf(this); }, configurable: true },
    name: { get() { return this._attrs.name || ''; }, set(v) { this.setAttribute('name', v); }, configurable: true },
    disabled: { get() { return 'disabled' in this._attrs; }, set(v) { this.toggleAttribute('disabled', !!v); }, configurable: true },
    required: { get() { return 'required' in this._attrs; }, set(v) { this.toggleAttribute('required', !!v); }, configurable: true },
    readOnly: { get() { return 'readonly' in this._attrs; }, set(v) { this.toggleAttribute('readonly', !!v); }, configurable: true },
    autofocus: { get() { return 'autofocus' in this._attrs; }, configurable: true },
    labels: { get() { return R.labelsFor(this); }, configurable: true },
    validity: { get() { return { ...validity }; }, configurable: true },
    validationMessage: { get() { return ''; }, configurable: true },
    willValidate: { get() { return !this.disabled; }, configurable: true },
  });
  Cls.prototype.checkValidity = function () { return true; };
  Cls.prototype.reportValidity = function () { return true; };
  Cls.prototype.setCustomValidity = function () {};
}
class HTMLInputElementImpl extends HTMLElementImpl {
  constructor(d, t, ns) { super(d, t, ns); this._value = undefined; this._checked = undefined; this.indeterminate = false; this._dirtyValue = false; this.files = null; this.selectionStart = 0; this.selectionEnd = 0; this.selectionDirection = 'none'; }
  get type() { const t = (this._attrs.type || 'text').toLowerCase(); return t; } set type(v) { this.setAttribute('type', v); }
  get value() {
    const t = this.type;
    if (t === 'checkbox' || t === 'radio') return this._attrs.value !== undefined ? this._attrs.value : 'on';
    if (t === 'file') return this.files && this.files.length ? 'C:\\fakepath\\' + this.files[0].name : '';
    if (this._value !== undefined) return this._value;
    return this._attrs.value !== undefined ? this._attrs.value : '';
  }
  set value(v) { const t = this.type; if (t === 'file') { if (v === '') this.files = null; return; } this._value = String(v == null ? '' : v); this._dirtyValue = true; this.selectionStart = this.selectionEnd = this._value.length; }
  get defaultValue() { return this._attrs.value || ''; } set defaultValue(v) { this.setAttribute('value', v); }
  get checked() { return this._checked !== undefined ? this._checked : ('checked' in this._attrs); }
  set checked(v) { this._checked = !!v; if (this._checked && this.type === 'radio') R.uncheckRadioGroup(this); }
  get defaultChecked() { return 'checked' in this._attrs; } set defaultChecked(v) { this.toggleAttribute('checked', !!v); }
  get valueAsNumber() { const n = parseFloat(this.value); return isNaN(n) ? NaN : n; } set valueAsNumber(v) { this.value = String(v); }
  get valueAsDate() { const d = new Date(this.value); return isNaN(d) ? null : d; }
  get placeholder() { return this._attrs.placeholder || ''; } set placeholder(v) { this.setAttribute('placeholder', v); }
  get maxLength() { return parseInt(this._attrs.maxlength, 10) || -1; } get minLength() { return parseInt(this._attrs.minlength, 10) || -1; }
  get max() { return this._attrs.max || ''; } set max(v) { this.setAttribute('max', v); } get min() { return this._attrs.min || ''; } set min(v) { this.setAttribute('min', v); } get step() { return this._attrs.step || ''; } set step(v) { this.setAttribute('step', v); }
  get pattern() { return this._attrs.pattern || ''; } get accept() { return this._attrs.accept || ''; } get multiple() { return 'multiple' in this._attrs; } set multiple(v) { this.toggleAttribute('multiple', !!v); }
  get autocomplete() { return this._attrs.autocomplete || ''; } set autocomplete(v) { this.setAttribute('autocomplete', v); }
  get list() { const l = this._attrs.list; return l ? this.ownerDocument.getElementById(l) : null; }
  get src() { return this._attrs.src || ''; } get alt() { return this._attrs.alt || ''; }
  get size() { return parseInt(this._attrs.size, 10) || 20; }
  get formAction() { return this._attrs.formaction || ''; } get formMethod() { return this._attrs.formmethod || ''; }
  select() { this.selectionStart = 0; this.selectionEnd = this.value.length; }
  setSelectionRange(s, e) { this.selectionStart = s; this.selectionEnd = e; }
  setRangeText(t) { this.value = t; }
  stepUp() {} stepDown() {} showPicker() {}
  _reset() { this._value = undefined; this._checked = undefined; this._dirtyValue = false; }
}
mixinControl(HTMLInputElementImpl);
class HTMLTextAreaElementImpl extends HTMLElementImpl {
  constructor(d, t, ns) { super(d, t, ns); this._value = undefined; this.selectionStart = 0; this.selectionEnd = 0; }
  get type() { return 'textarea'; }
  get value() { return this._value !== undefined ? this._value : this.textContent; } set value(v) { this._value = String(v == null ? '' : v); this.selectionStart = this.selectionEnd = this._value.length; }
  get defaultValue() { return this.textContent; } set defaultValue(v) { this.textContent = v; }
  get textLength() { return this.value.length; }
  get placeholder() { return this._attrs.placeholder || ''; } set placeholder(v) { this.setAttribute('placeholder', v); }
  get rows() { return parseInt(this._attrs.rows, 10) || 2; } get cols() { return parseInt(this._attrs.cols, 10) || 20; }
  get maxLength() { return parseInt(this._attrs.maxlength, 10) || -1; }
  get wrap() { return this._attrs.wrap || ''; }
  select() { this.selectionStart = 0; this.selectionEnd = this.value.length; } setSelectionRange(s, e) { this.selectionStart = s; this.selectionEnd = e; } setRangeText(t) { this.value = t; }
  _reset() { this._value = undefined; }
}
mixinControl(HTMLTextAreaElementImpl);
class HTMLButtonElementImpl extends HTMLElementImpl {
  get type() { const t = (this._attrs.type || 'submit').toLowerCase(); return t === 'button' || t === 'reset' ? t : 'submit'; } set type(v) { this.setAttribute('type', v); }
  get value() { return this._attrs.value || ''; } set value(v) { this.setAttribute('value', v); }
  get formAction() { return this._attrs.formaction || ''; } get formMethod() { return this._attrs.formmethod || ''; } get formTarget() { return this._attrs.formtarget || ''; }
}
mixinControl(HTMLButtonElementImpl);
class HTMLOptionElementImpl extends HTMLElementImpl {
  constructor(d, t, ns) { super(d, t, ns); this._selected = undefined; }
  get value() { return this._attrs.value !== undefined ? this._attrs.value : this.text; } set value(v) { this.setAttribute('value', v); }
  get text() { return R.collapse(this.textContent); } set text(v) { this.textContent = v; }
  get label() { return this._attrs.label !== undefined ? this._attrs.label : this.text; } set label(v) { this.setAttribute('label', v); }
  get selected() { return this._selected !== undefined ? this._selected : ('selected' in this._attrs); }
  set selected(v) { this._selected = !!v; const s = this.closest('select'); if (s && this._selected && !s.multiple) for (const o of s.options) if (o !== this) o._selected = false; }
  get defaultSelected() { return 'selected' in this._attrs; } set defaultSelected(v) { this.toggleAttribute('selected', !!v); }
  get disabled() { return 'disabled' in this._attrs || (this.parentNode && this.parentNode.localName === 'optgroup' && 'disabled' in this.parentNode._attrs); } set disabled(v) { this.toggleAttribute('disabled', !!v); }
  get index() { const s = this.closest('select'); return s ? s.options.indexOf(this) : 0; }
  get form() { const s = this.closest('select'); return s ? s.form : null; }
}
class HTMLOptGroupElementImpl extends HTMLElementImpl { get label() { return this._attrs.label || ''; } get disabled() { return 'disabled' in this._attrs; } }
class HTMLSelectElementImpl extends HTMLElementImpl {
  get type() { return this.multiple ? 'select-multiple' : 'select-one'; }
  get multiple() { return 'multiple' in this._attrs; } set multiple(v) { this.toggleAttribute('multiple', !!v); }
  get size() { return parseInt(this._attrs.size, 10) || 0; }
  get options() { const out = R.collect(this, e => e.localName === 'option'); out.item = i => out[i] || null; out.namedItem = n => out.find(o => o._attrs.id === n || o._attrs.name === n) || null; return out; }
  get length() { return this.options.length; }
  get selectedOptions() { return this.options.filter(o => o.selected); }
  get selectedIndex() { const os = this.options; let i = os.findIndex(o => o.selected); if (i < 0 && os.length && !this.multiple && this.size <= 1) { i = os.findIndex(o => !o.disabled); } return i; }
  set selectedIndex(i) { const os = this.options; os.forEach((o, j) => { o._selected = j === i; }); }
  get value() { const os = this.options; let o = os.find(o => o.selected); if (!o && !this.multiple && this.size <= 1) o = os.find(o => !o.disabled); return o ? o.value : ''; }
  set value(v) { v = String(v); const os = this.options; let hit = false; for (const o of os) { if (!hit && o.value === v) { o._selected = true; hit = true; } else o._selected = false; } }
  item(i) { return this.options[i] || null; } namedItem(n) { return this.options.namedItem(n); }
  add(o, before) { if (before == null) this.appendChild(o); else this.insertBefore(o, typeof before === 'number' ? this.options[before] : before); }
  remove(i) { if (typeof i === 'number') { const o = this.options[i]; if (o) o.remove(); } else super.remove(); }
  _reset() { for (const o of this.options) o._selected = undefined; }
  showPicker() {}
}
mixinControl(HTMLSelectElementImpl);
Object.assign(ELEMENT_CLASSES, { form: HTMLFormElementImpl, input: HTMLInputElementImpl, textarea: HTMLTextAreaElementImpl, button: HTMLButtonElementImpl, option: HTMLOptionElementImpl, optgroup: HTMLOptGroupElementImpl, select: HTMLSelectElementImpl });
Object.assign(R.classes, { HTMLFormElement: HTMLFormElementImpl, HTMLInputElement: HTMLInputElementImpl, HTMLTextAreaElement: HTMLTextAreaElementImpl, HTMLButtonElement: HTMLButtonElementImpl, HTMLOptionElement: HTMLOptionElementImpl, HTMLOptGroupElement: HTMLOptGroupElementImpl, HTMLSelectElement: HTMLSelectElementImpl });

R.isFormControl = el => el.nodeType === 1 && (el.localName === 'input' || el.localName === 'select' || el.localName === 'textarea' || el.localName === 'button' || el.localName === 'fieldset' || el.localName === 'output' || el.localName === 'object');
R.isLabelable = el => el.nodeType === 1 && (el.localName === 'input' && el.type !== 'hidden' || el.localName === 'select' || el.localName === 'textarea' || el.localName === 'button' || el.localName === 'meter' || el.localName === 'output' || el.localName === 'progress');
R.isDisabled = el => { if (!R.isFormControl(el) && el.localName !== 'option' && el.localName !== 'optgroup') return false; if ('disabled' in el._attrs) return true; let p = el.parentNode; while (p && p.nodeType === 1) { if (p.localName === 'fieldset' && 'disabled' in p._attrs) { const legend = p.children.find(c => c.localName === 'legend'); if (!(legend && legend.contains(el))) return true; } p = p.parentNode; } return false; };
R.isEditable = el => (el.localName === 'input' && TEXT_INPUT_TYPES.has(el.type) && !('readonly' in el._attrs) && !R.isDisabled(el)) || (el.localName === 'textarea' && !('readonly' in el._attrs) && !R.isDisabled(el)) || el.isContentEditable;
R.isTextInput = el => (el.localName === 'input' && TEXT_INPUT_TYPES.has(el.type)) || el.localName === 'textarea';
R.uncheckRadioGroup = el => { const name = el._attrs.name; if (!name) return; const form = el.form; const root = form || el.ownerDocument; for (const o of R.collect(root, e => e.localName === 'input' && e.type === 'radio' && e._attrs.name === name && e.form === form)) if (o !== el) o._checked = false; };
R.collectFormData = (form, submitter) => {
  const out = [];
  for (const el of form.elements) {
    if (R.isDisabled(el) || !el._attrs.name) continue;
    const ln = el.localName, name = el._attrs.name;
    if (ln === 'button') { if (el === submitter) out.push([name, el.value]); continue; }
    if (ln === 'fieldset' || ln === 'object' || ln === 'output') continue;
    if (ln === 'input') {
      const t = el.type;
      if (t === 'submit' || t === 'image' || t === 'reset' || t === 'button') { if (el === submitter && t !== 'reset' && t !== 'button') { if (t === 'image') { out.push([name + '.x', '0']); out.push([name + '.y', '0']); } else out.push([name, el.value]); } continue; }
      if ((t === 'checkbox' || t === 'radio') && !el.checked) continue;
      if (t === 'file') { if (el.files && el.files.length) for (const f of el.files) out.push([name, f]); else out.push([name, { name: '', type: 'application/octet-stream', size: 0, _text: '' }]); continue; }
      out.push([name, el.value]); continue;
    }
    if (ln === 'select') { for (const o of el.options) if (o.selected && !o.disabled) out.push([name, o.value]); continue; }
    if (ln === 'textarea') { out.push([name, el.value.replace(/\r?\n/g, '\r\n')]); continue; }
  }
  if (submitter && submitter.localName === 'input' && submitter.type === 'submit' && submitter._attrs.name && !form.elements.includes(submitter)) out.push([submitter._attrs.name, submitter.value]);
  return out;
};
// Build a navigation request from a form submission (the agent performs it).
R.submitForm = (form, submitter, fireEvents) => {
  if (R.pendingNavigation) return;
  if (fireEvents) { if (!R.fire(form, 'submit', { cancelable: true, submitter }, R.eventClasses.SubmitEvent)) return; if (R.pendingNavigation) return; }
  let method = form.method, action = form.action, enctype = form.enctype;
  if (submitter) {
    if (submitter._attrs.formaction) action = R.resolveURL(submitter._attrs.formaction, R.base()) || action;
    if (submitter._attrs.formmethod) { const m = submitter._attrs.formmethod.toLowerCase(); if (m === 'post' || m === 'get' || m === 'dialog') method = m; }
    if (submitter._attrs.formenctype) enctype = submitter._attrs.formenctype.toLowerCase();
  }
  if (method === 'dialog') { const d = form.closest('dialog'); if (d) d.close(submitter && submitter.value); return; }
  const data = R.collectFormData(form, submitter);
  const pairs = data.map(([k, v]) => [k, typeof v === 'string' ? v : v.name]);
  const encoded = pairs.map(([k, v]) => formEncode(k) + '=' + formEncode(v)).join('&');
  if (method === 'get') {
    let u; try { u = new R.URL(action); } catch (e) { return; }
    if (u.protocol === 'http:' || u.protocol === 'https:') { u.search = encoded ? '?' + encoded : ''; u.hash = ''; }
    R.pendingNavigation = { url: u.href, method: 'GET', reason: 'form' };
  } else {
    let ct = 'application/x-www-form-urlencoded', body = encoded;
    if (enctype === 'text/plain') { ct = 'text/plain'; body = pairs.map(([k, v]) => k + '=' + v).join('\r\n') + '\r\n'; }
    else if (enctype === 'multipart/form-data') {
      const boundary = '----UrbitBrowserBoundary' + Math.floor(random() * 1e9);
      ct = 'multipart/form-data; boundary=' + boundary;
      body = data.map(([k, v]) => '--' + boundary + '\r\nContent-Disposition: form-data; name="' + k.replace(/"/g, '%22') + '"' + (typeof v === 'string' ? '' : '; filename="' + v.name.replace(/"/g, '%22') + '"\r\nContent-Type: ' + (v.type || 'application/octet-stream')) + '\r\n\r\n' + (typeof v === 'string' ? v : (v._text || '')) + '\r\n').join('') + '--' + boundary + '--\r\n';
    }
    R.pendingNavigation = { url: action, method: 'POST', body, contentType: ct, reason: 'form' };
  }
};
