import {
  $,
  $$,
  Time,
  isNullish,
  inRange,
  createElement,
  clearChildNodes,
  downloadFile,
} from '/src/utils.js';

function tempoToBPM(tempo) {
  return 6e7 / tempo;
}

const Type = {
  TEMPO: -2,
  PAGE: -1,
  CLICK: 0,
  HOLD: 1,
  LONG_HOLD: 2,
  LONG_HOLD_BODY: 2.5,
  DRAG: 3,
  DRAG_CHILD: 4,
  FLICK: 5,
  CLICK_DRAG: 6,
  CLICK_DRAG_CHILD: 7,
  DROP_CLICK: 8,
  DROP_DRAG: 9,
};

const container = $('container');
const loading = $('loading');
const progressPercentage = $('progress');
const progressCount = $('progress-count');
let statistic;

function preprocess({
  time_base,
  page_list,
  event_order_list,
  tempo_list,
  note_list,
}) {
  statistic = {
    page: {
      total: page_list.length,
      up: 0,
      down: 0,
    },
    tempo: {
      total: tempo_list.length,
      up: 0,
      down: 0,
    },
    event: {
      total: event_order_list.length,
      tempo: 0,
      ui: 0,
      text: 0,
    },
    note: {
      total: note_list.length,
      click: 0,
      hold: 0,
      long_hold: 0,
      drag: 0,
      drag_child: 0,
      flick: 0,
      click_drag: 0,
      click_drag_child: 0,
      left: 0,
      right: 0,
    },
  };
  
  const pages = [];
  let previousEndTick, previousPageScale, previousPageLength, previousPageLengthRatio = 2 / ((page_list[0].end_tick - page_list[0].start_tick) / time_base);
  for (let i = 0; i < page_list.length; i++) {
    let { start_tick, end_tick, scan_line_direction, PositionFunction } = page_list[i];
    if (start_tick < 0) start_tick = previousEndTick || 0;
    previousEndTick = end_tick;
    if (scan_line_direction === 1) {
      statistic.page.up++;
    } else if (scan_line_direction === -1) {
      statistic.page.down++;
    } else throw '谱面中存在不受支持的扫线方向。';
    const pageLength = end_tick - start_tick;
    if (isNullish(previousPageLength)) previousPageLength = pageLength;
    const pageLengthRatio = previousPageLength / pageLength * previousPageLengthRatio;
    let lengthChanged = false;
    if (pageLengthRatio !== previousPageLengthRatio) {
      lengthChanged = true;
      previousPageLengthRatio = pageLengthRatio;
    }
    const { Type: type, Arguments: args } = PositionFunction || { Type: 0, Arguments: [1, 0] };
    if (type !== 0 || !inRange(args[0], 0, 1) || !inRange(args[1], 1, -1)) throw '谱面中存在不受支持的页面参数。';
    const pageScale = args[0];
    let scaleChanged = false;
    if (isNullish(previousPageScale)) previousPageScale = pageScale;
    if (pageScale != previousPageScale) scaleChanged = true;
    pages.push({
      type: Type.PAGE,
      index: i,
      tick: start_tick,
      length: pageLength,
      end: start_tick + pageLength,
      lengthChanged,
      lengthRatio: pageLengthRatio,
      direction: scan_line_direction,
      PositionFunction: PositionFunction || { Type: 0, Arguments: [1, 0] },
      scaleChanged,
      bpmInPage: {},
    });
    previousPageScale = pageScale;
    previousPageLength = pageLength;
  }
  
  tempo_list.forEach((tempo, index) => {
    tempo.type = Type.TEMPO;
    const next = tempo_list[index + 1];
    tempo.length = (next ? next.tick : page_list[page_list.length - 1].end_tick) - tempo.tick;
    tempo.end = tempo.tick + tempo.length;
    if (next) statistic.tempo[next.value < tempo.value ? 'up' : 'down']++;
  });
  
  event_order_list.reduce((events, { event_list }) => {
    events.push(...event_list);
    return events;
  }, []).forEach(({ type }) => {
    if (inRange(type, 0, 1)) statistic.event.tempo++;
    if (inRange(type, 2, 7)) statistic.event.ui++;
    if (type === 8) statistic.event.text++;
  });
  
  note_list.forEach(({ type, id, next_id }) => {
    if (![Type.DRAG, Type.DRAG_CHILD, Type.CLICK_DRAG, Type.CLICK_DRAG_CHILD].includes(type)) return;
    if (next_id <= 0) return;
    note_list[next_id].previous_id = id;
  });
  
  for (const page of pages) {
    const tempoInPage = tempo_list.filter(tempo => (tempo.tick <= page.tick && tempo.end > page.tick) || (tempo.tick >= page.tick && tempo.tick < page.end));
    const { Arguments: args } = page.PositionFunction;
    if (page.lengthChanged || page.scaleChanged) page.bpmInPage[page.tick] = tempoToBPM(tempoInPage.shift().value) * page.lengthRatio * args[0];
    for (const tempo of tempoInPage) page.bpmInPage[tempo.tick] = tempoToBPM(tempo.value) * page.lengthRatio * args[0];
  }
  
  const longHolds = [];
  const addHoldBody = (id, tick, length, x, ended = false) => longHolds.push({
    id,
    type: Type.LONG_HOLD_BODY,
    tick,
    hold_tick: length,
    x,
    ended,
  });
  for (const { id, tick, x, page_index, hold_tick } of note_list.filter(note => note.type === Type.LONG_HOLD)) {
    if (tick + hold_tick > pages[page_index].end) {
      let ticks = hold_tick;
      let index = page_index;
      while (true) {
        const page = pages[index];
        if (index === page_index) {
          addHoldBody(id, tick, page.end - tick, x);
          ticks -= page.end - tick;
        } else if (page.tick + ticks <= page.end) {
          addHoldBody(id, page.tick, ticks, x, true);
          break;
        } else {
          addHoldBody(id, page.tick, page.end - page.tick, x);
          ticks -= page.length;
        }
        index++;
      }
    } else addHoldBody(id, tick, hold_tick, x, true);
  }
  
  return {
    pages,
    notes: note_list,
    longHolds,
  };
}

