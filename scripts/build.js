const { cpSync, renameSync, rmSync, existsSync } = require('fs');
const path = require('path');

const browser = process.argv[2] || 'chrome';
const distDir = path.resolve(__dirname, '..', 'dist', browser);
const manifestSrc = path.resolve(__dirname, '..', 'manifests', `${browser}.json`);
const iconsDir = path.resolve(__dirname, '..', 'public', 'icons');

// Copy the correct manifest
cpSync(manifestSrc, path.join(distDir, 'manifest.json'));
console.log('✅ Copied manifest.json');

// Copy icons
if (existsSync(iconsDir)) {
  cpSync(iconsDir, path.join(distDir, 'icons'), { recursive: true });
  console.log('✅ Copied icons');
}

// Fix HTML paths (Vite nests them under src/popup/, we need them at root)
const htmlFiles = ['popup', 'options'];
htmlFiles.forEach((name) => {
  const nested = path.join(distDir, 'src', name, `${name}.html`);
  const root = path.join(distDir, `${name}.html`);
  if (existsSync(nested)) {
    renameSync(nested, root);
    console.log(`✅ Moved ${name}.html to root`);
  }
});

// Clean up empty src directory
const srcDir = path.join(distDir, 'src');
if (existsSync(srcDir)) {
  rmSync(srcDir, { recursive: true });
}

console.log(`✅ Built for ${browser} → dist/${browser}/`);