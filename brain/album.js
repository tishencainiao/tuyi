'use strict';

// v3.7.0 旅行相册：data/album/<userId>.json 存照片元信息，data/photos/ 存图片文件
// 最小可用档：上传（前端压缩为 base64）、按行程分类、写备注、删除；删除行程只解除关联不清照片。

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const memory = require('./memory');

const DATA_DIR = process.env.TUYI_DATA_DIR || path.join(__dirname, '..', 'data');
const ALBUM_DIR = path.join(DATA_DIR, 'album');
const PHOTO_DIR = path.join(DATA_DIR, 'photos');
const MAX_PHOTOS = 200;
const MAX_RAW_BYTES = 3 * 1024 * 1024; // 解码后 3MB
const ALLOWED_EXT = ['png', 'jpg', 'webp'];

function albumFile(userId) {
  return path.join(ALBUM_DIR, userId + '.json');
}

function loadAlbum(userId) {
  try {
    const record = JSON.parse(fs.readFileSync(albumFile(userId), 'utf8'));
    record.photos = Array.isArray(record.photos) ? record.photos : [];
    return record;
  } catch {
    return { photos: [] };
  }
}

function saveAlbum(userId, record) {
  fs.mkdirSync(ALBUM_DIR, { recursive: true });
  const target = albumFile(userId);
  const tmp = target + '.tmp';
  fs.writeFileSync(tmp, JSON.stringify(record, null, 2), 'utf8');
  fs.renameSync(tmp, target);
}

function photoFile(userId, photo) {
  return path.join(PHOTO_DIR, userId + '-' + photo.id + '.' + photo.ext);
}

function publicPhoto(userId, photo) {
  return {
    id: photo.id,
    tripId: photo.tripId || null,
    caption: photo.caption || '',
    ts: photo.ts,
    url: '/photos/' + userId + '-' + photo.id + '.' + photo.ext,
  };
}

function listPhotos(userId) {
  const record = loadAlbum(userId);
  return record.photos
    .slice()
    .sort((a, b) => String(b.ts).localeCompare(String(a.ts)))
    .map((p) => publicPhoto(userId, p));
}

function decodeBase64(dataUrl) {
  const text = String(dataUrl || '').trim();
  const match = text.match(/^data:image\/(png|jpe?g|webp);base64,(.+)$/s);
  if (match) {
    const ext = match[1] === 'jpeg' ? 'jpg' : match[1];
    return { ext, buf: Buffer.from(match[2], 'base64') };
  }
  return null;
}

function validateTrip(userId, tripId) {
  if (tripId == null || tripId === '') return { ok: true, value: null };
  const value = String(tripId).slice(0, 60);
  if (!memory.getPlan(userId, value)) return { ok: false, error: '行程不存在，请先刷新再选择' };
  return { ok: true, value };
}

function addPhoto(userId, image, tripId, caption) {
  const decoded = decodeBase64(image);
  if (!decoded) return { ok: false, error: '图片格式不对（只支持 png / jpg / webp）' };
  if (!decoded.buf.length) return { ok: false, error: '图片数据为空' };
  if (decoded.buf.length > MAX_RAW_BYTES) return { ok: false, error: '图片太大（请选压缩后的照片）' };
  const tripCheck = validateTrip(userId, tripId);
  if (!tripCheck.ok) return { ok: false, error: tripCheck.error };
  const captionText = String(caption || '').trim().slice(0, 60);
  const record = loadAlbum(userId);
  if (record.photos.length >= MAX_PHOTOS) return { ok: false, error: '相册已满（最多 200 张），请先删除一些' };
  const id = 'ph' + Date.now().toString(36) + crypto.randomBytes(4).toString('hex');
  const photo = { id, ext: decoded.ext, tripId: tripCheck.value, caption: captionText, ts: new Date().toISOString() };
  fs.mkdirSync(PHOTO_DIR, { recursive: true });
  const target = photoFile(userId, photo);
  const tmp = target + '.tmp';
  fs.writeFileSync(tmp, decoded.buf);
  fs.renameSync(tmp, target);
  record.photos.push(photo);
  saveAlbum(userId, record);
  return { ok: true, photo: publicPhoto(userId, photo) };
}

function setPhotoMeta(userId, id, patch) {
  const record = loadAlbum(userId);
  const photo = record.photos.find((p) => p.id === id);
  if (!photo) return { ok: false, error: '照片不存在' };
  if (Object.prototype.hasOwnProperty.call(patch, 'tripId')) {
    const tripCheck = validateTrip(userId, patch.tripId);
    if (!tripCheck.ok) return { ok: false, error: tripCheck.error };
    photo.tripId = tripCheck.value;
  }
  if (Object.prototype.hasOwnProperty.call(patch, 'caption')) {
    photo.caption = String(patch.caption || '').trim().slice(0, 60);
  }
  saveAlbum(userId, record);
  return { ok: true, photo: publicPhoto(userId, photo) };
}

function removePhoto(userId, id) {
  const record = loadAlbum(userId);
  const index = record.photos.findIndex((p) => p.id === id);
  if (index < 0) return { ok: false, error: '照片不存在' };
  const [photo] = record.photos.splice(index, 1);
  try {
    fs.unlinkSync(photoFile(userId, photo));
  } catch {
    /* 文件已不在也无妨 */
  }
  saveAlbum(userId, record);
  return { ok: true };
}

// 删除行程时调用：只解除关联，不删照片（拍板 P10A）
function unlinkTrip(userId, planId) {
  const record = loadAlbum(userId);
  let changed = 0;
  for (const photo of record.photos) {
    if (photo.tripId === planId) {
      photo.tripId = null;
      changed += 1;
    }
  }
  if (changed > 0) saveAlbum(userId, record);
  return changed;
}

module.exports = {
  listPhotos,
  addPhoto,
  setPhotoMeta,
  removePhoto,
  unlinkTrip,
  PHOTO_DIR,
};
