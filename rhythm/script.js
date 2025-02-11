import {
  $,
  $$,
  isPowerOfTwo,
  rounding,
  pick,
  search,
  createElement,
  clearChildNodes,
  downloadFile,
} from '/src/utils.js';
import convertToC2 from './convert.js';
import preprocess from './preprocess.js';

function createEventElement(tick, innerText, classList, icon) {
  const element = createElement('div', { dataset: { tick } });
  element.appendChild(createElement('span', { innerText: 'Tick：' + tick }));
  element.appendChild(createElement('span', { classList: 'value', innerText }));
  element.appendChild(createElement(
    'span',
    createElement(
      'span', { classList: 'button small ' + classList },
      createElement('i', {
        classList: icon,
        style: { 'pointer-events': 'none' },
      }),
    ),
  ));
  return element;
}

const Type = {
  TEMPO: -2,
  PAGE: -1,
  CLICK: 0,
  HOLD: 1,
  LONG_HOLD: 2,
  DRAG: 3,
  DRAG_CHILD: 4,
  FLICK: 5,
  CLICK_DRAG: 6,
  CLICK_DRAG_CHILD: 7,
  DROP_CLICK: 8,
  DROP_DRAG: 9,
};

const colors = [];
colors[2] = '#0100A4';
colors[3] = '#015B03';
colors[4] = '#0100A4';
colors[5] = '#610336';
colors[6] = '#015B03';
colors[7] = '#472788';
colors[8] = '#FE0000';
colors[9] = '#3A6C6B';
colors[10] = '#8E2874';
colors[12] = '#FE6F06';
colors[14] = '#7D3ED3';
colors[16] = '#0075FF';
colors[18] = '#059C73';
colors[20] = '#FF4292';
colors[24] = '#72FE2C';
colors[32] = '#2CFCFE';
colors[48] = '#FFFF66';

const indexes = [...colors.keys()].filter(index => colors[index] !== undefined);

const bases = [0.25, 0.375, 0.3125, 0.4375, 0.5625, 0.6875, 0.8125, 0.9375];
const chartInfo = $('chart-info');
const eventList = $('event-list');
const audioContext = new AudioContext();

const Hitsound = new class {
  audioContext;
  audioBuffer;
  gainNode;

  constructor(audioContext) {
    this.audioContext = audioContext || new AudioContext();
    this.gainNode = this.audioContext.createGain();
    this.gainNode.connect(this.audioContext.destination);
    this.volume = 3;
    fetch('./tapfx_default.wav').then(res => res.arrayBuffer()).then(ab => Hitsound.load(ab));
  }

  get volume() {
    return this.gainNode.gain.value;
  }

  set volume(value) {
    this.gainNode.gain.value = value;
  }

  async load(arrayBuffer) {
    this.audioBuffer = await this.audioContext.decodeAudioData(arrayBuffer)
      .catch(() => alert('打击音加载失败。请选择正确的音频文件。'));
  }

  play() {
    if (!this.audioBuffer) return;
    const audioSource = this.audioContext.createBufferSource();
    audioSource.buffer = this.audioBuffer;
    audioSource.connect(this.gainNode);
    audioSource.start();
  }
}(audioContext);

class Renderer {
  app;
  cav = createElement('canvas');
  ctx = this.cav.getContext('2d');
  v1;
  v2;
  offsetX;
  noteY;
  lineWidth;
  lineLengths;
  noteRadius;
  pixelsPerTick = 0;
  maxFps = 75;
  renderLoop;
  loopFunc;

  vid = createElement('video', { style: { display: 'none' } });

  constructor(app) {
    this.app = app;
    this.init(app);
    this.resize();
    this.reset();
  }

  get width() {
    return this.cav.width;
  }

  set width(value) {
    this.cav.width = value;
  }

  get height() {
    return this.cav.height;
  }

  set height(value) {
    this.cav.height = value;
  }

