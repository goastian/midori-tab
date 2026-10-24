<script>
import { h } from 'vue';

const shapes = {
  settings: [
    'M12.22 2h-.44a2 2 0 0 0-2 2v.18a2 2 0 0 1-1 1.73l-.43.25a2 2 0 0 1-2 0l-.15-.08a2 2 0 0 0-2.73.73l-.22.38a2 2 0 0 0 .73 2.73l.15.1a2 2 0 0 1 1 1.72v.51a2 2 0 0 1-1 1.74l-.15.09a2 2 0 0 0-.73 2.73l.22.38a2 2 0 0 0 2.73.73l.15-.08a2 2 0 0 1 2 0l.43.25a2 2 0 0 1 1 1.73V20a2 2 0 0 0 2 2h.44a2 2 0 0 0 2-2v-.18a2 2 0 0 1 1-1.73l.43-.25a2 2 0 0 1 2 0l.15.08a2 2 0 0 0 2.73-.73l.22-.39a2 2 0 0 0-.73-2.73l-.15-.08a2 2 0 0 1-1-1.74v-.5a2 2 0 0 1 1-1.74l.15-.09a2 2 0 0 0 .73-2.73l-.22-.38a2 2 0 0 0-2.73-.73l-.15.08a2 2 0 0 1-2 0l-.43-.25a2 2 0 0 1-1-1.73V4a2 2 0 0 0-2-2z',
    ['circle', { cx: '12', cy: '12', r: '3' }],
  ],
  sliders: [
    ['line', { x1: '21', x2: '14', y1: '4', y2: '4' }],
    ['line', { x1: '10', x2: '3', y1: '4', y2: '4' }],
    ['line', { x1: '21', x2: '12', y1: '12', y2: '12' }],
    ['line', { x1: '8', x2: '3', y1: '12', y2: '12' }],
    ['line', { x1: '21', x2: '16', y1: '20', y2: '20' }],
    ['line', { x1: '12', x2: '3', y1: '20', y2: '20' }],
    ['line', { x1: '14', x2: '14', y1: '2', y2: '6' }],
    ['line', { x1: '8', x2: '8', y1: '10', y2: '14' }],
    ['line', { x1: '16', x2: '16', y1: '18', y2: '22' }],
  ],
  grid: [
    ['rect', { x: '3', y: '3', width: '7', height: '7', rx: '1.5' }],
    ['rect', { x: '14', y: '3', width: '7', height: '7', rx: '1.5' }],
    ['rect', { x: '3', y: '14', width: '7', height: '7', rx: '1.5' }],
    ['rect', { x: '14', y: '14', width: '7', height: '7', rx: '1.5' }],
  ],
  palette: [
    'M12 3a9 9 0 0 0 0 18h1.35a1.65 1.65 0 0 0 0-3.3h-.6a1.75 1.75 0 0 1 0-3.5H16a5 5 0 0 0 5-5C21 5.78 17.24 3 12 3Z',
    ['circle', { cx: '7.5', cy: '10', r: '.8', fill: 'currentColor', stroke: 'none' }],
    ['circle', { cx: '10', cy: '6.8', r: '.8', fill: 'currentColor', stroke: 'none' }],
    ['circle', { cx: '14.2', cy: '6.6', r: '.8', fill: 'currentColor', stroke: 'none' }],
    ['circle', { cx: '17.1', cy: '9.3', r: '.8', fill: 'currentColor', stroke: 'none' }],
  ],
  globe: [
    ['circle', { cx: '12', cy: '12', r: '9' }],
    'M3 12h18',
    'M12 3a14 14 0 0 1 0 18',
    'M12 3a14 14 0 0 0 0 18',
  ],
  store: [
    'm2 7 4.41-4.41A2 2 0 0 1 7.83 2h8.34a2 2 0 0 1 1.42.59L22 7',
    'M4 12v8a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-8',
    'M15 22v-4a2 2 0 0 0-2-2h-2a2 2 0 0 0-2 2v4',
    'M2 7h20',
    'M22 7v3a2 2 0 0 1-2 2 2.7 2.7 0 0 1-1.59-.63.7.7 0 0 0-.82 0A2.7 2.7 0 0 1 16 12a2.7 2.7 0 0 1-1.59-.63.7.7 0 0 0-.82 0A2.7 2.7 0 0 1 12 12a2.7 2.7 0 0 1-1.59-.63.7.7 0 0 0-.82 0A2.7 2.7 0 0 1 8 12a2.7 2.7 0 0 1-1.59-.63.7.7 0 0 0-.82 0A2.7 2.7 0 0 1 4 12a2 2 0 0 1-2-2V7',
  ],
  minus: [
    'M5 12h14',
  ],
  search: [
    ['circle', { cx: '11', cy: '11', r: '8' }],
    'm21 21-4.3-4.3',
  ],
  edit: [
    'M12 20h9',
    'M16.5 3.5a2.12 2.12 0 0 1 3 3L7 19l-4 1 1-4Z',
  ],
  trash: [
    'M3 6h18',
    'M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2',
    'M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6',
    'M10 11v6',
    'M14 11v6',
  ],
  grip: [
    ['circle', { cx: '9', cy: '5', r: '1', fill: 'currentColor', stroke: 'none' }],
    ['circle', { cx: '15', cy: '5', r: '1', fill: 'currentColor', stroke: 'none' }],
    ['circle', { cx: '9', cy: '12', r: '1', fill: 'currentColor', stroke: 'none' }],
    ['circle', { cx: '15', cy: '12', r: '1', fill: 'currentColor', stroke: 'none' }],
    ['circle', { cx: '9', cy: '19', r: '1', fill: 'currentColor', stroke: 'none' }],
    ['circle', { cx: '15', cy: '19', r: '1', fill: 'currentColor', stroke: 'none' }],
  ],
  close: [
    'M18 6 6 18',
    'm6 6 12 12',
  ],
  reset: [
    'M3 12a9 9 0 1 0 3-6.7L3 8',
    'M3 3v5h5',
  ],
  weather: [
    'M16 16.5a4.5 4.5 0 0 0-8.8-1.3A3.5 3.5 0 1 0 6.5 22H16a2.75 2.75 0 0 0 0-5.5Z',
    'M13 3v2',
    'm18.7 5.3-1.4 1.4',
    'M21 11h-2',
    'M7 11H5',
    'm8.7 6.7-1.4-1.4',
    'M17.5 13A4.5 4.5 0 0 0 9 9',
  ],
  currency: [
    'M7 7h11l-3-3',
    'm18 7-3 3',
    'M17 17H6l3 3',
    'm6 17 3-3',
  ],
  bookmark: [
    'M6 3h12a1 1 0 0 1 1 1v17l-7-4-7 4V4a1 1 0 0 1 1-1Z',
  ],
  privacy: [
    'M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10Z',
    'm9 12 2 2 4-4',
  ],
  calendar: [
    ['rect', { x: '3', y: '5', width: '18', height: '16', rx: '2' }],
    'M16 3v4',
    'M8 3v4',
    'M3 10h18',
  ],
  notes: [
    'M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8Z',
    'M14 2v6h6',
    'M8 13h8',
    'M8 17h5',
  ],
  todo: [
    ['rect', { x: '3', y: '3', width: '18', height: '18', rx: '3' }],
    'm8 12 2.5 2.5L16 9',
  ],
  rss: [
    ['circle', { cx: '5', cy: '19', r: '1', fill: 'currentColor', stroke: 'none' }],
    'M4 11a9 9 0 0 1 9 9',
    'M4 4a16 16 0 0 1 16 16',
  ],
  plus: [
    'M5 12h14',
    'M12 5v14',
  ],
};

export default {
  name: 'DashboardIcon',
  props: {
    name: { type: String, default: 'plus' },
    size: { type: [Number, String], default: 20 },
    strokeWidth: { type: [Number, String], default: 2 },
  },
  render() {
    const icon = Object.hasOwn(shapes, this.name) ? shapes[this.name] : shapes.plus;
    return h('svg', {
      xmlns: 'http://www.w3.org/2000/svg',
      width: this.size,
      height: this.size,
      viewBox: '0 0 24 24',
      fill: 'none',
      stroke: 'currentColor',
      'stroke-width': this.strokeWidth,
      'stroke-linecap': 'round',
      'stroke-linejoin': 'round',
    }, icon.map(shape => typeof shape === 'string' ? h('path', { d: shape }) : h(shape[0], shape[1])));
  },
};
</script>
