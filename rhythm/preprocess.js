import {
  rounding,
  pick,
  search,
} from '/src/utils.js';

function bpmDisplay(value) {
  return rounding(6e7 / value, 2);
}

export default function({
  page_list,
  tempo_list,
  event_order_list,
  note_list,
  ...rest
}) {
  const tempos = tempo_list.toSorted((a, b) => a.tick - b.tick);

  function process(targetTick, ratio) {
    const index = tempos.findIndex(({ tick, value }) => tick === targetTick);
    const curr = tempos.at(index);
    const next = tempos.at(index + 1);
    const nextTick = next.tick;
    curr.value /= ratio;
    next.tick = (next.tick - curr.tick) * ratio + curr.tick;
    const diff = next.tick - nextTick;

    for (let i = index + 2; i < tempos.length; i++) {
      const t = tempos.at(i);
      t.tick += diff;
    }

    for (const note of note_list) {
      if (note.tick < curr.tick) continue;
      if (note.tick >= nextTick) {
        note.tick += diff;
        continue;
      }
      note.tick = (note.tick - curr.tick) * ratio + curr.tick;
      note.hold_tick *= ratio;
    }

    for (const event of event_order_list) {
      if (event.tick < curr.tick) continue;
      if (event.tick >= nextTick) {
        event.tick += diff;
        continue;
      }
      event.tick = (event.tick - curr.tick) * ratio + curr.tick;
    }

    for (const page of page_list) {
      if (page.end_tick <= curr.tick) continue;
      if (page.start_tick >= nextTick) {
        page.start_tick += diff;
        page.end_tick += diff;
        continue;
      }
      page.start_tick = (page.start_tick - curr.tick) * ratio + curr.tick;
      page.end_tick = (page.end_tick - curr.tick) * ratio + curr.tick;
    }
  }

  process(28800, 0.5);
  process(44160, 2);
  process(115200, 0.5);

  for (let i = 0; i < tempos.length - 1; i++) {
    const curr = tempos.at(i);
    const next = tempos.at(i + 1);
    if (bpmDisplay(next.value) === bpmDisplay(curr.value)) {
      next.discard = true;
    }
  }

  return Object.assign(rest,{
    page_list,
    tempo_list: tempos.filter(({ discard }) => !discard),
    event_order_list,
    note_list,
  });
}