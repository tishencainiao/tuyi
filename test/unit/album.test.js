'use strict';

// 单元测试：旅行相册（brain/album.js）
// 运行：node --test test/unit/

const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const test = require('node:test');
const assert = require('node:assert/strict');

process.env.TUYI_DATA_DIR = fs.mkdtempSync(path.join(os.tmpdir(), 'tuyi-album-'));
const memory = require('../../brain/memory');
const album = require('../../brain/album');

const TINY_PNG =
  'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==';
const USER = 'u-album-test';

function makePlan(title) {
  return memory.upsertItinerary(
    USER,
    {
      title,
      destination: '成都',
      budget_cny: 1000,
      days: [{ date: '2026-11-20', title: '第1天', items: [] }],
    },
    { mode: 'create' },
  ).itinerary;
}

test('上传：写入文件与列表，带备注与行程分类', () => {
  const plan = makePlan('测试行程');
  const added = album.addPhoto(USER, TINY_PNG, plan.id, '和外婆在锦里');
  assert.ok(added.ok);
  assert.equal(added.photo.caption, '和外婆在锦里');
  assert.equal(added.photo.tripId, plan.id);
  assert.ok(added.photo.url.startsWith('/photos/'));
  const list = album.listPhotos(USER);
  assert.equal(list.length, 1);
  assert.ok(fs.existsSync(path.join(album.PHOTO_DIR, USER + '-' + added.photo.id + '.png')));
});

test('上传：格式错误 / 行程不存在被拒绝', () => {
  const bad = album.addPhoto(USER, 'data:text/plain;base64,aGk=', null, '');
  assert.equal(bad.ok, false);
  const noTrip = album.addPhoto(USER, TINY_PNG, 'p-not-exist', '');
  assert.equal(noTrip.ok, false);
});

test('改备注 / 改分类 / 解除分类', () => {
  const photo = album.listPhotos(USER)[0];
  const renamed = album.setPhotoMeta(USER, photo.id, { caption: '改成新备注' });
  assert.ok(renamed.ok);
  assert.equal(renamed.photo.caption, '改成新备注');
  const unlinked = album.setPhotoMeta(USER, photo.id, { tripId: null });
  assert.ok(unlinked.ok);
  assert.equal(unlinked.photo.tripId, null);
});

test('删除行程：照片解除关联但不删除', () => {
  const plan = makePlan('要删的行程');
  assert.ok(album.addPhoto(USER, TINY_PNG, plan.id, '').ok);
  const photo = album.listPhotos(USER).find((p) => p.tripId === plan.id);
  assert.ok(photo);
  assert.ok(memory.removeItinerary(USER, plan.id).ok);
  const changed = album.unlinkTrip(USER, plan.id);
  assert.ok(changed >= 1);
  const after = album.listPhotos(USER).find((p) => p.id === photo.id);
  assert.ok(after);
  assert.equal(after.tripId, null);
});

test('删除照片：条目与文件都不在', () => {
  const before = album.listPhotos(USER);
  const target = before[before.length - 1];
  assert.ok(album.removePhoto(USER, target.id).ok);
  assert.equal(album.listPhotos(USER).some((p) => p.id === target.id), false);
  assert.equal(fs.existsSync(path.join(album.PHOTO_DIR, USER + '-' + target.id + '.png')), false);
});
