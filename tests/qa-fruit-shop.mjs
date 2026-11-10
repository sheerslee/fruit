// QA harness for fruit-shop demo (functional-only, no browser needed).
// Portable: resolves the repo root from this file's location (tests/..).
import fs from 'node:fs';
import vm from 'node:vm';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const WS = path.resolve(HERE, '..');
const HTML = path.join(WS, 'index.html');

class El {
  constructor(tag, doc) {
    this.tagName = String(tag).toUpperCase();
    this.doc = doc;
    this._nodes = [];
    this.children = [];
    this.parent = null;
    this.attrs = {};
    this.style = {};
    this.listeners = {};
    this.value = '';
    this.disabled = false;
    this.hidden = false;
    this.className = '';
    this.type = '';
    this.id = '';
    this.classList = { add() {}, remove() {}, toggle() {} };
  }
  get textContent() {
    return this._nodes.map((n) => (typeof n === 'string' ? n : n.textContent)).join('');
  }
  set textContent(v) { this._nodes = [String(v)]; this.children = []; }
  get firstChild() { return this._nodes[0] === undefined ? null : (typeof this._nodes[0] === 'string' ? this._nodes[0] : this._nodes[0]); }
  appendChild(c) { c.parent = this; this._nodes.push(c); this.children.push(c); return c; }
  removeChild(c) {
    const i = this._nodes.indexOf(c); if (i >= 0) this._nodes.splice(i, 1);
    const j = this.children.indexOf(c); if (j >= 0) this.children.splice(j, 1);
    c.parent = null;
  }
  replaceChildren(...args) { this._nodes = []; this.children = []; args.forEach((a) => this.appendChild(a)); }
  setAttribute(k, v) { this.attrs[k] = String(v); if (k === 'id') this.id = String(v); }
  getAttribute(k) { return Object.prototype.hasOwnProperty.call(this.attrs, k) ? this.attrs[k] : null; }
  addEventListener(t, fn) { (this.listeners[t] = this.listeners[t] || []).push(fn); }
  removeEventListener() {}
  focus() { this.doc.focused = this; }
  scrollIntoView() { this.doc.scrolled = this; }
  closest(sel) {
    const m = /^\[([^\]=]+)\]$/.exec(sel);
    let n = this;
    while (n) {
      if (m) { if (Object.prototype.hasOwnProperty.call(n.attrs, m[1])) return n; }
      else if (n.id && sel === '#' + n.id) return n;
      n = n.parent;
    }
    return null;
  }
  dispatch(type, extra) {
    const ev = Object.assign({ type, target: this, preventDefault() {}, key: '' }, extra || {});
    let n = this;
    while (n) { (n.listeners[type] || []).forEach((fn) => fn(ev)); n = n.parent; }
  }
  click() { this.dispatch('click'); }
  submit() { this.dispatch('submit'); }
  descendants() {
    const out = [];
    const walk = (n) => { n.children.forEach((c) => { out.push(c); walk(c); }); };
    walk(this);
    return out;
  }
}

function makeStore(seed) {
  const data = Object.assign(Object.create(null), seed || {});
  return {
    data,
    getItem(k) { return Object.prototype.hasOwnProperty.call(data, k) ? data[k] : null; },
    setItem(k, v) { data[k] = String(v); },
    removeItem(k) { delete data[k]; }
  };
}

function extractScript(html) {
  const m = /<script>([\s\S]*?)<\/script>/.exec(html);
  if (!m) throw new Error('no inline script found');
  return m[1];
}

function loadPage(store, opts = {}) {
  const html = fs.readFileSync(HTML, 'utf8');
  const code = extractScript(html);
  const registry = new Map();
  const doc = { focused: null, scrolled: null };
  const ids = [...html.matchAll(/id="([^"]+)"/g)].map((m) => m[1]);
  ids.forEach((id) => { const el = new El('div', doc); el.id = id; registry.set(id, el); });
  doc.getElementById = (id) => registry.get(id) || null;
  doc.createElement = (tag) => new El(tag, doc);
  doc.querySelector = () => null;
  doc.querySelectorAll = () => [];
  doc.body = new El('body', doc);
  const logs = [];
  const consoleStub = { log: (...a) => logs.push(a.join(' ')), warn: (...a) => logs.push('WARN ' + a.join(' ')), error: (...a) => logs.push('ERROR ' + a.join(' ')) };
  const clipboardCalls = [];
  const navigator = {
    clipboard: opts.noClipboard ? undefined : {
      writeText: (t) => { clipboardCalls.push(String(t)); return Promise.resolve(); }
    }
  };
  const sandbox = {
    document: doc, navigator, console: consoleStub, localStorage: store,
    __html: html
  };
  sandbox.window = sandbox;
  vm.createContext(sandbox);
  vm.runInContext(code, sandbox, { filename: 'index.html:inline-script' });
  return { sandbox, doc, el: (id) => registry.get(id), clipboardCalls, logs, html };
}

function resultsTable() {
  const R = [];
  const add = (layer, id, name, ok, detail, card) => R.push({ layer, id, name, ok: !!ok, detail: detail || '', card: card || '' });
  return { R, add };
}

export { El, makeStore, loadPage, extractScript, resultsTable, WS, HTML };