  loadVideo(arrayBuffer) {
    return new Promise(resolve => {
      const { vid } = this;
      vid.src = URL.createObjectURL(new Blob([new Uint8Array(arrayBuffer)]));
      vid.load();
      vid.addEventListener('loadeddata', async () => {
        vid.volume = 0;
        const vw = vid.videoWidth;
        const vh = vid.videoHeight;
        const vAspectRatio = vw / vh;
        const hSpace = this.height - this.v1;
        let x, y, w, h;
        if (vAspectRatio > this.width / hSpace) {
          w = this.width;
          h = w / vAspectRatio;
          x = 0;
          y = (hSpace - h) / 2;
        } else {
          h = hSpace;
          w = h / (1 / vAspectRatio);
          y = 0;
          x = (this.width - w) / 2;
        }
        Object.assign(vid, { x, y, w, h });
        resolve();
      });
    });
  }

  init(app) {
    this.width = 1920;
    this.height = 1080;
    this.v1 = this.height / 6;
    this.v2 = this.height / 24;
    this.noteRadius = this.width / 56;
    this.offsetX = this.v1 + this.noteRadius * 2;
    this.noteY = this.height - this.v2 * 2.5;
    this.lineWidth = this.width / 480;
    this.lineLengths = [this.v2 * 1.5, this.noteRadius * 1.35, this.lineWidth];

    let clickTimer;
    this.cav.addEventListener('click', () => {
      if (clickTimer) {
        clearTimeout(clickTimer);
        clickTimer = null;
        app.stop();
      } else {
        clickTimer = setTimeout(() => {
          clickTimer = null;
          app.playing ? app.pause() : app.play();
        }, 250);
      }
    });

    $('fullscreen').addEventListener('click', () => {
      if (document.fullscreenElement === null) {
        if (!this.cav.requestFullscreen) return;
        this.cav.requestFullscreen({ navigationUI: 'hide' }).catch(() => {});
      } else {
        document.exitFullscreen();
      }
    });

    const importVideo = $('import-video');
    importVideo.addEventListener('click', () => {
      importVideo.value = null;
      URL.revokeObjectURL(this.vid.src);
    });
    importVideo.addEventListener('change', event => {
      const [file] = event.target.files;
      const reader = new FileReader();
      reader.addEventListener('load', async e => {
        await this.loadVideo(e.target.result);
        await this.vid.play();
        await this.vid.pause();
        this.vid.currentTime = 0;
        alert('视频加载完成。');
      });
      reader.readAsArrayBuffer(file);
    });

    const container = $('container');
    container.appendChild(this.vid);
    container.appendChild(this.cav);

    window.addEventListener('resize', this.resize.bind(this));
  }

  resize() {
    const cw = document.documentElement.clientWidth;
    const ch = document.documentElement.clientHeight;
    const cAspectRatio = cw / ch;

    if (cAspectRatio > 1) {
      this.cav.style.height = ch + 'px';
      this.cav.style.width = ch / 9 * 16 + 'px';
    } else {
      this.cav.style.width = '100%';
      this.cav.style.height = 'auto';
    }
  }

  drawInfo(currentTime, { time, bpmDisplay, color }) {
    const { ctx, height, v1, v2, lineWidth } = this;

    const length = v1 - lineWidth * 2;
    ctx.fillStyle = '#F0F0F0';
    ctx.fillRect(0, height - v1, v1, v1);
    ctx.fillStyle = '#252525';
    ctx.fillRect(lineWidth, height - v1 + lineWidth, length, length);

    const size = v2;
    ctx.fillStyle = '#FFFFFF';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'alphabetic';
    ctx.font = `bold ${size * 0.5}px Electrolize`;
    ctx.fillText('BPM', v1 / 2, height - v1 / 2 - size * 0.525 / 2);
    const text = bpmDisplay > 999 ? '>999' : bpmDisplay;
    ctx.font = `bold ${size}px Electrolize`;
    ctx.fillText(text, v1 / 2, height - v1 / 2 + size * 1.3 / 2);
    const passed = currentTime - time;
    if (passed < 0) return;
    if (passed < 150) {
      ctx.fillStyle = `rgb(${color})`;
      ctx.fillText(text, v1 / 2, height - v1 / 2 + size * 1.3 / 2);
      return;
    }
    if (passed < 500) {
      const percent = 1 - (passed - 150) / 350;
      ctx.fillStyle = `rgba(${color}, ${percent})`;
      ctx.fillText(text, v1 / 2, height - v1 / 2 + size * 1.3 / 2);
    }
  }

