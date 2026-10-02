const fs = require('fs');

const svg = fs.readFileSync('public/brand-icon-sem-fundo.svg', 'utf8');
const match = svg.match(/xlink:href="data:image\/png;base64,([^"]+)"/);
if (match) {
  const buffer = Buffer.from(match[1], 'base64');
  fs.writeFileSync('scratch/brand-icon-extracted.png', buffer);
  console.log('Saved scratch/brand-icon-extracted.png! Size:', buffer.length);
} else {
  console.log('No base64 PNG found');
}