async function viewChart(chart) {
  try {
    const { pages, notes, longHolds } = preprocess(chart);
    
    progressPercentage.style.setProperty('--progress', '0%');
    progressCount.innerText = `0 / ${pages.length}`;
    loading.classList.remove('hidden');
    await Time.sleep(Time.second * 0.5);
    clearChildNodes(container);
    
    const top = 50;
    const bottom = 344;
    const height = bottom - top;
    const padding = 512 / 12;
    
    let previousPage, previousBPM = 0;
    for (let i = 0; i < pages.length; i++) {
      const page = pages[i];
      
      const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
      svg.setAttribute('viewBox', '0 0 512 384');
      
      svg.innerHTML += '<rect height="384" width="512" x="0" y="0" />';
      svg.innerHTML += `<text fill="#FFFFFF" font-family="Electrolize" font-size="24" font-weight="bold" text-anchor="start" dominant-baseline="hanging" x="10.24" y="7.68">${page.index}</text>`;
      
      const { Arguments: args } = page.PositionFunction;
      const h = args[0] * height;
      const p = (args[1] * -1 + 1) / 2;
      const y1 = height * p - h / 2 + top;
      const y2 = height * p + h / 2 + top;
      
      function getCoor(note, page) {
        const { Arguments: args } = page.PositionFunction;
        const h = args[0] * height;
        const p = (args[1] * -1 + 1) / 2;
        const y1 = height * p - h / 2 + top;
        const y2 = height * p + h / 2 + top;
        const pc = (note.tick - page.tick) / page.length;
        return [note.x * (512 - padding * 2) + padding, y1 + (y2 - y1) * (page.direction === 1 ? (1 - pc) : pc)];
      }
      
      const { bpmInPage } = page;
      const bpmTicks = Object.keys(bpmInPage);
      if (bpmTicks.length > 1) {
        const bpms = Object.values(bpmInPage);
        const bpmMax = Math.max(...bpms);
        const bpmMin = Math.min(...bpms);
        svg.innerHTML += `<text fill="#FFFFFF" font-family="Electrolize" font-size="16" font-weight="bold" text-anchor="end" dominant-baseline="hanging" x="409.6" y="7.68">MAX SCANLINE:</text>`;
        svg.innerHTML += `<text fill="#FFFFFF" font-family="Electrolize" font-size="16" font-weight="bold" text-anchor="end" dominant-baseline="hanging" x="501.76" y="7.68">${bpmMax > 9999.99 ? '9999.99+' : bpmMax.toFixed(2)}</text>`;
        svg.innerHTML += `<text fill="#FFFFFF" font-family="Electrolize" font-size="16" font-weight="bold" text-anchor="end" dominant-baseline="hanging" x="409.6" y="26.88">MIN SCANLINE:</text>`;
        svg.innerHTML += `<text fill="#FFFFFF" font-family="Electrolize" font-size="16" font-weight="bold" text-anchor="end" dominant-baseline="hanging" x="501.76" y="26.88">${bpmMin.toFixed(2)}</text>`;
      } else if (bpmTicks.length > 0) {
        const bpm = bpmInPage[bpmTicks[0]];
        svg.innerHTML += `<text fill="#FFFFFF" font-family="Electrolize" font-size="16" font-weight="bold" text-anchor="end" dominant-baseline="hanging" x="409.6" y="7.68">SCANLINE:</text>`;
        svg.innerHTML += `<text fill="#FFFFFF" font-family="Electrolize" font-size="16" font-weight="bold" text-anchor="end" dominant-baseline="hanging" x="501.76" y="7.68">${bpm > 9999.99 ? '9999.99+' : bpm.toFixed(2)}</text>`;
      } else throw '谱面的速度存在错误。';
      
      svg.innerHTML += '<line stroke="#FFFFFF" stroke-dasharray="1,20.2917" stroke-width="2" x1="0" x2="512" y1="50" y2="50" />';
      svg.innerHTML += '<line stroke="#FFFFFF" stroke-dasharray="1,20.2917" stroke-width="2" x1="0" x2="512" y1="344" y2="344" />';
      svg.innerHTML += `<line stroke="#FFFFFF" stroke-opacity="0.7" stroke-width="2" x1="0" x2="512" y1="${y1}" y2="${y1}" />`;
      svg.innerHTML += `<line stroke="#FFFFFF" stroke-opacity="0.7" stroke-width="2" x1="0" x2="512" y1="${y2}" y2="${y2}" />`;
      
      for (const tick of bpmTicks) {
        if (!inRange(tick, page.tick, page.end - 1)) continue;
        const bpm = bpmInPage[tick];
        if (bpm !== previousBPM) {
          const pc = (tick - page.tick) / page.length;
          const y = y1 + (page.direction === 1 ? (y2 - y1) * (1 - pc) : (y2 - y1) * pc);
          svg.innerHTML += `<line stroke="${bpm > previousBPM ? '#FF0000' : '#00FF00'}" stroke-opacity="0.5" stroke-width="2" x1="0" x2="512" y1="${y}" y2="${y}" />`;
          svg.innerHTML += `<text fill="${bpm > previousBPM ? '#FF0000' : '#00FF00'}" font-family="Electrolize" font-size="12" font-weight="bold" text-anchor="end" dominant-baseline="central" opacity="0.9" x="501.76" y="${y + page.direction * 10}">${bpm.toFixed(2)}</text>`;
        }
        previousBPM = bpm;
      }
      
      svg.innerHTML += `<defs><linearGradient id="${page.index}" x1="0" x2="0" y1="0" y2="1"><stop offset="0.1" stop-color="rgb(255,255,255)" /><stop offset="0.9" stop-color="rgb(255,255,255)" /></linearGradient></defs>`;
      if (page.direction === 1) {
        svg.innerHTML += `<polygon fill="url(#${page.index})" points="0,87 0,307 16,307 16,142 32,142" />`;
      } else {
        svg.innerHTML += `<polygon fill="url(#${page.index})" points="0,307 0,87 16,87 16,252 32,252" />`;
      }
      
      const ghost = document.createElementNS('http://www.w3.org/2000/svg', 'g');
      ghost.classList.add('ghost');
      ghost.setAttribute('opacity', '0.3');
      svg.appendChild(ghost);
      
      const noteGroup = document.createElementNS('http://www.w3.org/2000/svg', 'g');
      svg.appendChild(noteGroup);
      
      function drawNote(note) {
        if (note.x < 0.5) statistic.note.left++;
        else if (note.x > 0.5) statistic.note.right++;
        const [x, y] = getCoor(note, page);
        const hold = note.hold_tick / page.length * (y2 - y1);
        const endY = y + page.direction * -1 * hold;
        switch (note.type) {
          case Type.CLICK:
            statistic.note.click++;
            noteGroup.innerHTML += `<g class="note click"><circle cx="${x}" cy="${y}" fill="${page.direction === 1 ? 'rgb(175,198,206)' : 'rgb(175,190,206)'}" r="29" stroke="${page.direction === 1 ? 'rgb(23,24,34)' : 'rgb(23,24,34)'}" stroke-width="4"></circle><circle cx="${x}" cy="${y}" fill="${page.direction === 1 ? 'rgb(153,255,229)' : 'rgb(153,255,255)'}" r="20.5" stroke="${page.direction === 1 ? 'rgb(29,133,122)' : 'rgb(29,118,143)'}" stroke-width="5"></circle><circle cx="${x}" cy="${y}" fill="${page.direction === 1 ? 'rgb(204,255,242)' : 'rgb(204,255,255)'}" r="9"></circle>`;
            break;
          case Type.HOLD:
            statistic.note.hold++;
            noteGroup.innerHTML += `<g class="note hold"><line x1="${x}" x2="${x}" y1="${y}" y2="${endY}" stroke="rgb(255,255,255)" stroke-dasharray="4,4" stroke-width="23"></line><circle cx="${x}" cy="${y}" fill="rgb(255,255,255)" r="30" stroke="rgb(23,24,34)" stroke-width="6"></circle><rect fill="rgb(255,255,255)" height="4" width="66" x="${x - 33}" y="${y - 2}"></rect><circle cx="${x}" cy="${y}" fill="rgb(255,255,255)" r="19" stroke="${page.direction === 1 ? 'rgb(198,105,161)' : 'rgb(198,105,123)'}" stroke-width="6"></circle>`;
            break;
          case Type.LONG_HOLD:
            statistic.note.long_hold++;
            noteGroup.innerHTML += `<g class="note long-hold"><circle cx="${x}" cy="${y}" fill="rgb(255,255,255)" r="30" stroke="rgb(23,24,34)" stroke-width="6"></circle><rect x="${x - 34}" y="${y - 2}" height="4" width="67" fill="rgb(255,255,255)"></rect><circle cx="${x}" cy="${y}" fill="rgb(255,204,102)" r="22"></circle><rect x="${x - 7}" y="${y - 23}" height="46" width="14" fill="rgb(255,255,255)"></rect>`;
            break;
          case Type.LONG_HOLD_BODY:
            noteGroup.innerHTML += `<g class="long-hold-body"><line x1="${x - 15}" x2="${x - 15}" y1="${y}" y2="${endY}" stroke="rgb(255,255,255)" stroke-width="4"></line><line x1="${x + 15}" x2="${x + 15}" y1="${y}" y2="${endY}" stroke="rgb(255,255,255)" stroke-width="4"></line><line x1="${x}" x2="${x}" y1="${y}" y2="${endY}" stroke="rgb(255,204,102)" stroke-width="20" stroke-dasharray="4,4"></line>`;
            if (note.ended) noteGroup.innerHTML += `<line x1="${x - 20}" x2="${x + 20}" y1="${endY}" y2="${endY}" stroke="rgb(255,255,255)" stroke-width="5"></line>`;
            break;
          case Type.DRAG:
            statistic.note.drag++;
            noteGroup.innerHTML += `<g class="note drag"><circle cx="${x}" cy="${y}" fill="${page.direction === 1 ? 'rgb(182,180,203)' : 'rgb(172,180,203)'}" r="23" stroke="rgb(23,24,34)" stroke-width="3"></circle><circle cx="${x}" cy="${y}" fill="${page.direction === 1 ? 'rgb(170,102,255)' : 'rgb(246,102,255)'}" r="16" stroke="rgb(23,24,34)" stroke-width="4"></circle>`;
            break;
          case Type.DRAG_CHILD:
            statistic.note.drag_child++;
            noteGroup.innerHTML += `<g class="note drag-child"><circle cx="${x}" cy="${y}" fill="${page.direction === 1 ? 'rgb(182,180,203)' : 'rgb(172,180,203)'}" r="12" stroke="rgb(23,24,34)" stroke-width="2"></circle><circle cx="${x}" cy="${y}" fill="${page.direction === 1 ? 'rgb(170,102,255)' : 'rgb(246,102,255)'}" r="8" stroke="rgb(23,24,34)" stroke-width="2"></circle>`;
            break;
          case Type.FLICK:
            statistic.note.flick++;
            noteGroup.innerHTML += `<g class="note flick"><line x1="${x - 35}" x2="${x - 8}" y1="${y}" y2="${y + 28}" stroke="rgb(255,255,255)" stroke-width="2" /><line x1="${x - 35}" x2="${x - 8}" y1="${y}" y2="${y - 28}" stroke="rgb(255,255,255)" stroke-width="2" /><line x1="${x + 35}" x2="${x + 8}" y1="${y}" y2="${y + 28}" stroke="rgb(255,255,255)" stroke-width="2" /><line x1="${x + 35}" x2="${x + 8}" y1="${y}" y2="${y - 28}" stroke="rgb(255,255,255)" stroke-width="2" /><polygon points="${x - 5},${y - 24} ${x - 26},${y - 3} ${x - 26},${y + 3} ${x - 5},${y + 24} ${x + 5},${y + 24} ${x + 26},${y + 3} ${x + 26},${y - 3} ${x + 5},${y - 24}" fill="${page.direction === 1 ? 'rgb(39,191,141)' : 'rgb(41,170,220)'}" /><circle cx="${x}" cy="${y}" fill="rgb(255,255,255)" r="11" /><polygon points="${x - 8},${y - 7.5} ${x},${y - 15.5} ${x + 8},${y - 7.5} ${x + 8},${y + 7.5} ${x},${y + 15.5} ${x - 8},${y + 7.5}" fill="rgb(255,255,255)" /><rect x="${x - 2}" y="${y - 18}" fill="${page.direction === 1 ? 'rgb(39,191,141)' : 'rgb(41,170,220)'}" height="37" width="4" /><polygon points="${x - 2},${y - 28} ${x - 27},${y - 3} ${x - 27},${y + 3} ${x - 2},${y + 28} ${x - 2},${y + 23} ${x - 22},${y + 3} ${x - 22},${y - 3} ${x - 2},${y - 23}" fill="rgb(255,255,255)" /><polygon points="${x + 2},${y - 28} ${x + 27},${y - 3} ${x + 27},${y + 3} ${x + 2},${y + 28} ${x + 2},${y + 23} ${x + 22},${y + 3} ${x + 22},${y - 3} ${x + 2},${y - 23}" fill="rgb(255,255,255)" />`;
            break;
          case Type.CLICK_DRAG:
            statistic.note.click_drag++;
            noteGroup.innerHTML += `<g class="note click"><circle cx="${x}" cy="${y}" fill="${page.direction === 1 ? 'rgb(175,198,206)' : 'rgb(175,190,206)'}" r="29" stroke="${page.direction === 1 ? 'rgb(23,24,34)' : 'rgb(23,24,34)'}" stroke-width="4"></circle><circle cx="${x}" cy="${y}" fill="${page.direction === 1 ? 'rgb(153,255,229)' : 'rgb(153,255,255)'}" r="20.5" stroke="${page.direction === 1 ? 'rgb(29,133,122)' : 'rgb(29,118,143)'}" stroke-width="5"></circle><circle cx="${x}" cy="${y}" fill="${page.direction === 1 ? 'rgb(204,255,242)' : 'rgb(204,255,255)'}" r="9"></circle>`;
            break;
          case Type.CLICK_DRAG_CHILD:
            statistic.note.click_drag_child++;
            noteGroup.innerHTML += `<g class="note click-drag-child"><circle cx="${x}" cy="${y}" fill="rgb(175,190,206)" r="12" stroke="rgb(23,24,34)" stroke-width="2"></circle><circle cx="${x}" cy="${y}" fill="${page.direction === 1 ? 'rgb(153,255,229)' : 'rgb(153,255,255)'}" r="8" stroke="rgb(23,24,34)" stroke-width="2"></circle>`;
            break;
          default:
            throw '谱面中存在不受支持的音符类型。';
        }
        if (note.type === Type.DRAG) {
          const next = notes[note.next_id];
          if (next) {
            const [dx, dy] = getCoor(next, pages[next.page_index]);
            const angle = Math.atan2(dy - y, dx - x) * (180 / Math.PI);
            noteGroup.innerHTML += `<polygon points="${x - 8},${y + 6} ${x},${y} ${x + 8},${y + 6} ${x},${y - 8} " fill="${page.direction === 1 ? 'rgb(182,180,203)' : 'rgb(172,180,203)'}" transform="rotate(${angle + 90},${x},${y})" />`;
          }
        }
        noteGroup.innerHTML += `</g>`;
      }
      
      for (const note of longHolds) {
        if (inRange(note.tick, page.tick, page.end - 1)) drawNote(note);
      }
      
      const notesInPage = notes.filter(note => {
        if (note.page_index === page.index && !note.is_forward) return true;
        if (note.page_index === page.index + 1 && note.is_forward) return true;
        return false;
      }).reverse();
      
      for (const note of notesInPage) {
        if (note.type === Type.HOLD) drawNote(note);
      }
      
      const drags = notesInPage.filter(note => [Type.DRAG, Type.DRAG_CHILD, Type.CLICK_DRAG, Type.CLICK_DRAG_CHILD].includes(note.type)).reverse();
      for (const drag of drags) {
        const [dx1, dy1] = getCoor(drag, page);
        const previous = notes[drag.previous_id];
        if (previous && drag.tick > page.tick) {
          const [dx2, dy2] = getCoor(previous, pages[previous.page_index]);
          noteGroup.innerHTML += `<line class="drag-link" x1="${dx1}" x2="${dx2}" y1="${dy1}" y2="${dy2}" stroke="rgb(255,255,255)" stroke-dasharray="3,3" stroke-opacity="0.7" stroke-width="5"></line>`;
        }
        const next = notes[drag.next_id];
        if (next && next.tick === page.end && !next.is_forward) {
          const [dx3, dy3] = getCoor(next, pages[next.page_index]);
          noteGroup.innerHTML += `<line class="drag-link" x1="${dx1}" x2="${dx3}" y1="${dy1}" y2="${dy3}" stroke="rgb(255,255,255)" stroke-dasharray="3,3" stroke-opacity="0.7" stroke-width="5"></line>`;
        }
      }
      
      for (const note of notesInPage) {
        if (note.type !== Type.HOLD) drawNote(note);
      }
      
      if (previousPage) {
        previousPage.innerHTML += noteGroup.innerHTML;
      }
      previousPage = ghost;
      
      container.appendChild(createElement('div', { classList: ['chart'], dataset: { index: page.index } }, [svg]));
      progressPercentage.style.setProperty('--progress', `${(i + 1) / pages.length * 100}%`);
      progressCount.innerText = `${(i + 1)} / ${pages.length}`;
      await Time.sleep(0);
    }
    
    await Time.sleep(Time.second * 0.5);
  } catch (err) {
    clearChildNodes(container);
    alert(`谱面加载失败：\n${err}`);
    console.error(err)
  } finally {
    loading.classList.add('hidden');
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }
}

