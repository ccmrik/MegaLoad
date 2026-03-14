const sharp = require('sharp');
const fs = require('fs');
const path = require('path');

const iconsDir = path.join(__dirname, 'src-tauri', 'icons');
const srcPng = path.join(iconsDir, 'megaload.png');

async function convert() {
  for (const size of [32, 128, 256]) {
    await sharp(srcPng).resize(size, size).png().toFile(path.join(iconsDir, `${size}x${size}.png`));
    console.log(`Created ${size}x${size}.png`);
  }

  const sizes = [16, 32, 48, 256];
  const pngBuffers = [];
  for (const s of sizes) {
    const buf = await sharp(srcPng).resize(s, s).png().toBuffer();
    pngBuffers.push({ size: s, buf });
  }

  const headerSize = 6;
  const entrySize = 16;
  let dataOffset = headerSize + entrySize * pngBuffers.length;
  const header = Buffer.alloc(headerSize);
  header.writeUInt16LE(0, 0);
  header.writeUInt16LE(1, 2);
  header.writeUInt16LE(pngBuffers.length, 4);
  const entries = [];
  const dataChunks = [];
  for (const { size, buf } of pngBuffers) {
    const entry = Buffer.alloc(entrySize);
    entry.writeUInt8(size >= 256 ? 0 : size, 0);
    entry.writeUInt8(size >= 256 ? 0 : size, 1);
    entry.writeUInt8(0, 2);
    entry.writeUInt8(0, 3);
    entry.writeUInt16LE(1, 4);
    entry.writeUInt16LE(32, 6);
    entry.writeUInt32LE(buf.length, 8);
    entry.writeUInt32LE(dataOffset, 12);
    entries.push(entry);
    dataChunks.push(buf);
    dataOffset += buf.length;
  }
  const ico = Buffer.concat([header, ...entries, ...dataChunks]);
  fs.writeFileSync(path.join(iconsDir, 'icon.ico'), ico);
  console.log(`Created icon.ico (${ico.length} bytes)`);

  const publicDir = path.join(__dirname, 'public');
  if (!fs.existsSync(publicDir)) fs.mkdirSync(publicDir);
  await sharp(srcPng).resize(128, 128).png().toFile(path.join(publicDir, 'megaload-icon.png'));
  console.log('Created public/megaload-icon.png');

  console.log('All done!');
}

convert().catch(err => { console.error(err); process.exit(1); });