  drawNotes(currentTick, currentPosition, notes, index) {
    const { ctx, width, height, offsetX, noteY, lineWidth, noteRadius } = this;

    for (let i = index; i < notes.length; i++) {
      const note = notes[i];
      if (note.tick < currentTick) {
        note.played = true;
        Hitsound.play();
      }
      const x = offsetX + note.x - currentPosition;
      if (x - noteRadius > width) break;
      if (x + noteRadius < 0) continue;
      let c;

      ctx.beginPath();
      if (note.dotted) {
        ctx.moveTo(x, noteY - noteRadius);
        ctx.lineTo(x - noteRadius, noteY);
        ctx.lineTo(x, noteY + noteRadius);
        ctx.lineTo(x + noteRadius, noteY);
        ctx.lineTo(x, noteY - noteRadius);
        c = noteRadius * Math.sqrt(2) / 4;
      } else {
        ctx.arc(x, noteY, noteRadius, 0, 2 * Math.PI, false);
        c = Math.PI * noteRadius * 2 / 16;
      }
      ctx.closePath();
      ctx.fillStyle = note.color;
      ctx.fill();
      ctx.lineWidth = lineWidth;
      ctx.strokeStyle = '#FFFFFF';
      ctx.setLineDash(note.dashed ? [c, c] : []);
      ctx.stroke();
      if (note.dashed) ctx.setLineDash([]);

      ctx.textAlign = 'center';
      ctx.textBaseline = 'top';

      if (note.mark) {
        const size = height / 36;
        ctx.fillStyle = '#FFFFFF';
        ctx.font = `bold ${size}px Electrolize`;
        ctx.fillText(note.mark, x, noteY + noteRadius / 2 - size);
      }

      if (note.durationText) {
        const size = height / 32;
        ctx.fillStyle = note.dotted ? '#FC2222' : '#252525';
        ctx.font = `bold ${size}px Electrolize`;
        ctx.fillText(note.durationText, x, height - size * 1.1);
      }

      if (Number.isFinite(note.id)) {
        ctx.fillStyle = '#FFFFFF';
        ctx.font = `bold ${height / 32}px Electrolize`;
        ctx.fillText(note.id, x, height - this.v2 * 5);
      }
    }
  }

  drawTrack(currentTick, currentPosition, lines, index) {
    const { ctx, width, height, v1, v2, offsetX, noteY, lineWidth, lineLengths, noteRadius } = this;

    ctx.fillStyle = '#252525';
    ctx.fillRect(0, height - v1, width, v1);
    ctx.fillStyle = '#F0F0F0';
    ctx.fillRect(0, height - v2, width, v2);

    for (let i = index; i < lines.length; i++) {
      const line = lines[i];
      const x = offsetX + line.x - currentPosition;
      if (x > width) break;
      if (x < 0) continue;
      ctx.beginPath();
      ctx.moveTo(x, noteY - lineLengths[line.type]);
      ctx.lineTo(x, noteY + lineLengths[line.type]);
      ctx.closePath();
      ctx.strokeStyle = '#F0F0F0';
      ctx.stroke();
    }

    ctx.beginPath();
    ctx.arc(offsetX, height - v2 * 2.5, noteRadius * 1.35, 0, 2 * Math.PI, false);
    ctx.closePath();
    ctx.lineWidth = lineWidth;
    ctx.strokeStyle = '#FFFFFF';
    ctx.stroke();
  }

  drawVideoFrame() {
    const { vid, ctx } = this;
    const { videoWidth, videoHeight, x, y, w, h } = vid;
    ctx.drawImage(vid, 0, 0, videoWidth, videoHeight, x, y, w, h);
  }