let svgFont;
container.addEventListener('click', async event => {
  const el = event.target;
  if (el.tagName !== 'svg') return;
  if (el.innerHTML.indexOf('@font-face') < 0) {
    if (!svgFont) svgFont = await fetch('/view/svg-font.txt').then(res => res.text());
    el.innerHTML = svgFont + el.innerHTML;
  }
  const cav = createElement('canvas', { width: 2048, height: 1536 });
  const ctx = cav.getContext('2d');
  const img = new Image(2048, 1536);
  img.src = `data:image/svg+xml;base64,${btoa(new XMLSerializer().serializeToString(el))}`;
  img.addEventListener('load', () => {
    ctx.drawImage(img, 0, 0, cav.width, cav.height);
    cav.toBlob(blob => downloadFile(`${Date.now()}.png`, blob));
  });
});

let showGhostNote = true;
$('switch-ghost').addEventListener('click', () => {
  const ghosts = $$('.ghost');
  if (!ghosts) return;
  showGhostNote = !showGhostNote;
  ghosts.forEach(ghost => ghost.setAttribute('opacity', showGhostNote ? '0.3' : '0'));
});

const cols = [1, 2, 3, 4, 6, 8];
let idx = 1;
const setChartBox = (charts, col) => charts.forEach(chart => {
  chart.style.padding = `${2 / col * 0.5}rem`;
  chart.style.width = `${100 / col}%`;
});
$('zoom-in').addEventListener('click', () => {
  const charts = $$('.chart');
  if (!charts) return;
  idx--;
  if (idx < 0) idx = 0;
  else setChartBox(charts, cols[idx]);
});
$('zoom-out').addEventListener('click', () => {
  const charts = $$('.chart');
  if (!charts) return;
  idx++;
  if (idx > cols.length - 1) idx = cols.length - 1;
  else setChartBox(charts, cols[idx]);
});

