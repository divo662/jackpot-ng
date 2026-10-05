const fs = require('fs');
const sharp = require('sharp');

async function generateFavicons() {
  console.log('Generating complete Favicon & Icon suite from public/icon.svg...');

  const svgPath = 'public/icon.svg';

  // 1. Generate PNGs at all required sizes
  const sizes = [16, 32, 48, 64, 128, 180, 192, 256, 512];
  const rendered = {};

  for (const s of sizes) {
    const buf = await sharp(svgPath)
      .resize(s, s)
      .png({ quality: 100 })
      .toBuffer();
    rendered[s] = buf;
  }

  // 2. Save individual public files
  fs.writeFileSync('public/favicon-16x16.png', rendered[16]);
  fs.writeFileSync('public/favicon-32x32.png', rendered[32]);
  fs.writeFileSync('public/favicon-48x48.png', rendered[48]);
  fs.writeFileSync('public/apple-touch-icon.png', rendered[180]);
  fs.writeFileSync('public/apple-touch-icon-precomposed.png', rendered[180]);
  fs.writeFileSync('public/icon-192.png', rendered[192]);
  fs.writeFileSync('public/icon-512.png', rendered[512]);

  // Also in src/app for Next.js App Router automatic metadata conventions
  fs.writeFileSync('src/app/icon.png', rendered[32]);
  fs.writeFileSync('src/app/apple-icon.png', rendered[180]);

  // 3. Build multi-resolution ICO file (16, 32, 48, 64, 128, 256)
  const icoSizes = [16, 32, 48, 64, 128, 256];
  const numImages = icoSizes.length;
  const header = Buffer.alloc(6);
  header.writeUInt16LE(0, 0); // reserved
  header.writeUInt16LE(1, 2); // ICO type 1
  header.writeUInt16LE(numImages, 4);

  let offset = 6 + numImages * 16;
  const dirEntries = [];
  for (const s of icoSizes) {
    const buf = rendered[s];
    const entry = Buffer.alloc(16);
    entry.writeUInt8(s >= 256 ? 0 : s, 0); // width
    entry.writeUInt8(s >= 256 ? 0 : s, 1); // height
    entry.writeUInt8(0, 2); // palette
    entry.writeUInt8(0, 3); // reserved
    entry.writeUInt16LE(1, 4); // planes
    entry.writeUInt16LE(32, 6); // bpp
    entry.writeUInt32LE(buf.length, 8); // size
    entry.writeUInt32LE(offset, 12); // offset
    dirEntries.push(entry);
    offset += buf.length;
  }

  const icoBuffer = Buffer.concat([header, ...dirEntries, ...icoSizes.map(s => rendered[s])]);

  // Save ICO to both src/app/favicon.ico AND public/favicon.ico
  fs.writeFileSync('src/app/favicon.ico', icoBuffer);
  fs.writeFileSync('public/favicon.ico', icoBuffer);

  console.log('Successfully generated:');
  console.log(' - src/app/favicon.ico (Multi-size ICO with Jackpot coin)');
  console.log(' - public/favicon.ico');
  console.log(' - public/apple-touch-icon.png (180x180)');
  console.log(' - public/apple-touch-icon-precomposed.png (180x180)');
  console.log(' - public/favicon-16x16.png');
  console.log(' - public/favicon-32x32.png');
  console.log(' - public/icon-192.png');
  console.log(' - public/icon-512.png');
  console.log(' - src/app/icon.png');
  console.log(' - src/app/apple-icon.png');
}

generateFavicons().catch(err => {
  console.error('Failed generating favicons:', err);
  process.exit(1);
});
