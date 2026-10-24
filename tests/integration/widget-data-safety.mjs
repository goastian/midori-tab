import assert from 'node:assert/strict';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

const ENTER = '\uE007';
const CONTROL = '\uE009';
const KEYS = { todos: 'midori_todos', notes: 'midori_notes', events: 'midori_calendar_events',
  bookmarks: 'midori_bookmarks', categories: 'midori_bookmark_categories' };

function installFaults() {
  const area = globalThis.browser?.storage?.local;
  if (!area) return;
  const table = () => { try { return JSON.parse(localStorage.getItem('__integration_faults') || '{}'); } catch { return {}; } };
  const consume = (kind, keys) => {
    const faults = table();
    const key = keys.find(name => faults[kind]?.[name] > 0);
    if (!key) return false;
    faults[kind][key] -= 1;
    localStorage.setItem('__integration_faults', JSON.stringify(faults));
    return true;
  };
  const names = keys => (typeof keys === 'string' ? [keys] : Array.isArray(keys) ? keys : Object.keys(keys || {}));
  const get = area.get.bind(area);
  const set = area.set.bind(area);
  area.get = async keys => {
    if (consume('failRead', names(keys))) throw new Error('integration: storage read failed');
    return get(keys);
  };
  window.__integrationWrites = [];
  area.set = async payload => {
    window.__integrationWrites.push(...Object.keys(payload).filter(key => /^midori_(todos|notes|calendar_events|bookmarks|bookmark_categories)$/.test(key)));
    if (consume('failWrite', names(payload))) throw new Error('QUOTA_BYTES quota exceeded (integration)');
    if (consume('failWriteOther', names(payload))) throw new Error('integration: write failed');
    return set(payload);
  };
  // While sessionStorage.__partition is "on" this tab does not hear about other tabs' writes.
  const partitioned = () => sessionStorage.getItem('__partition') === 'on';
  const addListener = window.addEventListener.bind(window);
  window.addEventListener = (type, listener, options) => (type === 'storage'
    ? addListener(type, event => { if (!partitioned()) listener(event); }, options)
    : addListener(type, listener, options));
  const changed = globalThis.browser.storage.onChanged;
  const addChanged = changed.addListener.bind(changed);
  changed.addListener = listener => addChanged((...args) => { if (!partitioned()) listener(...args); });
}

/** Copies a fault injector in front of the real storage API of an installed package copy. */
export function instrumentStorageFaultFixture(directory) {
  const file = join(directory, 'index.html');
  const html = readFileSync(file, 'utf8');
  assert.match(html, /<head>/i);
  writeFileSync(file, html.replace(/<head>/i, '<head><script src="/integration-storage-faults.js"></script>'));
  writeFileSync(join(directory, 'integration-storage-faults.js'), `(${installFaults.toString()})();\n`);
}

const sleep = (page, ms) => page.evaluate(delay => new Promise(resolve => setTimeout(resolve, delay)), ms);

async function setFaults(page, faults) {
  await page.evaluate(value => localStorage.setItem('__integration_faults', JSON.stringify(value)), faults);
}

async function stored(page, key) {
  return page.evaluate(async name => (await (globalThis.browser || globalThis.chrome).storage.local.get(name))[name]?.value ?? null, key);
}

async function waitForStored(page, key, predicate, label, timeout = 8000) {
  const deadline = Date.now() + timeout;
  let value;
  do {
    value = await stored(page, key);
    if (predicate(value)) return value;
    await sleep(page, 60);
  } while (Date.now() < deadline);
  assert.fail(`${label}: ${JSON.stringify(value)}`);
}

async function seed(page, records, { mirror = true } = {}) {
  await page.evaluate(async ({ values, withMirror }) => {
    const api = globalThis.browser || globalThis.chrome;
    const payload = Object.fromEntries(Object.entries(values).map(([key, value]) => [key,
      { value, updatedAt: Date.now(), __midoriStorageVersion: 1, origin: 'integration-seed' }]));
    await api.storage.local.set(payload);
    for (const key of Object.keys(values)) localStorage.removeItem(key);
    if (withMirror) for (const [key, value] of Object.entries(payload)) localStorage.setItem(key, JSON.stringify(value));
  }, { values: records, withMirror: mirror });
}