const fileInput = $('import-chart');
fileInput.addEventListener('click', () => fileInput.value = null);
fileInput.addEventListener('change', event => {
  const reader = new FileReader();
  reader.addEventListener('load', event => {
    showGhostNote = true;
    idx = 1;
    statistic = null;
    try {
      viewChart(JSON.parse(event.target.result));
    } catch (err) {
      alert('文件读取失败，可能是上传了错误的文件或谱面中存在当前不受支持的元素。');
    }
  });
  reader.readAsText(event.target.files[0]);
});

$('show-statistic').addEventListener('click', () => {
  if (!statistic) return;
  const { page, tempo, event, note } = statistic;
  alert(`页面总数：${page.total}\n上行页面数：${page.up}\n下行页面数：${page.down}\n\n速度总数：${tempo.total}\n加速次数：${tempo.up}\n减速次数：${tempo.down}\n\n事件总数：${event.total}\n速度变化事件数：${event.tempo}\nUI事件数：${event.ui}\n自定义文字事件数：${event.text}\n\n音符总数：${note.total}\nClick音符数：${note.click}\nHold音符数：${note.hold}\nLong Hold音符数：${note.long_hold}\nDrag头节点音符数：${note.drag}\nDrag子节点音符数：${note.drag_child}\nFlick音符数：${note.flick}\nC-Drag头节点音符数：${note.click_drag}\nC-Drag子节点音符数：${note.click_drag_child}\n左侧音符数：${note.left}\n右侧音符数：${note.right}`);
});

$('jump-to-page').addEventListener('click', async () => {
  if (!statistic) return;
  const input = prompt('请输入要跳转到的页面');
  if (isNullish(input)) return;
  const page = Number(input);
  if (isNaN(page) || !inRange(page, 0, statistic.page.total)) return alert('请输入正确的页码！');
  await Time.sleep(Time.second * 0.5);
  const node = $$(`.chart[data-index="${page}"]`);
  window.scrollTo({
    top: node.offsetTop + node.offsetHeight * 0.5 - window.innerHeight / 2,
    behavior: 'smooth',
  });
});