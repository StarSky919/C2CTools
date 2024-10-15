function preprocess(txt) {
  const chartArray = txt
    .replace(/[^\.\_A-Z0-9a-z\n]/g, ' ').split('\n')
    .map(line => line = line.trim().split(' '));
  const noteList = [];
  const dragList = [];
  let pageShift, pageSize;
  for (const el of chartArray) {
    switch (el[0]) {
      case 'PAGE_SHIFT':
        pageShift = Number(el[1]);
        break;
      case 'PAGE_SIZE':
        pageSize = Number(el[1]);
        break;
      case 'NOTE':
        const [index, time, x, holdTime] = el.slice(1).map(Number);
        noteList.push({ index, time, x, holdTime });
        break;
      case 'LINK':
        dragList.push(el.slice(1).map(Number).sort((a, b) => a - b));
        break;
      default:
        continue;
    }
  }
  if (!noteList.length) throw new Error();
  return {
    pageShift,
    pageSize,
    noteList: noteList.sort((a, b) => a.index - b.index),
    dragList,
  };
}

class Chart {
  time_base = 480;
  page_list = [];
  tempo_list = [];
  event_order_list = [];
  note_list = [];
  lastNoteID = 0;

  constructor(totalTime, bpm) {
    this.tempo_list.push({ tick: 0, value: 6e7 / bpm });
    this.page_list.push({
      start_tick: 0,
      end_tick: Math.ceil(this.secToTick(totalTime)) + 1920,
      scan_line_direction: 1,
    });
  }

  tickToSec(tick) {
    const bpm = 6e7 / this.tempo_list[0].value;
    const elapsedBeats = tick / this.time_base;
    return (60 / bpm) * elapsedBeats;
  }

  secToTick(sec) {
    const bpm = 6e7 / this.tempo_list[0].value;
    const elapsedBeats = sec / (60 / bpm);
    return elapsedBeats * this.time_base;
  }

  addNote(time, x, holdTime) {
    this.note_list.push({
      page_index: 0,
      type: holdTime ? 1 : 0,
      id: this.lastNoteID++,
      tick: Math.round(this.secToTick(time)),
      x,
      has_sibling: false,
      hold_tick: Math.round(this.secToTick(holdTime)),
      next_id: 0,
      is_forward: false,
    });
  }

  toJSON() {
    const { time_base, page_list, tempo_list, event_order_list, note_list } = this;
    return {
      format_version: 0,
      start_offset_time: 0,
      time_base,
      page_list,
      tempo_list,
      event_order_list,
      note_list,
    };
  }
}

export default function(chart) {
  const {
    pageShift,
    pageSize,
    noteList,
    dragList,
  } = preprocess(chart);

  const firstNote = noteList.at(0);
  const lastNote = noteList.at(-1);
  let bpm = 6e7 / (pageSize * 1e6) * 2;
  if (bpm < 100) bpm *= 2;
  if (bpm > 250) bpm /= 2;
  const c2chart = new Chart(lastNote.time + lastNote.holdTime, bpm);
  dragList.forEach(([, ...childs]) => {
    childs.forEach(index => noteList[noteList.findIndex(note => note && note.index === index)] = null);
  });
  noteList.filter(Boolean).forEach(({ time, x, holdTime }) => c2chart.addNote(time + pageShift, x, holdTime));

  return {
    pageSize: c2chart.secToTick(pageSize),
    c2chart,
  };
};