async function configure(page) {
  await page.evaluate(() => {
    localStorage.setItem('tabStore', JSON.stringify({ theme: 'dark', autoTheme: false, density: 'comfortable',
      background: { type: 'Solid', default: false, color: '#10201b' }, showAds: false, showSpeedDials: true,
      speedDialSize: 'tiny', speedDialColumns: 7, speedDialLimit: 8, showAddSpeedDialButton: true,
      showSpeedDialDeleteButton: true, widgetsEnabled: true, widgetColumns: 3, openLink: 'Self Tab' }));
    localStorage.setItem('widgetsStore', JSON.stringify({ enabled: { search: true, privacy: false, todo: true, notes: true, calendar: true },
      order: ['search', 'todo', 'notes', 'calendar'] }));
    localStorage.setItem('i18nStore', JSON.stringify({ locale: 'en' }));
    localStorage.removeItem('midori_boot_snapshot_v1');
  });
}

async function open(session, ready = ['todo', 'notes', 'calendar', 'bookmarks']) {
  const page = await session.context.newPage();
  await page.goto(session.url);
  await page.waitForFunction(() => Number.isFinite(window.__midoriPerf?.marks?.['interaction-ready']));
  for (const name of ready) {
    await page.waitForFunction(widget => document.querySelector(widget.selector), { selector: ({
      todo: '.todo-input:not([disabled])', notes: '.notes-area:not([disabled])',
      calendar: '.cal-agenda .cal-primary-btn:not([disabled])', bookmarks: '.tab-btn:not([disabled])' })[name] }, { timeout: 20_000 });
  }
  return page;
}

async function openBroken(session, selector) {
  const page = await session.context.newPage();
  await page.goto(session.url);
  await page.waitForFunction(() => Number.isFinite(window.__midoriPerf?.marks?.['interaction-ready']));
  await page.waitForFunction(value => document.querySelector(value), selector, { timeout: 20_000 });
  return page;
}

const status = page => page.evaluate(() => [...document.querySelectorAll('.save-status')].map(node => node.textContent.trim().replace(/\s+/g, ' ')));
const todoTexts = page => page.evaluate(() => [...document.querySelectorAll('.todo-item .todo-text')].map(node => node.textContent));
const waitForTodos = (page, expected) => page.waitForFunction(list => JSON.stringify([...document.querySelectorAll('.todo-item .todo-text')].map(node => node.textContent)) === JSON.stringify(list), expected, { timeout: 10_000 });
const waitForStatus = (page, text) => page.waitForFunction(value => [...document.querySelectorAll('.save-status')].some(node => node.textContent.includes(value)), text, { timeout: 10_000 });

async function addTodo(page, text) {
  await page.fill('.todo-input', `${text}${ENTER}`);
}