  drawBackground() {
    this.ctx.fillStyle = '#000000';
    this.ctx.fillRect(0, 0, this.width, this.height);
  }

  clear() {
    this.ctx.clearRect(0, 0, this.width, this.height);
  }

  pause() {
    const { vid } = this;
    if (vid.readyState !== 0 && !vid.paused) vid.pause();
    cancelAnimationFrame(this.renderLoop);
  }

  reset() {
    cancelAnimationFrame(this.renderLoop);
    this.renderLoop = this.loopFunc = null;
    this.vid.pause();
    this.vid.currentTime = 0;
    this.clear();
    this.drawBackground();
    this.drawTrack(0, 0, [], 0);
    this.drawInfo(0, { time: 0, bpmDisplay: 0, color: '255, 255, 255' });
  }

  render(
    currentTime,
    currentTick,
    currentPosition,
    currentTempo,
    ...args
  ) {
    this.clear();
    this.drawBackground();
    if (this.vid.readyState !== 0) this.drawVideoFrame();
    this.drawTrack(currentTick, currentPosition, args.shift(), args.shift());
    this.drawNotes(currentTick, currentPosition, args.shift(), args.shift());
    this.drawInfo(currentTime, currentTempo);
  }
}

const App = new class {
  chartLoaded = false;
  timeBase = 0;
  tempos = [];
  timeRatios = {};
  lines = [];
  eventElements = {};
  notes = [];
  renderer = new Renderer(this);
  totalTicks = 0;
  startTime = 0;
  passedTime;
  lastNoteIndex = 0;
  lastLineIndex = 0;
  offset = -1000;
  lastRatioInput = 4;

  constructor() {
    const importChart = $('import-chart');
    importChart.addEventListener('click', () => {
      importChart.value = null;
      this.stop();
    });
    importChart.addEventListener('change', event => {
      const reader = new FileReader();
      reader.addEventListener('load', event => {
        try {
          let chart;
          try {
            chart = JSON.parse(event.target.result);
          } catch (error) {
            const { pageSize, c2chart } = convertToC2(event.target.result);
            this.loadChart(c2chart, 1);
            this.applyTimeRatiosC1(pageSize);
          }
          if (chart) this.loadChart(chart, 1);
        } catch (error) {
          alert('谱面加载失败。可能是上传了错误的文件或是谱面中存在不受支持的元素。');
        }
      });
      reader.readAsText(event.target.files[0]);
    });

    $('set-offset').addEventListener('click', () => {
      const input = prompt('设置谱面延迟（单位：毫秒）：', -this.offset);
      if (!/^-?\d+$/.test(input)) return this.offset = 0;
      this.offset = Number(input) * -1;
    });

    const importData = $('import-data');
    importData.addEventListener('click', () => {
      importData.value = null;
      this.stop();
    });
    importData.addEventListener('change', event => {
      const reader = new FileReader();
      reader.addEventListener('load', event => {
        try {
          const data = JSON.parse(event.target.result);
          data.forEach(({ tick, value }) => {
            this.addTimeRatio(tick, value);
          });
          this.applyTimeRatios();
          alert('导入成功。');
        } catch {
          Object.values(this.timeRatios).forEach(({ tick }) => this.removeTimeRatio(tick, false));
          alert('请选择正确的数据文件。');
        }
      });
      reader.readAsText(event.target.files[0]);
    });

    $('export').addEventListener('click', () => {
      const trs = Object.values(this.timeRatios).sort((a, b) => a.tick - b.tick).map(tr => pick(tr, ['tick', 'value']));
      if (!trs.length) return alert('没有可导出的数据。');
      downloadFile('time_ratios.json', new Blob([JSON.stringify(trs)], { type: 'application/json' }));
    });

    $('apply').addEventListener('click', () => {
      this.stop();
      this.applyTimeRatios();
      alert('成功应用更改。');
    });

    eventList.addEventListener('click', event => {
      let { dataset: { tick } } = event.target.parentElement.parentElement;
      tick = Number(tick);

      if (event.target.classList.contains('add-time-ratio')) {
        this.addTimeRatio(tick);
      }

      if (event.target.classList.contains('remove-time-ratio')) {
        this.removeTimeRatio(tick);
      }
    });
  }

  addTimeRatio(tick, value) {
    function getValue(value) {
      const input = prompt('请输入倍率（该值表示时基的几倍为一小节）：', value);
      if (!/^(\d+(?:\.\d+)?)$/.test(input)) return null;
      value = Number(input);
      if (bases.some(n => isPowerOfTwo(value / n))) return value;
      return alert('不支持太过复杂和罕见的节拍。');
    }

    const tr = this.timeRatios[tick];
    value = value || getValue(tr ? tr.value : this.lastRatioInput);
    if (!value) return;

    if (tr) {
      tr.value = value;
      $$(tr.element, '.value').innerText = '倍率：' + value;
      return;
    }

    this.lastRatioInput = value;
    const anchor = this.eventElements[tick];
    $$(anchor, 'i').classList.replace('ti-plus', 'ti-pencil');
    const element = createEventElement(tick, '倍率：' + value, 'remove-time-ratio', 'ti-trash');
    eventList.insertBefore(element, anchor.nextSibling);
    this.timeRatios[tick] = { tick, value, element };
  }

  removeTimeRatio(tick, needConfirm = true) {
    if (!this.timeRatios[tick]) return;
    if (needConfirm && !confirm('确定要删除吗？')) return;
    this.timeRatios[tick].element.remove();
    delete this.timeRatios[tick];
    const anchor = this.eventElements[tick];
    $$(anchor, 'i').classList.replace('ti-pencil', 'ti-plus');
  }

  applyTimeRatios() {
    const { timeBase, renderer: { pixelsPerTick }, totalTicks, timeRatios } = this;
    const trs = Object.values(timeRatios).sort((a, b) => a.tick - b.tick);
    const lines = [];
    const fallback = { tick: totalTicks };
    const primaryStep = timeBase / 4;

    trs.forEach((tr, i) => {
      const next = trs[i + 1] || fallback;
      const step = timeBase * tr.value;
      for (let tick = tr.tick; tick < next.tick; tick += step) {
        lines.push({ tick, x: tick * pixelsPerTick, type: 0 });
      }
    });

    if (!lines.find(({ tick }) => tick === totalTicks)) {
      lines.push({ tick: totalTicks, x: totalTicks * pixelsPerTick, type: 0 });
    }

    lines.slice().forEach((line, i) => {
      const next = lines[i + 1] || fallback;
      let p = 0;
      for (let tick = line.tick; tick < next.tick; tick += primaryStep) {
        const x = tick * pixelsPerTick;
        lines.push({ tick, x, type: p++ % 4 ? 2 : 1 });
      }
    });

    this.lines = lines.sort((a, b) => a.tick - b.tick);
  }

  applyTimeRatiosC1(pageSize) {
    const { renderer: { pixelsPerTick }, totalTicks, timeRatios } = this;
    const lines = [];
    for (let tick = 0; tick < totalTicks; tick += pageSize) {
      lines.push({ tick, x: tick * pixelsPerTick, type: 0 });
    }
    this.lines = lines.sort((a, b) => a.tick - b.tick);
  }

  get playing() {
    return !this.passedTime && !!this.startTime;
  }

  currentTime() {
    return Date.now() - this.startTime;
  }

  currentTick(index) {
    return this.msToTick(this.currentTime(), index);
  }

  tickToMs(tick, index = search(this.tempos, tick, 'tick')) {
    if (index !== -1) {
      const tempo = this.tempos[index];
      const elapsedBeats = (tick - tempo.tick) / this.timeBase;
      return tempo.time + (60 / tempo.bpm) * elapsedBeats * 1e3;
    } else {
      const beats = tick / this.timeBase;
      return (60 / this.tempos[0].bpm) * beats * 1e3;
    }
  }

  msToTick(ms, index = search(this.tempos, ms, 'time')) {
    if (index !== -1) {
      const tempo = this.tempos[index];
      const elapsedBeats = (ms - tempo.time) / 1e3 / (60 / tempo.bpm);
      return Math.round(tempo.tick + elapsedBeats * this.timeBase);
    } else {
      const beats = ms / (60 / this.tempos[0].bpm * 1e3);
      return Math.round(beats * this.timeBase);
    }
  }

  play() {
    if (!this.chartLoaded) return;
    if (this.playing) return;

    if (this.passedTime) {
      this.startTime = Date.now() - this.passedTime;
      this.passedTime = 0;
    } else {
      if (this.offset) {
        this.passedTime = this.offset;
        return this.play();
      }
      this.startTime = Date.now();
      this.lastNoteIndex = 0;
    }

    const { renderer } = this;
    let lastTime = 0;
    renderer.loopFunc = time => {
      if (time - lastTime < 1000 / (renderer.maxFps + 2)) {
        renderer.renderLoop = requestAnimationFrame(renderer.loopFunc);
        return;
      }

      const currentTempoIndex = search(this.tempos, this.currentTime(), 'time');
      const currentTick = this.currentTick(currentTempoIndex);
      const currentPosition = currentTick * this.renderer.pixelsPerTick;
      const currentTempo = this.tempos[currentTempoIndex] || this.tempos[0];

      while (this.lastNoteIndex < this.notes.length) {
        if (!this.notes[this.lastNoteIndex].played) break;
        this.lastNoteIndex++;
      }

      while (this.lastLineIndex < this.lines.length) {
        if (renderer.offsetX + this.lines[this.lastLineIndex].x - currentPosition > 0) break;
        this.lastLineIndex++;
      }

      renderer.render(
        this.currentTime(),
        currentTick,
        currentPosition,
        currentTempo,
        this.lines,
        this.lastLineIndex,
        this.notes,
        this.lastNoteIndex,
      );

      /* if (currentTick > this.totalTicks) {
        this.stop();
        return;
      } */

      lastTime = time;
      renderer.renderLoop = requestAnimationFrame(renderer.loopFunc);
    };
    renderer.renderLoop = requestAnimationFrame(time => {
      renderer.loopFunc(time);
      if (renderer.vid.readyState === 0) return;
      renderer.vid.play();
    });
  }

  pause() {
    if (!this.playing) return;
    this.passedTime = this.currentTime();
    this.renderer.pause();
  }

  stop() {
    this.notes.forEach(note => delete note.played);
    this.lastNoteIndex = this.lastLineIndex = this.startTime = this.passedTime = 0;
    this.renderer.reset();
  }

  loadChart({
    time_base,
    page_list,
    tempo_list,
    note_list,
  }, ratio) {
    this.timeRatios = {};
    this.lines = [];
    this.eventElements = {};
    clearChildNodes(eventList);

    this.timeBase = time_base *= ratio;
    this.totalTicks = page_list[page_list.length - 1].end_tick;
    $$(chartInfo, '.value').innerText = time_base;
    chartInfo.classList.remove('hidden');

    const plcs = [{ type: Type.PAGE, tick: 0, length: page_list[0].end_tick }];
    let lastPageLength = page_list[0].end_tick;
    page_list.forEach(({ start_tick, end_tick }) => {
      const length = end_tick - start_tick;
      if (length === lastPageLength) return;
      plcs.push({ type: Type.PAGE, tick: start_tick, length: lastPageLength = length });
    });

    this.renderer.pixelsPerTick = this.renderer.noteRadius / (time_base / 8);

    tempo_list.sort((a, b) => a.tick - b.tick)
      .forEach(tempo => {
        tempo.type = Type.TEMPO;
        tempo.bpm = 6e7 / tempo.value / ratio;
        tempo.bpmDisplay = rounding(tempo.bpm, 2);
      });
    let currentTime = 0;
    let lastBeats = 0;
    tempo_list.forEach((tempo, index) => {
      const lastBPM = index > 0 ? tempo_list[index - 1].bpm : tempo_list[0].bpm;
      const beats = tempo.tick / time_base - lastBeats;
      const elapsedMiliseconds = (60 / lastBPM) * beats * 1e3;
      tempo.time = elapsedMiliseconds + currentTime;
      currentTime = tempo.time;
      lastBeats += beats;
      if (lastBPM < tempo.bpm) tempo.color = '255, 51, 51';
      else if (lastBPM > tempo.bpm) tempo.color = '51, 255, 51';
      else tempo.color = '255, 255, 255';
    });
    this.tempos = tempo_list;

    const tickMap = {};
    this.notes = note_list.filter(note => {
      const isDragChild = [Type.DRAG_CHILD, Type.CLICK_DRAG_CHILD, Type.DROP_DRAG].includes(note.type);
      if (isDragChild) return false;
      if (tickMap[note.tick]) {
        tickMap[note.tick].types.push(note.type);
        tickMap[note.tick].multiple = true;
        return false;
      } else {
        tickMap[note.tick] = note;
        note.types = [note.type];
        return true;
      }
    }).map((note, i) => {
      note = pick(note, ['tick', 'multiple', 'types']);
      note.x = note.tick * this.renderer.pixelsPerTick;
      note.time = this.tickToMs(note.tick);
      if (note.types?.every(type => [Type.DRAG, Type.HOLD, Type.LONG_HOLD].includes(type))) {
        note.dashed = true;
        delete note.types;
      }
      return note;
    }).sort((a, b) => a.tick - b.tick);
    this.notes.forEach((note, index) => {
      const neighbors = [this.notes[index - 1], this.notes[index + 1]]
        .filter(Boolean)
        .map(n => Math.abs(note.tick - n.tick));
      const nearest = Math.min(...neighbors);
      const maxLimit = this.msToTick(this.tickToMs(note.tick) + 5) - note.tick;
      let num = 1;

      function updateAddend() {
        const result = num % 2 === 0 ? -num / 2 : (num + 1) / 2;
        return num++, result;
      }

      function resetWithColor(color) {
        delete note.durationText;
        delete note.mark;
        delete note.dotted;
        note.color = color;
      }

      function parseRhythm(interval) {
        let v = time_base / interval * 4;
        if (!Number.isInteger(v)) {
          const o = v * 3 / 2;
          if (Number.isInteger(o)) {
            note.dotted = true;
            note.durationText = o + '.';
            v = o;
          } else if (Math.abs(interval - nearest) < maxLimit) {
            return parseRhythm(nearest + updateAddend());
          } else {
            if (!Number.isFinite(v)) {
              log(note.tick, v);
            } else if (v.toString().split('.')[1].length > 8) {
              v = Math.round(v);
              note.durationText = '' + v;
            }
          }
        } else note.durationText = '' + v;

        if (v < 2) {
          resetWithColor('#505050');
          return;
        }

        if (note.color = colors[v]) {
          for (const i of [3, 5, 7, 9]) {
            if (v % i === 0) note.mark = '' + i;
          }
          return;
        }

        resetWithColor('#9F9F9F');
      }

      parseRhythm(nearest);
    });

    plcs.concat(this.tempos).sort((a, b) => {
      if (a.tick === b.tick) return a.type === Type.PAGE ? 1 : -1;
      else return a.tick - b.tick;
    }).forEach(({ type, tick, length, bpm }) => {
      const innerText = type === Type.PAGE ? '页长：' + length : 'BPM：' + rounding(bpm, 2);
      const element = createEventElement(tick, innerText, 'add-time-ratio', 'ti-plus');
      eventList.appendChild(element);
      const oldElement = this.eventElements[tick];
      if (oldElement) {
        $$(oldElement, '.button').style.visibility = 'hidden';
      }
      this.eventElements[tick] = element;
    });

    this.chartLoaded = true;
  }
};