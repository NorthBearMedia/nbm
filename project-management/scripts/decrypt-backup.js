// scripts/decrypt-backup.js
//
// Recover an off-site backup downloaded from Backblaze B2:
//
//   B2_BACKUP_PASSPHRASE=... node scripts/decrypt-backup.js nbm-projects-2026-07-25.db.gz.enc out.db
//
// File layout (written by offsiteBackup in server.js):
//   salt(16 bytes) | iv(12) | GCM auth tag(16) | AES-256-GCM ciphertext of the gzipped DB

import { readFileSync, writeFileSync } from 'fs';
import { scryptSync, createDecipheriv } from 'crypto';
import { gunzipSync } from 'zlib';

const [, , inFile, outFile] = process.argv;
const passphrase = process.env.B2_BACKUP_PASSPHRASE;
if (!inFile || !outFile || !passphrase) {
  console.error('Usage: B2_BACKUP_PASSPHRASE=... node scripts/decrypt-backup.js <in.db.gz.enc> <out.db>');
  process.exit(1);
}

const raw = readFileSync(inFile);
const salt = raw.subarray(0, 16), iv = raw.subarray(16, 28), tag = raw.subarray(28, 44), data = raw.subarray(44);
const decipher = createDecipheriv('aes-256-gcm', scryptSync(passphrase, salt, 32), iv);
decipher.setAuthTag(tag);
writeFileSync(outFile, gunzipSync(Buffer.concat([decipher.update(data), decipher.final()])));
console.log(`Decrypted ${inFile} -> ${outFile}`);
