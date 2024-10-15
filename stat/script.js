import {
  $,
  $$,
  Time,
  bindOnClick,
  createElement,
  compile,
  clearChildNodes,
  loadJSON,
  createTaskRunner
} from '/src/utils.js';
import Datastore from '/src/datastore.js';
import { Dialog, ItemSelectorDialog } from '/src/dialog.js';

try {
  localStorage.setItem('test', true);
  localStorage.removeItem('test');
} catch (err) {
  Dialog.show('localStorage API发生错误！\n如果您打开了浏览器的无痕（隐私）模式，\n请将它关闭并刷新页面。', '错误');
}

const filterInfo = $('filter-info');
const chartList = $('list');
const chartTemplate = $('template');

window.storage = new Datastore('c2ct:');

async function main() {
  const fetchData = () => loadJSON('https://c2info.starsky919.xyz/assets/c2data.json');

  let { characters, songs } = storage.get('c2data', {});

  function updateData(data) {
    characters = data.characters;
    songs = data.songs;
    storage.set('c2data', data);
  }

  if (!songs) await fetchData().then(updateData);
  else fetchData().then(updateData);

  const notesData = await loadJSON('./notes.json');
  const diffKeys = ['easy', 'hard', 'chaos', 'glitch', 'crash', 'dream', 'drop'];
  const diffNames = diffKeys.map(k => k.toUpperCase());
  const types = [['click', 'drop_click'], ['hold', 'long_hold'], ['drag', 'drag_child', 'drop_drag'], ['click_drag', 'click_drag_child'], ['flick']];
  const typesDisplay = ['CLICK', 'HOLD', 'DRAG', 'C-DRAG', 'FLICK'];

  function processNpData(dataType, difficulty, noteType) {
    const key = ['count', 'percentage'][dataType];
    const result = [];
    for (const { id } of songs) {
      difficulty.map(d => diffKeys[d]).forEach(k1 => {
        const data = notesData[k1];
        let total = 0;
        let valid = true;
        noteType.forEach(k2 => {
          types[k2].forEach(k3 => {
            const chart = data[k3].find(c => c.id === id);
            if (!chart) return valid = false;
            total += chart[key];
          });
        });
        if (valid) result.push({ id, difficulty: k1, value: dataType === 1 ? (total * 100).toFixed(2) : total });
      });
    }
    return result.sort((a, b) => a.value - b.value);
  }

  const loadCharts = createTaskRunner(async shouldStop => {
    clearChildNodes(chartList);
    const dataType = storage.get('data-type', 0);
    const difficulty = storage.get('difficulty', [2]);
    const noteType = storage.get('note-type', [0]);
    const reverse = storage.get('reverse', true);
    filterInfo.innerText = '已选难度：' + difficulty.map(d => diffNames[d]).join('、');
    filterInfo.innerText += '\n已选音符：' + noteType.map(t => typesDisplay[t]).join('、');
    const data = processNpData(dataType, difficulty, noteType);
    if (reverse) data.reverse();
    for (let i = 0; i < data.length; i++) {
      if (shouldStop()) break;
      const { id, difficulty, value } = data[i];
      const { name, character: cid } = songs.find(s => s.id === id);
      const character = characters.find(c => c.id === cid);
      const chartBox = compile(chartTemplate.content.cloneNode(true).children[0], {
        name,
        difficulty: difficulty.toUpperCase(),
        data: value,
      });
      chartBox.style.setProperty('--character-theme', character.theme_color);
      $$(chartBox, '.difficulty').classList.add(difficulty);
      chartList.appendChild(chartBox);
      if (i % 9 === 0) await Time.sleep(0);
    }
  });

  bindOnClick('data-type', (texts => {
    const dataTypeDisplay = $$('#data-type span');
    let i = storage.get('data-type', 0);
    dataTypeDisplay.innerText = texts[i];

    return event => {
      i = ++i % texts.length;
      storage.set('data-type', i);
      dataTypeDisplay.innerText = texts[i];
      loadCharts();
    };
  })(['数量', '百分比']));

  bindOnClick('difficulty', event => {
    new ItemSelectorDialog({ settingName: 'difficulty', multiple: true, defaultValue: [2] })
      .title('选择难度')
      .setItem(diffNames.map((text, id) => ({ id, text })))
      .onConfirm(loadCharts)
      .show();
  });

  bindOnClick('note-type', event => {
    new ItemSelectorDialog({ settingName: 'note-type', multiple: true, defaultValue: [0] })
      .title('选择音符类型')
      .setItem(typesDisplay.map((text, id) => ({ id, text })))
      .onConfirm(loadCharts)
      .show();
  });

  bindOnClick('ordering', (getText => {
    const orderingDisplay = $$('#ordering span');
    let i = storage.get('reverse', true);
    orderingDisplay.innerText = getText(i);

    return event => {
      i = !i;
      storage.set('reverse', i);
      orderingDisplay.innerText = getText(i);
      loadCharts();
    };
  })(reverse => reverse ? '降序' : '升序'));

  loadCharts();
}

main().catch(err => console.error(err));