const fs = require('fs');

const svg1 = fs.readFileSync('public/brand-icon-sem-fundo.svg', 'utf8');
console.log('--- brand-icon-sem-fundo.svg ---');
console.log('Length:', svg1.length);
const clean1 = svg1.replace(/xlink:href="data:image\/[^;]+;base64,[^"]+"/g, 'xlink:href="[BASE64_IMAGE]"');
console.log(clean1);

const svg2 = fs.readFileSync('public/brand-icon.svg', 'utf8');
console.log('--- brand-icon.svg ---');
console.log('Length:', svg2.length);
const clean2 = svg2.replace(/xlink:href="data:image\/[^;]+;base64,[^"]+"/g, 'xlink:href="[BASE64_IMAGE]"');
console.log(clean2);
