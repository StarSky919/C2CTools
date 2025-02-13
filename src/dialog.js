import {
  $,
  $$,
  noop,
  Time,
  isNullish,
  isEmpty,
  createElement,
  bindOnClick
} from './utils.js';

const { body } = document;
const template = $('dialog_template');

function setStyle(node, selected) {
  if (selected) {
    node.classList.add('selected');
    node.style.background = 'var(--background-color-third)';
  } else {
    node.classList.remove('selected');
    node.style.background = 'transparent';
  }
}

export class Dialog {
  constructor(options) {
    this.closed = false;
    this._options = Object.assign({
      cancellable: true,
    }, options);
    [this._container] = template.content.cloneNode(true).children;
    [this._mask, this._box] = this._container.children;
    [this._title, this._content, this._buttons] = this._box.children;
    this._options.cancellable && bindOnClick(this._mask, () => this.close());
    this.button('确定');
    this._buttons.children[0].classList.add('full_width');
  }

  title(text) {
    this._title.innerText = text;
    return this;
  }

  content(content, html = false) {
    if (typeof content === 'string') {
      if (html) this._content.innerHTML = content;
      else this._content.innerText = content;
    } else {
      this._content.appendChild(content);
    }
    return this;
  }

  button(text, func = noop) {
    if (!isEmpty(this._buttons.children)) {
      this._buttons.children[0].innerText = '返回';
      this._buttons.children[0].classList.remove('full_width');
    }
    const close = this.close.bind(this);
    const button = createElement('span', {
      classList: ['button'],
      innerText: text
    });
    bindOnClick(button, async event => await func.call(this, close) !== false && await close());
    this._buttons.appendChild(button);
    return this;
  }

  show() {
    body.appendChild(this._container);
    Time.sleep(0.1 * Time.second).then(() => {
      this._container.classList.remove('hidden');
    });
    return this;
  }

  close() {
    if (this.closed) return;
    this.closed = true;
    return new Promise(resolve => {
      const container = this._container;
      container.classList.add('hidden');
      Time.sleep(0.5 * Time.second).then(() => {
        body.removeChild(container);
        resolve();
      });
    });
  }

  getButton(index) {
    const button = this._buttons.children[index];
    const close = this.close.bind(this);
    return {
      button,
      enable() { button.classList.remove('disable'); },
      disable() { button.classList.add('disable'); },
      setText(text) { button.innerText = text; },
      onClick(func = noop) { bindOnClick(button, async event => await func.call(this, close) !== false && await close()); }
    };
  }

  static show(content, title, options) {
    return new Dialog(options).title(title).content(content).show();
  }

  static message(content, options) {
    return Dialog.show(content, '信息', options);
  }

  static notice(content, options) {
    return Dialog.show(content, '提示', options);
  }

  static error(content, options) {
    return Dialog.show(content, '错误', Object.assign({ cancellable: false }, options));
  }
}

export default Dialog;

export class ItemSelectorDialog extends Dialog {
  constructor(options) {
    super(options);
    const { settingName, defaultValue } = options;
    this.selects = createElement('div');
    this.items = [];
    this._onItemClick = noop;
    this._onConfirm = noop;
    if (!isNullish(settingName) && !isNullish(defaultValue) && !storage.has(settingName)) storage.set(settingName, defaultValue);
  }

  setItem(items) {
    this.items = items;
    return this;
  }

  addItem(item) {
    this.items.push(item);
    return this;
  }

  onItemClick(callback) {
    this._onItemClick = callback;
    return this;
  }

  onConfirm(callback) {
    this._onConfirm = callback;
    return this;
  }

  show() {
    const { settingName, multiple } = this._options;
    for (const { id, text } of this.items) {
      const item = createElement('div', {
        classList: ['selector_item'],
        dataset: {
          id
        },
        innerText: text
      });
      item.onclick = event => {
        if (multiple) setStyle(item, !item.classList.contains('selected'));
        else {
          for (const node of $$(this.selects, '*')) setStyle(node, false);
          setStyle(item, true);
        }
        this._onItemClick.call(item, id);
      }
      const saved = storage.get(settingName);
      if (!isNullish(saved) && multiple ? saved.includes(id) : saved === id) setStyle(item, true);
      this.selects.appendChild(item);
    }
    this.content(this.selects);
    this.button('确定', close => {
      const selected = $$(this.selects, '.selected');
      const id = isNullish(selected) ? this._options.defaultValue : multiple ? isNullish(selected.length) ? [Number(selected.dataset.id)] : Array.from(selected).map(node => Number(node.dataset.id)) : Number(selected.dataset.id);
      if (!isNullish(settingName)) storage.set(settingName, id);
      this._onConfirm.call(this, id);
    });
    super.show();
    return this;
  }
}