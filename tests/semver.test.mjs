import assert from 'node:assert/strict'
import test from 'node:test'

import { compareSemver, compareVersions, parseSemver } from '../src/utils/semver.js'

test('compareSemver trata versiones iguales correctamente', () => {
  assert.equal(compareSemver('1.2.3', '1.2.3'), 0)
})

test('compareSemver detecta version mayor correctamente', () => {
  assert.equal(compareSemver('1.2.4', '1.2.3') > 0, true)
  assert.equal(compareSemver('2.0.0', '1.9.9') > 0, true)
})

test('compareSemver ordena prerelease por debajo de estable', () => {
  assert.equal(compareSemver('1.2.3-beta.1', '1.2.3') < 0, true)
  assert.equal(compareSemver('1.2.3-beta.2', '1.2.3-beta.1') > 0, true)
})

test('parseSemver devuelve null para datos corruptos', () => {
  assert.equal(parseSemver('not-a-version'), null)
  assert.equal(parseSemver('v1..2'), null)
})

test('compareVersions tolera entradas no semver como fallback', () => {
  assert.equal(compareVersions('build-10', 'build-2') > 0, true)
  assert.equal(compareVersions('', '0.0.0'), 0)
})