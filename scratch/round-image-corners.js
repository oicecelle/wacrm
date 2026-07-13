const sharp = require('sharp');
const path = require('path');

const srcPath = 'C:\\Users\\SenetUser\\.gemini\\antigravity-ide\\brain\\d5a9c0cb-da66-4909-b080-ef1a8a9b3302\\media__1783448588501.jpg';
const destLogo = 'c:\\Users\\SenetUser\\Downloads\\MARCELLE-20260617T162810Z-3-001\\MARCELLE\\wacrm\\public\\images\\logo.png';
const destIcon = 'c:\\Users\\SenetUser\\Downloads\\MARCELLE-20260617T162810Z-3-001\\MARCELLE\\wacrm\\src\\app\\icon.png';
const destFavicon = 'c:\\Users\\SenetUser\\Downloads\\MARCELLE-20260617T162810Z-3-001\\MARCELLE\\wacrm\\public\\favicon.ico';

async function run() {
  console.log("=== ARREDONDANDO OS CANTOS DO ARQUIVO DE IMAGEM DA LOGO ===");

  const width = 1000;
  const height = 1000;
  const rx = 200; // Radius for rounded corners

  // Create a rounded corner mask SVG
  const roundedCorners = Buffer.from(
    `<svg><rect x="0" y="0" width="${width}" height="${height}" rx="${rx}" ry="${rx}"/></svg>`
  );

  // Read source, resize to 1000x1000, apply mask, and save
  await sharp(srcPath)
    .resize(width, height)
    .composite([{
      input: roundedCorners,
      blend: 'dest-in'
    }])
    .png()
    .toFile(destLogo);

  console.log(`Salvo em: ${destLogo}`);

  // Create favicon (smaller, e.g. 128x128)
  await sharp(srcPath)
    .resize(128, 128)
    .composite([{
      input: Buffer.from(`<svg><rect x="0" y="0" width="128" height="128" rx="25" ry="25"/></svg>`),
      blend: 'dest-in'
    }])
    .png()
    .toFile(destFavicon);
  
  console.log(`Salvo em: ${destFavicon}`);

  // Create app icon (e.g. 256x256)
  await sharp(srcPath)
    .resize(256, 256)
    .composite([{
      input: Buffer.from(`<svg><rect x="0" y="0" width="256" height="256" rx="51" ry="51"/></svg>`),
      blend: 'dest-in'
    }])
    .png()
    .toFile(destIcon);

  console.log(`Salvo em: ${destIcon}`);
  console.log("=== PROCESSO DE IMAGEM CONCLUIDO ===");
}

run().catch(console.error);
