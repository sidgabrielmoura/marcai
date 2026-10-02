const fs = require('fs');
const svg1 = fs.readFileSync('public/brand-icon-sem-fundo.svg', 'utf8');
const clean1 = svg1.replace(/xlink:href="data:image\/[^;]+;base64,[^"]+"/g, 'xlink:href="[BASE64_IMAGE]"');
console.log(clean1);
