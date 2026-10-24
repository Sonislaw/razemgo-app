// Run: npm exec --yes --package=sharp -- node scripts/render-notification-icon.cjs
// Like the navigation icon renderer, this uses a temporary build tool, not an app dependency.
const fs = require('node:fs/promises');
const path = require('node:path');
const sharp = require(process.argv[2] ?? require.resolve('sharp', {
  paths: [process.cwd(), ...process.env.PATH.split(path.delimiter).map(bin => path.resolve(bin, '..'))],
}));

(async () => {
  const source = await fs.readFile(path.resolve(__dirname, '../assets/images/zgrana-symbol.svg'), 'utf8');
  // Android small icons use alpha as a mask. Keep the brand silhouette, with no background.
  // The square viewBox centers the existing 256 x 261 symbol and leaves space around its edges.
  const mask = source
    .replace('width="256" height="261"', 'width="96" height="96"')
    .replace('viewBox="0 0 256 261"', 'viewBox="-32 -29.5 320 320"')
    .replace(/fill="#[\da-f]+"/gi, 'fill="#FFFFFF"');
  const directory = path.resolve(__dirname, '../assets/icons/notifications');
  await fs.mkdir(directory, { recursive: true });
  await sharp(Buffer.from(mask))
    .resize(96, 96)
    .png()
    .toFile(path.join(directory, 'notification-icon.png'));
  console.log('Rendered the RazemGo notification icon: 96 x 96, white on transparent.');
})().catch(error => { console.error(error); process.exitCode = 1; });
