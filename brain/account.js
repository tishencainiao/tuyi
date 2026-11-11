'use strict';

// v3.7.0 账号个性化：用户名修改（转 brain/auth.js）+ 头像文件存取（零依赖）
// 头像存 data/avatars/<userId>.<ext>，元信息（ext/时间）记在 users.json，由 auth.setAvatarMeta 维护。

const fs = require('fs');
const path = require('path');
const auth = require('./auth');

const DATA_DIR = process.env.TUYI_DATA_DIR || path.join(__dirname, '..', 'data');
const AVATAR_DIR = path.join(DATA_DIR, 'avatars');
const MAX_AVATAR_BYTES = 2 * 1024 * 1024; // 解码后 2MB
const ALLOWED_EXT = ['png', 'jpg', 'webp'];

function updateUsername(userId, username) {
  return auth.updateUsername(userId, username);
}

function avatarFile(userId, ext) {
  return path.join(AVATAR_DIR, userId + '.' + ext);
}

function existingAvatar(userId) {
  for (const ext of ALLOWED_EXT) {
    const file = avatarFile(userId, ext);
    try {
      if (fs.statSync(file).isFile()) return { ext, file };
    } catch {
      /* 继续找下一个扩展名 */
    }
  }
  return null;
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

function saveAvatar(userId, image) {
  const decoded = decodeBase64(image);
  if (!decoded) return { ok: false, error: '头像格式不对（只支持 png / jpg / webp）' };
  if (!decoded.buf.length) return { ok: false, error: '头像数据为空' };
  if (decoded.buf.length > MAX_AVATAR_BYTES) return { ok: false, error: '头像文件太大（超过 2MB）' };
  fs.mkdirSync(AVATAR_DIR, { recursive: true });
  const old = existingAvatar(userId);
  const target = avatarFile(userId, decoded.ext);
  const tmp = target + '.tmp';
  fs.writeFileSync(tmp, decoded.buf);
  fs.renameSync(tmp, target);
  if (old && old.ext !== decoded.ext) {
    try {
      fs.unlinkSync(old.file);
    } catch {
      /* 旧文件删不掉不影响新头像 */
    }
  }
  auth.setAvatarMeta(userId, decoded.ext);
  return { ok: true, ext: decoded.ext };
}

module.exports = {
  updateUsername,
  saveAvatar,
  existingAvatar,
  avatarFile,
};