async function today(page) {
  return page.evaluate(() => {
    const now = new Date();
    const pad = value => String(value).padStart(2, '0');
    return `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;
  });
}

async function createEvent(page, title) {
  await page.click('.cal-agenda .cal-primary-btn');
  await page.waitForFunction(() => document.querySelector('.cal-form-panel .cal-input'));
  await page.fill('.cal-form-panel .cal-input[type="text"]', title);
  await page.click('.cal-form-actions .cal-primary-btn');
  await page.waitForFunction(() => !document.querySelector('.cal-form-panel'));
}

const eventTitles = page => page.evaluate(() => [...document.querySelectorAll('.cal-event-card .cal-event-title')].map(node => node.firstChild.textContent.trim()));
const waitForEvents = (page, expected) => page.waitForFunction(list => JSON.stringify([...document.querySelectorAll('.cal-event-card .cal-event-title')].map(node => node.firstChild.textContent.trim())) === JSON.stringify(list), expected, { timeout: 10_000 });

export async function runWidgetDataSafetyIntegration(session, { outputDir } = {}) {
  if (outputDir) mkdirSync(outputDir, { recursive: true });
  const report = { passed: false, cases: [] };
  const pass = id => report.cases.push({ id, passed: true });
  const pages = new Set();
  const track = page => { pages.add(page); return page; };
  const close = async page => { pages.delete(page); await page.close(); };
  try {
    const setup = track(await session.context.newPage());
    await setup.goto(session.url);
    await setup.waitForFunction(() => Number.isFinite(window.__midoriPerf?.marks?.['interaction-ready']));
    await configure(setup);
    const day = await today(setup);

    // NT-09: a failed read must neither overwrite nor lose the stored events.
    const events = [
      { id: 'evt-one', title: 'First stored event', date: day, time: '09:00', location: '', notes: '', reminderMinutes: 0, notifiedAt: null },
      { id: 'evt-two', title: 'Second stored event', date: day, time: '10:30', location: 'Room', notes: 'Bring notes', reminderMinutes: 0, notifiedAt: null },
    ];
    await seed(setup, { [KEYS.events]: events }, { mirror: false });
    await setFaults(setup, { failRead: { [KEYS.events]: 1 } });
    let page = track(await openBroken(session, '.cal-agenda .cal-primary-btn'));
    await waitForStatus(page, 'Could not read your saved data');
    assert.equal(await page.evaluate(() => document.querySelector('.cal-agenda .cal-primary-btn').disabled), true, 'Editing must stay disabled until the events are loaded');
    assert.deepEqual(await eventTitles(page), []);
    assert.deepEqual(await stored(page, KEYS.events), events, 'A failed read must not write anything');
    await close(page);
    await sleep(setup, 300);
    assert.deepEqual(await stored(setup, KEYS.events), events, 'Closing during a failed read must not write an empty list');
    pass('calendar-failed-read-blocks-saving-and-keeps-events');

    await setFaults(setup, { failRead: { [KEYS.events]: 1 } });
    page = track(await openBroken(session, '.cal-agenda .cal-primary-btn'));
    await waitForStatus(page, 'Could not read your saved data');
    await page.click('.save-status__retry');
    await waitForEvents(page, ['First stored event', 'Second stored event']);
    assert.equal(await page.evaluate(() => document.querySelector('.cal-agenda .cal-primary-btn').disabled), false);
    assert.deepEqual((await stored(page, KEYS.events)).map(event => event.title), ['First stored event', 'Second stored event']);
    pass('calendar-retry-loads-without-losing-events');

    // NT-11: ids and revisions appear once, content/order/dates stay, and ids are stable between loads.
    const migrated = await waitForStored(page, KEYS.events, list => list?.every(event => event.id && event.rev), 'Migrated events need revisions');
    assert.deepEqual(migrated.map(event => [event.id, event.title, event.date, event.time, event.location, event.notes]),
      events.map(event => [event.id, event.title, event.date, event.time, event.location, event.notes]));
    await close(page);

    // Calendar: statuses, undo and restoring the deleted event.
    page = track(await open(session, ['calendar']));
    await createEvent(page, 'Created in this tab');
    await waitForStatus(page, 'Saved');
    await waitForStored(page, KEYS.events, list => list?.some(event => event.title === 'Created in this tab'), 'The new event must reach storage');
    await page.evaluate(() => [...document.querySelectorAll('.cal-event-card')]
      .find(card => card.querySelector('.cal-event-title').firstChild.textContent.trim() === 'Second stored event').querySelector('.cal-ghost-btn.danger').click());
    await page.waitForFunction(() => document.querySelector('.undo-toast'));
    await waitForEvents(page, ['First stored event', 'Created in this tab']);
    await page.click('.undo-toast__action');
    await waitForEvents(page, ['First stored event', 'Created in this tab', 'Second stored event']);
    const restored = await waitForStored(page, KEYS.events, list => list?.length === 3, 'The restored event must be saved again');
    const returned = restored.find(event => event.id === 'evt-two');
    assert.ok(returned, 'The deleted event returns with its original id');
    assert.deepEqual([returned.title, returned.time, returned.location, returned.notes], ['Second stored event', '10:30', 'Room', 'Bring notes'], 'The content returns with the event');
    pass('calendar-undo-restores-event-id-and-content');

    await setFaults(page, { failWrite: { [KEYS.events]: 1_000_000 } });
    await createEvent(page, 'Kept while the write fails');
    await waitForStatus(page, 'Storage is full');
    assert.ok((await eventTitles(page)).includes('Kept while the write fails'), 'The event stays visible after a failed save');
    await setFaults(page, {});
    await page.click('.save-status__retry');
    await waitForStatus(page, 'Saved');
    await waitForStored(page, KEYS.events, list => list?.some(event => event.title === 'Kept while the write fails'), 'Retry must write the kept event');
    pass('calendar-failed-write-keeps-event-and-retry-saves-it');
    await close(page);
    await close(setup);

    // NT-10 / NT-11 / NT-13 for tasks: legacy data, hide, close, failed writes.
    const base = track(await session.context.newPage());
    await base.goto(session.url);
    await base.waitForFunction(() => Number.isFinite(window.__midoriPerf?.marks?.['interaction-ready']));
    await seed(base, { [KEYS.todos]: [{ text: 'Buy milk', done: true }, { text: 'Call home', done: false }, { text: 'Buy milk', done: false }] });
    await close(base);
    page = track(await open(session, ['todo']));
    await waitForTodos(page, ['Buy milk', 'Call home', 'Buy milk']);
    const todos = await waitForStored(page, KEYS.todos, list => list?.every(item => item.id && item.rev), 'Tasks need ids and revisions');
    assert.deepEqual(todos.map(item => [item.text, item.done]), [['Buy milk', true], ['Call home', false], ['Buy milk', false]], 'Migration keeps content and order');
    assert.equal(new Set(todos.map(item => item.id)).size, 3, 'Repeated tasks get different ids');
    await close(page);
    page = track(await open(session, ['todo']));
    assert.deepEqual((await waitForStored(page, KEYS.todos, list => list?.length === 3, 'Tasks persist')).map(item => item.id), todos.map(item => item.id), 'Ids must not change between loads');
    pass('todo-migration-keeps-content-order-and-stable-ids');

    await addTodo(page, 'Saved on hide');
    const hidden = await page.evaluate(async () => {
      const api = globalThis.browser || globalThis.chrome;
      const started = performance.now();
      const measured = await api.tabs.getCurrent();
      const covering = await api.tabs.create({ windowId: measured.windowId, url: 'about:blank', active: true });
      await new Promise(resolve => {
        if (document.visibilityState === 'hidden') { resolve(); return; }
        document.addEventListener('visibilitychange', function changed() {
          if (document.visibilityState !== 'hidden') return;
          document.removeEventListener('visibilitychange', changed);
          resolve();
        });
      });
      const written = (await api.storage.local.get('midori_todos')).midori_todos?.value?.some(item => item.text === 'Saved on hide');
      const elapsed = performance.now() - started;
      await api.tabs.update(measured.id, { active: true });
      await api.tabs.remove(covering.id);
      return { written, elapsed };
    });
    assert.ok(hidden.elapsed < 650, `The probe must run before the debounce delay, took ${hidden.elapsed} ms`);
    assert.equal(hidden.written, true, 'Hiding the page must write the last edit before the debounce delay');
    pass('todo-last-edit-written-when-page-is-hidden');

    await addTodo(page, 'Saved on close');
    await close(page);
    page = track(await open(session, ['todo']));
    await waitForStored(page, KEYS.todos, list => list?.some(item => item.text === 'Saved on close'), 'Closing must flush the last edit to extension storage', 3000);
    assert.ok((await todoTexts(page)).includes('Saved on close'));
    pass('todo-last-edit-survives-close-and-reload');

    await setFaults(page, { failWrite: { [KEYS.todos]: 1_000_000 } });
    await addTodo(page, 'Kept after failure');
    await waitForStatus(page, 'Storage is full');
    assert.equal(await page.evaluate(() => Boolean(document.querySelector('.save-status__retry'))), true);
    assert.ok((await todoTexts(page)).includes('Kept after failure'), 'The edit stays on screen after a failed save');
    assert.equal(await page.evaluate(() => document.querySelector('.storage-error') !== null), true, 'The global notice is shown');
    await setFaults(page, {});
    await page.click('.save-status__retry');
    await waitForStatus(page, 'Saved');
    await waitForStored(page, KEYS.todos, list => list?.some(item => item.text === 'Kept after failure'), 'Retry must write the kept edit');
    assert.equal(await page.evaluate(() => document.querySelector('.storage-error') === null || document.querySelector('.storage-error') === undefined), true, 'The notice clears after recovery');
    pass('todo-failed-write-keeps-edit-and-retry-saves-it');

    // A write that failed and was never retried is recovered from the mirror and copied back.
    await setFaults(page, { failWrite: { [KEYS.todos]: 1_000_000 } });
    await addTodo(page, 'Recovered after reload');
    await waitForStatus(page, 'Storage is full');
    await setFaults(page, {});
    await close(page);
    page = track(await open(session, ['todo']));
    assert.ok((await todoTexts(page)).includes('Recovered after reload'), 'The unsaved edit comes back from the local mirror');
    await waitForStored(page, KEYS.todos, list => list?.some(item => item.text === 'Recovered after reload'), 'The recovered edit is written back to extension storage');
    pass('todo-failed-write-recovered-after-reload');

    // NT-13 for notes: the states follow what really happened.
    await page.evaluate(() => {
      window.__statusSeen = [];
      new MutationObserver(() => document.querySelectorAll('.notes-widget .save-status').forEach(node => {
        const text = node.textContent.trim().replace(/\s+/g, ' ');
        if (window.__statusSeen.at(-1) !== text) window.__statusSeen.push(text);
      })).observe(document.body, { subtree: true, childList: true, characterData: true });
    });
    await page.fill('.notes-area', 'Status check');
    await waitForStatus(page, 'Saved');
    await waitForStored(page, KEYS.notes, note => note?.text === 'Status check', 'The note must be stored');
    const seen = await page.evaluate(() => window.__statusSeen);
    assert.ok(seen.indexOf('Saving…') >= 0 && seen.lastIndexOf('Saved') > seen.indexOf('Saving…'), `Saving must precede Saved: ${seen}`);
    await setFaults(page, { failWriteOther: { [KEYS.notes]: 1_000_000 } });
    await page.fill('.notes-area', 'Status check, edited');
    await waitForStatus(page, 'Could not save. Your edit is kept on this page.');
    assert.equal(await page.evaluate(() => document.querySelector('.notes-area').value), 'Status check, edited');
    await setFaults(page, {});
    await page.click('.notes-widget .save-status__retry');
    await page.waitForFunction(() => document.querySelector('.notes-widget .save-status')?.textContent.trim() === 'Saved', null, { timeout: 10_000 });
    assert.equal((await waitForStored(page, KEYS.notes, note => note?.text === 'Status check, edited', 'Retry keeps the edit')).text, 'Status check, edited');
    assert.ok((await stored(page, KEYS.notes)).rev >= 2, 'Notes carry a revision');
    pass('notes-status-follows-real-save-result-and-retry-keeps-edit');

    // NT-14 for tasks: position, keyboard and the other tab's changes.
    await setFaults(page, {});
    await page.evaluate(() => localStorage.removeItem('__integration_faults'));
    const before = await todoTexts(page);
    const index = 1;
    await page.evaluate(position => document.querySelectorAll('.todo-item .todo-delete')[position].click(), index);
    await page.waitForFunction(() => document.querySelector('.undo-toast'));
    assert.equal((await todoTexts(page)).length, before.length - 1);
    await page.pressKeys('z', { modifier: CONTROL });
    await waitForTodos(page, before);
    assert.equal(await page.evaluate(() => Boolean(document.querySelector('.undo-toast'))), false);
    pass('todo-undo-with-keyboard-restores-position');

    await page.evaluate(position => document.querySelectorAll('.todo-item .todo-delete')[position].click(), 0);
    await page.waitForFunction(() => document.querySelector('.undo-toast'));
    await page.evaluate(() => document.querySelector('.undo-toast__action').focus());
    await page.pressKeys(ENTER);
    await waitForTodos(page, before);
    pass('todo-undo-button-works-with-keyboard');

    await page.evaluate(() => document.querySelectorAll('.todo-item .todo-delete')[0].click());
    await page.waitForFunction(() => document.querySelector('.undo-toast'));
    await sleep(page, 8600);
    assert.equal(await page.evaluate(() => Boolean(document.querySelector('.undo-toast'))), false, 'The undo window must close');
    pass('undo-window-expires');
    await close(page);

    // NT-12: two live New Tabs.
    const one = track(await open(session));
    const two = track(await open(session));
    await addTodo(one, 'Written in tab one');
    await waitForStored(one, KEYS.todos, list => list?.some(item => item.text === 'Written in tab one'), 'Tab one must save');
    await two.waitForFunction(() => [...document.querySelectorAll('.todo-text')].some(node => node.textContent === 'Written in tab one'), null, { timeout: 8000 });
    await addTodo(two, 'Written in tab two');
    await waitForStored(two, KEYS.todos, list => list?.some(item => item.text === 'Written in tab two'), 'Tab two must save');
    await one.waitForFunction(() => [...document.querySelectorAll('.todo-text')].some(node => node.textContent === 'Written in tab two'), null, { timeout: 8000 });
    assert.deepEqual((await todoTexts(one)).sort(), (await todoTexts(two)).sort());
    pass('todo-changes-reach-the-other-tab');

    // Edit in one tab while the other adds; neither overwrites the other.
    await one.evaluate(() => document.querySelector('.todo-check').click());
    await addTodo(two, 'Added while one toggles');
    await waitForStored(one, KEYS.todos, list => list?.some(item => item.text === 'Added while one toggles') && list[0].done !== undefined, 'Both changes saved');
    await one.waitForFunction(() => [...document.querySelectorAll('.todo-text')].some(node => node.textContent === 'Added while one toggles'), null, { timeout: 8000 });
    const merged = await stored(one, KEYS.todos);
    assert.equal(merged.filter(item => item.text === 'Added while one toggles').length, 1, 'No duplicates');
    pass('todo-concurrent-edit-and-add-merge');

    // Both tabs add different tasks without hearing each other: the second write merges the first.
    await Promise.all([one, two].map(tab => tab.evaluate(() => sessionStorage.setItem('__partition', 'on'))));
    await addTodo(one, 'Partition one');
    await waitForStored(one, KEYS.todos, list => list?.some(item => item.text === 'Partition one'), 'Tab one saved');
    await addTodo(two, 'Partition two');
    await waitForStored(two, KEYS.todos, list => list?.some(item => item.text === 'Partition one') && list.some(item => item.text === 'Partition two'), 'Tab two must merge before it writes', 10_000);
    await Promise.all([one, two].map(tab => tab.evaluate(() => sessionStorage.removeItem('__partition'))));
    pass('todo-write-merges-changes-the-tab-has-not-heard-about');

    // Undo must not erase what the other tab added in the meantime.
    const survivor = (await todoTexts(one))[0];
    
    await one.evaluate(() => document.querySelectorAll('.todo-item .todo-delete')[0].click());
    await addTodo(two, 'Added during undo window');
    await waitForStored(two, KEYS.todos, list => list?.some(item => item.text === 'Added during undo window'), 'Tab two saved');
    await one.waitForFunction(() => [...document.querySelectorAll('.todo-text')].some(node => node.textContent === 'Added during undo window'), null, { timeout: 8000 });
    await one.click('.undo-toast__action');
    await one.waitForFunction(first => document.querySelector('.todo-text')?.textContent === first, survivor, { timeout: 8000 });
    const afterUndo = await waitForStored(one, KEYS.todos, list => list?.some(item => item.text === survivor) && list.some(item => item.text === 'Added during undo window'), 'Undo keeps the other tab changes');
    assert.ok(afterUndo.some(item => item.text === 'Added during undo window'));
    pass('todo-undo-does-not-overwrite-other-tab');

    // Two settled tabs must stay quiet: merging each other's result may not start a write loop.
    const writes = async () => (await Promise.all([one, two].map(tab => tab.evaluate(() => window.__integrationWrites)))).flat();
    await sleep(one, 2500);
    const quietBefore = (await writes()).length;
    await sleep(one, 3500);
    const quietAfter = await writes();
    assert.equal(quietAfter.length, quietBefore, `Settled tabs must not keep rewriting each other's data: ${quietAfter.slice(quietBefore)}`);
    pass('settled-tabs-do-not-write-in-a-loop');

    // Two tabs that cannot hear each other edit the same note: neither version may disappear.
    await Promise.all([one, two].map(tab => tab.evaluate(() => sessionStorage.setItem('__partition', 'on'))));
    await one.fill('.notes-area', 'Text typed in one');
    await waitForStored(one, KEYS.notes, note => note?.text === 'Text typed in one', 'Tab one saved its note');
    await two.fill('.notes-area', 'Text typed in two');
    await waitForStored(two, KEYS.notes, note => note?.conflicts?.some(copy => copy.text === 'Text typed in one'), 'Tab two must keep the version it had not seen', 10_000);
    await Promise.all([one, two].map(tab => tab.evaluate(() => sessionStorage.removeItem('__partition'))));
    await two.fill('.notes-area', 'Text typed in two, final');
    await one.waitForFunction(() => document.querySelector('.notes-area').value === 'Text typed in two, final', null, { timeout: 10_000 });
    await sleep(one, 500);
    const finalNote = await stored(one, KEYS.notes);
    const shown = await Promise.all([one, two].map(tab => tab.evaluate(() => ({
      text: document.querySelector('.notes-area').value, copy: document.querySelector('.notes-conflict__copy')?.textContent ?? null }))));
    const versions = new Set([finalNote.text, ...finalNote.conflicts.map(copy => copy.text)]);
    assert.ok(versions.has('Text typed in one') && versions.has('Text typed in two, final'), `No version may be lost: ${JSON.stringify(finalNote)}`);
    assert.ok(shown.every(tab => tab.copy === 'Text typed in one'), 'The conflict copy is shown in both tabs');
    assert.ok(shown.every(tab => tab.text === 'Text typed in two, final'));
    await one.click('.notes-conflict__actions button:first-child');
    await one.waitForFunction(() => document.querySelector('.notes-area').value === 'Text typed in one', null, { timeout: 5000 });
    assert.equal(await one.evaluate(() => document.querySelector('.notes-conflict__copy').textContent), 'Text typed in two, final', 'Using a copy swaps it so nothing is lost');
    await one.click('.notes-conflict__actions button:last-child');
    await one.waitForFunction(() => !document.querySelector('.notes-conflict'), null, { timeout: 5000 });
    pass('notes-conflict-keeps-both-versions-and-shows-copy');

    // Events and shortcuts created in one tab appear in the other.
    await createEvent(one, 'Event from tab one');
    await two.waitForFunction(() => [...document.querySelectorAll('.cal-event-title')].some(node => node.firstChild.textContent.trim() === 'Event from tab one'), null, { timeout: 8000 });
    await createEvent(two, 'Event from tab two');
    await one.waitForFunction(() => [...document.querySelectorAll('.cal-event-title')].some(node => node.firstChild.textContent.trim() === 'Event from tab two'), null, { timeout: 8000 });
    assert.ok((await eventTitles(one)).includes('Event from tab one'), 'The local event is not overwritten');
    pass('calendar-changes-merge-between-tabs');

    const addShortcut = async (tab, title, url) => {
      await tab.click('.speed-dial-card--add .speed-dial-link');
      await tab.waitForFunction(() => document.querySelector('.dial-editor input[maxlength="80"]'));
      await tab.fill('.dial-editor input[maxlength="80"]', title);
      await tab.fill('.dial-editor input[maxlength="2048"]', url);
      await tab.click('.editor-button--primary');
      await tab.waitForFunction(() => !document.querySelector('.dial-editor'));
    };
    const titles = tab => tab.evaluate(() => [...document.querySelectorAll('.speed-dial-card:not(.speed-dial-card--add) .speed-dial-title')].map(node => node.textContent));
    await addShortcut(one, 'Shortcut one', 'https://shortcut-one.example/');
    await two.waitForFunction(() => [...document.querySelectorAll('.speed-dial-title')].some(node => node.textContent === 'Shortcut one'), null, { timeout: 8000 });
    await addShortcut(two, 'Shortcut two', 'https://shortcut-two.example/');
    await one.waitForFunction(() => [...document.querySelectorAll('.speed-dial-title')].some(node => node.textContent === 'Shortcut two'), null, { timeout: 8000 });
    assert.ok((await titles(one)).includes('Shortcut one'));
    const bookmarkState = await waitForStored(one, KEYS.bookmarks, map => Object.values(map || {}).flat().filter(item => /^Shortcut/.test(item.title)).length === 2, 'Both shortcuts saved');
    const ids = Object.values(bookmarkState).flat().map(item => item.id);
    const oneId = Object.values(bookmarkState).flat().find(item => item.title === 'Shortcut one').id;
    assert.ok(ids.every(Boolean) && new Set(ids).size === ids.length, 'Shortcuts have unique ids');
    pass('bookmarks-changes-merge-between-tabs');

    // Undo deleting a shortcut and a category, with their position.
    const order = await titles(one);
    const target = order.indexOf('Shortcut one');
    await one.evaluate(position => document.querySelectorAll('.speed-dial-card:not(.speed-dial-card--add) .card-action-btn--danger')[position].click(), target);
    await one.click('.card-confirmation .is-danger');
    await one.waitForFunction(() => document.querySelector('.undo-toast'));
    assert.ok(!(await titles(one)).includes('Shortcut one'));
    await one.pressKeys('z', { modifier: CONTROL });
    await one.waitForFunction(expected => JSON.stringify([...document.querySelectorAll('.speed-dial-card:not(.speed-dial-card--add) .speed-dial-title')].map(node => node.textContent)) === expected, JSON.stringify(order), { timeout: 8000 });
    await waitForStored(one, KEYS.bookmarks, map => Object.values(map).flat().some(item => item.title === 'Shortcut one' && item.id === oneId), 'The restored shortcut keeps its id in storage');
    pass('bookmarks-undo-restores-shortcut-position');

    const categoriesBefore = await one.evaluate(() => [...document.querySelectorAll('.tab-item .tab-btn')].map(node => node.textContent));
    const doomed = categoriesBefore[1];
    await one.evaluate(name => [...document.querySelectorAll('.tab-item')].find(node => node.querySelector('.tab-btn').textContent === name).querySelector('.tab-delete').click(), doomed);
    await one.click('.delete-confirmation .is-danger');
    await one.waitForFunction(() => document.querySelector('.undo-toast'));
    assert.ok(!(await one.evaluate(() => [...document.querySelectorAll('.tab-item .tab-btn')].map(node => node.textContent))).includes(doomed));
    await one.click('.undo-toast__action');
    await one.waitForFunction(expected => JSON.stringify([...document.querySelectorAll('.tab-item .tab-btn')].map(node => node.textContent)) === expected, JSON.stringify(categoriesBefore), { timeout: 8000 });
    await waitForStored(one, KEYS.categories, list => JSON.stringify(list) === JSON.stringify(categoriesBefore), 'The category returns to its position in storage');
    pass('bookmarks-undo-restores-category-and-position');

    if (outputDir) await one.screenshot({ path: join(outputDir, 'widgets.png') });
    report.passed = true;
    return report;
  } catch (error) {
    report.error = error.stack || String(error);
    throw error;
  } finally {
    if (outputDir) writeFileSync(join(outputDir, 'widget-data-safety.json'), `${JSON.stringify(report, null, 2)}\n`);
    for (const page of [...pages]) { try { await page.close(); } catch { /* The tab may already be closed. */ } }
  }
}
