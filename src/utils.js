window.log = console.log;
Promise.stop = value => new Promise(() => Promise.resolve(value));

export function noop() {}

export const $ = id => document.getElementById(id);
export function $$(node, selector) {
  if (!selector) {
    selector = node;
    node = document;
  }
  try {
    const nodes = node.querySelectorAll(selector);
    return nodes.length > 1 ? nodes : nodes[0];
  } catch (e) {
    return null;
  }
}

const p0 = (num, length = 2) => num.toString().padStart(length, '0');

const millisecond = 1;
const second = millisecond * 1e3;
const minute = second * 60;
const hour = minute * 60;
const day = hour * 24;
const week = day * 7;

const numeric = /\d+(?:\.\d+)?/.source;
const timeRegExp = new RegExp(`^${[
  'w(?:eek(?:s)?)?',
  'd(?:ay(?:s)?)?',
  'h(?:our(?:s)?)?',
  'm(?:in(?:ute)?(?:s)?)?',
  's(?:ec(?:ond)?(?:s)?)?',
].map(unit => `(${numeric}${unit})?`).join('')}$`);

export const Time = {
  millisecond,
  second,
  minute,
  hour,
  day,
  week,
  sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  },
  template(template, date = new Date()) {
    if (typeof date === 'number') date = new Date(date);
    return template
      .replace('yyyy', date.getFullYear())
      .replace('yy', date.getFullYear().toString().slice(2))
      .replace('MM', p0(date.getMonth() + 1))
      .replace('dd', p0(date.getDate()))
      .replace('hh', p0(date.getHours()))
      .replace('mm', p0(date.getMinutes()))
      .replace('ss', p0(date.getSeconds()))
      .replace('SSS', p0(date.getMilliseconds(), 3));
  },
  format(ms, ex) {
    if (ex) {
      let seconds = Math.abs(ms) / 1000;
      const s = Math.floor(seconds % 60);
      seconds = seconds / 60;
      const m = Math.floor(seconds % 60);
      seconds = seconds / 60;
      const h = Math.floor(seconds);
      return `${p0(h)}:${p0(m)}:${p0(s)}`;
    }
    const abs = Math.abs(ms);
    if (abs >= day - hour / 2) {
      return Math.round(ms / day) + 'd';
    } else if (abs >= hour - minute / 2) {
      return Math.round(ms / hour) + 'h';
    } else if (abs >= minute - second / 2) {
      return Math.round(ms / minute) + 'm';
    } else if (abs >= second) {
      return Math.round(ms / second) + 's';
    }
    return ms + 'ms';
  },
  parseTime(source) {
    const capture = timeRegExp.exec(source);
    if (!capture) return 0;
    return (parseFloat(capture[1]) * week || 0) +
      (parseFloat(capture[2]) * day || 0) +
      (parseFloat(capture[3]) * hour || 0) +
      (parseFloat(capture[4]) * minute || 0) +
      (parseFloat(capture[5]) * second || 0);
  },
  startOfDay(timestamp = Date.now()) {
    return new Date(timestamp).setHours(0, 0, 0, 0);
  },
  startOfWeek(timestamp = Date.now()) {
    const day = new Date(timestamp).getDay();
    const passedDays = day === 0 ? 6 : day - 1;
    return this.startOfDay(timestamp) - this.day * passedDays;
  },
};

export const Random = {
  integer(min, max) {
    return Math.floor(Math.random() * (max - min + 1) + min);
  },
  create(min, max) {
    return () => Random.integer(min, max);
  },
  uuid() {
    const result = [];
    const hexDigits = '0123456789abcdef';
    for (let i = 0; i < 36; i++) {
      result[i] = hexDigits.substr(Math.floor(Math.random() * 0x10), 1);
    }
    result[14] = 4;
    result[19] = hexDigits.substr((result[19] & 0x3) | 0x8, 1);
    result[8] = result[13] = result[18] = result[23] = '-';
    return result.join('');
  },
  shuffle(arr) {
    const temp = arr.slice();
    const result = [];
    for (let i = temp.length; i > 0; --i) {
      result.push(temp.splice(Random.integer(0, i - 1), 1)[0]);
    }
    return result;
  },
  pick(arr, count = 1) {
    if (count > 1) {
      return Random.shuffle(arr).slice(0, count);
    }
    return arr[Random.integer(0, arr.length - 1)];
  },
};

function getTag(source) {
  return Object.prototype.toString.call(source);
}

export function isNullish(source) {
  return source === void 0 || source === null;
}

export function isNumber(source) {
  const value = +source;
  return Number.isFinite(value);
}

export function isString(source) {
  return typeof source === 'string';
}

export function isPrimitive(source) {
  return isNumber(source) || isString(source);
}

export function isFunction(source) {
  return typeof source === 'function';
}

export function isObject(source) {
  return typeof source === 'object';
}

export function isRegExp(source) {
  return getTag(source) === '[object RegExp]';
}

export function isMap(source) {
  return getTag(source) === '[object Map]';
}

