import sharp from 'sharp'; import fs from 'node:fs';
const d=process.env.SCR, n=process.argv[2], svg=fs.readFileSync(`${d}/${n}.svg`);
for (const s of [16,32,64]) {
  const p = await sharp(svg,{density:512}).resize(s,s).png().toBuffer();
  await sharp(p).resize(s*(s===64?6:13),s*(s===64?6:13),{kernel:'nearest'}).toFile(`${d}/${n}-${s}.png`);
}
