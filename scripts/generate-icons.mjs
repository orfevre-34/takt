#!/usr/bin/env node
// SVG → PNG (複数サイズ) → ICO 変換スクリプト
import sharp from 'sharp';
import pngToIco from 'png-to-ico';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, '..');
const svgPath = path.join(root, 'src/assets/icon.svg');
const buildDir = path.join(root, 'build');

const sizes = [16, 32, 48, 64, 128, 256, 512];

async function main() {
  const svgBuf = fs.readFileSync(svgPath);

  // PNG各サイズ生成
  const pngPaths = [];
  for (const size of sizes) {
    const outPath = path.join(buildDir, `icon-${size}.png`);
    await sharp(svgBuf).resize(size, size).png().toFile(outPath);
    pngPaths.push(outPath);
    console.log(`  ${size}x${size} → ${outPath}`);
  }

  // メインの icon.png (256x256)
  const mainPng = path.join(buildDir, 'icon.png');
  await sharp(svgBuf).resize(256, 256).png().toFile(mainPng);
  console.log(`  icon.png → ${mainPng}`);

  // ICO生成 (16, 32, 48, 64, 128, 256)
  const icoSources = pngPaths.filter((_, i) => sizes[i] <= 256);
  const icoBuffers = icoSources.map(p => fs.readFileSync(p));
  const icoBuf = await pngToIco(icoBuffers);
  const icoPath = path.join(buildDir, 'icon.ico');
  fs.writeFileSync(icoPath, icoBuf);
  console.log(`  icon.ico → ${icoPath}`);

  // トレイ用 (16x16)
  const trayPng = path.join(buildDir, 'tray-icon.png');
  fs.copyFileSync(path.join(buildDir, 'icon-16.png'), trayPng);
  console.log(`  tray-icon.png → ${trayPng}`);

  console.log('Done!');
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});
