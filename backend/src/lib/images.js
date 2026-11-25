// Image uploads: resize/compress with sharp, store in the images table.
import sharp from 'sharp';
import multer from 'multer';
import { db } from '../db.js';
import { bad } from './http.js';

export const imageUpload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 10 * 1024 * 1024 },
  fileFilter: (_req, file, cb) => {
    if (/^image\//.test(file.mimetype) || /\.(jpe?g|png|webp|gif|heic|heif)$/i.test(file.originalname)) cb(null, true);
    else cb(bad('Please choose a photo (JPG, PNG or WebP)'));
  },
});

const PRESETS = {
  square: { width: 512, height: 512, fit: 'cover' },       // logos and profile photos
  product: { width: 900, height: 900, fit: 'inside' },     // medicine photos keep their shape
};

/** Resize + store an uploaded image, returning the new image id. Replaces `oldId` if given. */
export async function saveImage(file, ownerType, ownerId, { preset = 'product', oldId = null } = {}) {
  if (!file) throw bad('Choose a photo to upload');
  let out;
  try {
    out = await sharp(file.buffer, { failOn: 'none' })
      .rotate() // respect phone camera orientation
      .resize({ ...PRESETS[preset], withoutEnlargement: preset === 'product' })
      .flatten({ background: '#ffffff' })
      .jpeg({ quality: 82, mozjpeg: true })
      .toBuffer({ resolveWithObject: true });
  } catch {
    throw bad("We couldn't read that photo. Try a JPG or PNG (iPhone HEIC photos: share as JPG or take a screenshot).");
  }
  const id = Number((await db.get('INSERT INTO images (owner_type, owner_id, mime, data, width, height) VALUES (?, ?, ?, ?, ?, ?) RETURNING id', ownerType, ownerId, 'image/jpeg', out.data, out.info.width, out.info.height)).id);
  if (oldId) await deleteImage(oldId);
  return id;
}

/** Store a copy of an existing image under another owner (e.g. catalogue default photo). */
export async function copyImage(imageId, ownerType, ownerId) {
  const img = (await db.get('SELECT mime, data, width, height FROM images WHERE id = ?', imageId));
  if (!img) return null;
  return Number((await db.get('INSERT INTO images (owner_type, owner_id, mime, data, width, height) VALUES (?, ?, ?, ?, ?, ?) RETURNING id', ownerType, ownerId, img.mime, img.data, img.width, img.height)).id);
}

export async function deleteImage(id) {
  if (id) await db.run('DELETE FROM images WHERE id = ?', id);
}