export function isSet(source) {
  return getTag(source) === '[object Set]';
}

export function isArray(source) {
  return Array.isArray(source);
}

export function isEmpty(source) {
  if (isString(source) || isArray(source)) return !source.length;
  if (isMap(source) || isSet(source)) return !source.size;
  for (const key in source) {
    if (Object.prototype.hasOwnProperty.call(source, key)) {
      return false
    }
  }
  return true;
}

export function inRange(num, min, max) {
  return (num - min) * (num - max) <= 0;
}

export function isPowerOfTwo(n) {
  return Number.isInteger(n) && n > 0 && (n & (n - 1)) === 0;
}

export function* range(min, max, step = 1) {
  if (isNullish(max)) max = min, min = 0;
  for (let i = min; i < max; i += step) {
    yield i;
  }
}

export function* enumerate(iterable) {
  let i = 0;
  for (const value of iterable) {
    yield [i++, value];
  }
}

export function rounding(num, digits = 0, toFixed) {
  const value = Math.round(num * (10 ** digits)) / (10 ** digits);
  return toFixed ? value.toFixed(digits) : value;
}

export function flooring(num, digits = 0, toFixed) {
  const value = Math.floor(num * (10 ** digits)) / (10 ** digits);
  return toFixed ? value.toFixed(digits) : value;
}

export function ceiling(num, digits = 0, toFixed) {
  const value = Math.ceil(num * (10 ** digits)) / (10 ** digits);
  return toFixed ? value.toFixed(digits) : value;
}

export function debounce(callback, delay) {
  let timeout;
  return function() {
    clearTimeout(timeout);
    const [that, args] = [this, arguments];
    timeout = setTimeout(function() {
      callback.apply(that, args);
      clearTimeout(timeout);
      timeout = null;
    }, delay);
  }
}

export function throttle(callback, delay) {
  let timer;
  return function() {
    if (timer) { return; }
    const [that, args] = [this, arguments];
    timer = setTimeout(function() {
      clearTimeout(timer);
      timer = null;
      callback.apply(that, args);
    }, delay);
  }
}

export function pick(source, keys, forced) {
  if (!keys) return { ...source };
  const result = {};
  for (const key of keys) {
    if (forced || source[key] !== undefined) result[key] = source[key];
  }
  return result;
}

export function makeArray(source) {
  return Array.isArray(source) ? source : isNullish(source) ? [] : [source];
}

export function search(array, value, prop) {
  let beginning = 0;
  const len = array.length;
  let end = len;
  if (len > 0 && array[len - 1][prop] <= value) {
    return len - 1;
  }
  while (beginning < end) {
    let midPoint = Math.floor(beginning + (end - beginning) / 2);
    const event = array[midPoint];
    const nextEvent = array[midPoint + 1];
    if (event[prop] === value) {
      for (let i = midPoint; i < array.length; i++) {
        const testEvent = array[i];
        if (testEvent[prop] === value) {
          midPoint = i;
        }
      }
      return midPoint;
    } else if (event[prop] < value && nextEvent[prop] > value) {
      return midPoint;
    } else if (event[prop] > value) {
      end = midPoint;
    } else if (event[prop] < value) {
      beginning = midPoint + 1;
    }
  }
  return -1;
}

export function createElement(tag, props = {}, children) {
  if (Array.isArray(props) || props instanceof Element) {
    children = props;
    props = {};
  }
  children = makeArray(children);
  const el = document.createElement(tag);
  for (const [key, value] of Object.entries(props)) switch (key) {
    case 'classList':
      if (typeof value === 'string') {
        el.classList.add(...value.split(' '));
      } else el.classList.add(...value);
      break;
    case 'style':
    case 'dataset':
      for (const prop of Object.keys(value)) el[key][prop] = value[prop];
      break;
    default:
      if (key in el) el[key] = value;
      else el.setAttribute(key, value);
  }
  for (const child of children) el.appendChild(child);
  return el;
}

export function clearChildNodes(node) {
  for (let i = node.childNodes.length; i--;) node.removeChild(node.childNodes[i]);
}

export function compile(node, data) {
  const pattern = /\{\{\s*(\S+)\s*\}\}/;
  if (node.nodeType === 3) {
    let result;
    while (result = pattern.exec(node.nodeValue)) {
      const key = result[1];
      const value = key.split('.').reduce((p, c) => p[c], data);
      node.nodeValue = node.nodeValue.replace(pattern, value);
    }
    return;
  }
  node.childNodes.forEach(node => compile(node, data));
  return node;
}

export async function loadJSON(url) {
  return await fetch(url).then(res => res.json());
}

export async function loadImage(url) {
  const img = createElement('img');
  return new Promise((resolve, reject) => {
    img.onload = () => resolve(img);
    img.src = url;
  });
}

export function downloadFile(name, blob) {
  const url = URL.createObjectURL(blob);
  const link = createElement('a', { download: name, href: url });
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  Time.sleep(Time.second * 0.5).then(() => URL.revokeObjectURL(url));
}