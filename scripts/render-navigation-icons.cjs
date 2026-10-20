// Run: npm exec --yes --package=sharp -- node scripts/render-navigation-icons.cjs
const fs = require('node:fs/promises');
const path = require('node:path');
const sharp = require(process.argv[2] ?? require.resolve('sharp', {
  paths: [process.cwd(), ...process.env.PATH.split(path.delimiter).map(bin => path.resolve(bin, '..'))],
}));
const directory = path.resolve(__dirname, '../assets/icons/navigation');
// Bitmap colors are needed on Android, where native tab images keep their original colors.
// These match the app's default light palette; iOS and web also support tinting.
const states = [
  { suffix: '', color: '#5A707B', stroke: '1.8' },
  { suffix: '-selected', color: '#086996', stroke: '2' },
];

(async () => {
  for (const name of ['camp', 'compass', 'caravan', 'campfire-chat', 'traveler']) {
    const svg = await fs.readFile(path.join(directory, name + '.svg'), 'utf8');
    for (const state of states) {
      const source = svg.replaceAll('currentColor', state.color).replace('stroke-width="1.8"', `stroke-width="${state.stroke}"`);
      if (state.suffix) {
        await fs.writeFile(path.join(directory, name + state.suffix + '.svg'), source);
      }
      for (const scale of [1, 2, 3]) {
        const suffix = scale === 1 ? '' : `@${scale}x`;
        await sharp(Buffer.from(source))
          .resize(24 * scale, 24 * scale)
          .png()
          .toFile(path.join(directory, name + state.suffix + suffix + '.png'));
      }
    }
  }
  console.log('Rendered 5 navigation icons in two states at 1x, 2x and 3x.');
})().catch(error => { console.error(error); process.exitCode = 1; });
