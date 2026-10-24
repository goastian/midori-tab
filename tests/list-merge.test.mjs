import assert from 'node:assert/strict';
import test from 'node:test';

import { stableId, touchItem } from '../src/services/itemIds.js';
import { mergeById, mergeNote } from '../src/services/listMerge.js';

const item = (id, text, extra = {}) => ({ id, text, done: false, rev: 1, ...extra });
const ids = list => list.map(entry => entry.id);

test('legacy items get the same ids in every tab and repeated content stays distinct', () => {
  const assign = texts => {
    const seen = new Map();
    return texts.map(text => stableId('t', text, seen));
  };
  const first = assign(['Buy milk', 'Call', 'Buy milk']);
  assert.deepEqual(assign(['Buy milk', 'Call', 'Buy milk']), first);
  assert.equal(new Set(first).size, 3);
  assert.equal(first[0], assign(['Buy milk'])[0], 'The first occurrence must not depend on later items');
});

test('touchItem grows the revision and records the edit time', () => {
  const edited = touchItem({ id: 'a', text: 'x' });
  assert.equal(edited.rev, 1);
  assert.ok(edited.updatedAt > 0);
  assert.equal(touchItem(edited).rev, 2);
});

test('changes from both tabs survive when they touch different items', () => {
  const base = [item('a', 'one'), item('b', 'two')];
  const local = [item('a', 'one', { done: true, rev: 2 }), item('b', 'two')];
  const remote = [item('a', 'one'), item('b', 'two'), item('c', 'three')];
  const { value, conflicts } = mergeById(base, local, remote);
  assert.deepEqual(conflicts, []);
  assert.deepEqual(ids(value), ['a', 'b', 'c']);
  assert.equal(value[0].done, true, 'The local edit must not be overwritten');
});

test('a local addition lands after its neighbour and remote additions are kept', () => {
  const base = [item('a', 'one')];
  const local = [item('a', 'one'), item('x', 'local')];
  const remote = [item('a', 'one'), item('y', 'remote')];
  assert.deepEqual(ids(mergeById(base, local, remote).value), ['a', 'x', 'y']);
});

test('a delete is honoured unless the other tab edited the item', () => {
  const base = [item('a', 'one'), item('b', 'two')];
  const untouched = mergeById(base, [item('b', 'two')], base);
  assert.deepEqual(ids(untouched.value), ['b']);
  const edited = mergeById(base, [item('b', 'two')], [item('a', 'one', { done: true, rev: 2 }), item('b', 'two')]);
  assert.deepEqual(ids(edited.value), ['a', 'b'], 'An edit beats a delete');
  const remoteDelete = mergeById(base, [item('a', 'changed', { rev: 2 }), item('b', 'two')], [item('b', 'two')]);
  assert.deepEqual(ids(remoteDelete.value), ['a', 'b'], 'A local edit beats a delete made elsewhere');
  const plain = mergeById(base, base, [item('b', 'two')]);
  assert.deepEqual(ids(plain.value), ['b']);
});

test('incompatible edits keep the local one in place and the other as a conflict copy', () => {
  const base = [item('a', 'one')];
  const local = [item('a', 'mine', { rev: 2 })];
  const remote = [item('a', 'theirs', { rev: 2 })];
  const { value, conflicts } = mergeById(base, local, remote);
  assert.equal(value.length, 2);
  assert.equal(value[0].text, 'mine');
  assert.equal(value[1].text, 'theirs');
  assert.equal(value[1].conflictOf, 'a');
  assert.notEqual(value[1].id, 'a');
  assert.deepEqual(conflicts, [value[1].id]);
});

test('identical edits in both tabs are not a conflict', () => {
  const base = [item('a', 'one')];
  const local = [item('a', 'same', { rev: 2, updatedAt: 5 })];
  const remote = [item('a', 'same', { rev: 2, updatedAt: 9 })];
  const { value, conflicts } = mergeById(base, local, remote);
  assert.equal(value.length, 1);
  assert.deepEqual(conflicts, []);
});

test('merging the other tab\'s result converges instead of multiplying copies', () => {
  const base = [item('a', 'one')];
  const tabA = [item('a', 'from A', { rev: 2 })];
  const tabB = [item('a', 'from B', { rev: 2 })];
  const writtenByA = mergeById(base, tabA, base).value;
  const seenByB = mergeById(base, tabB, writtenByA);
  const writtenByB = seenByB.value;
  const seenByA = mergeById(writtenByA, writtenByA, writtenByB).value;
  const stable = mergeById(writtenByB, writtenByB, seenByA);
  assert.deepEqual(stable.value, seenByA, 'Both tabs must settle on the same list');
  assert.deepEqual(stable.conflicts, []);
  assert.ok(seenByA.some(entry => entry.text === 'from A') && seenByA.some(entry => entry.text === 'from B'), 'No edit may be lost');
  assert.ok(seenByA.length <= 3);
});

test('settle reconciles volatile fields that are not edits', () => {
  const same = (a, b) => a.title === b.title;
  const settle = (chosen, local, remote) => ({ ...chosen, notifiedAt: chosen.notifiedAt || (same(chosen, local) ? local.notifiedAt : null) || (same(chosen, remote) ? remote.notifiedAt : null) });
  const base = [{ id: 'e', title: 'Meet', notifiedAt: null }];
  const local = [{ id: 'e', title: 'Meet', notifiedAt: 'now' }];
  const { value, conflicts } = mergeById(base, local, base, { same, settle });
  assert.equal(value[0].notifiedAt, 'now');
  assert.deepEqual(conflicts, []);
});

test('notes: untouched sides adopt the other, edits on both sides keep a copy', () => {
  const base = { id: 'n', text: 'old', rev: 1, conflicts: [] };
  assert.equal(mergeNote(base, base, { ...base, text: 'remote', rev: 2 }).value.text, 'remote');
  assert.equal(mergeNote(base, { ...base, text: 'local', rev: 2 }, base).value.text, 'local');
  const both = mergeNote(base, { ...base, text: 'local', rev: 2 }, { ...base, text: 'remote', rev: 2, updatedAt: 7 });
  assert.equal(both.value.text, 'local');
  assert.deepEqual(both.value.conflicts, [{ text: 'remote', at: 7 }]);
  assert.equal(both.conflicts.length, 1);
  const again = mergeNote(base, both.value, { ...base, text: 'remote', rev: 2, updatedAt: 7 });
  assert.equal(again.value.conflicts.length, 1, 'The same remote text must not be stored twice');
});

test('notes: dismissing or swapping a kept copy reaches the other tab without bringing it back', () => {
  const copy = { text: 'other version', at: 1 };
  const shared = { id: 'n', text: 'mine', rev: 3, conflicts: [copy] };
  const dismissed = { ...shared, rev: 4, conflicts: [] };
  assert.deepEqual(mergeNote(shared, shared, dismissed).value.conflicts, []);
  const swapped = { ...shared, rev: 4, text: 'other version', conflicts: [{ text: 'mine', at: 2 }] };
  const adopted = mergeNote(shared, shared, swapped).value;
  assert.equal(adopted.text, 'other version');
  assert.deepEqual(adopted.conflicts, [{ text: 'mine', at: 2 }]);
  assert.deepEqual(mergeNote(shared, swapped, shared).value, swapped, 'The tab that changed keeps its change');
});
