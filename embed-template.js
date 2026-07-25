const fs = require('fs');
const path = require('path');

const pngPath = path.join(__dirname, 'certificate_template.png');
const outPath = path.join(__dirname, 'certificate-template.js');
const buf = fs.readFileSync(pngPath);
const w = buf.readUInt32BE(16);
const h = buf.readUInt32BE(20);
const b64 = buf.toString('base64');

fs.writeFileSync(
  outPath,
  `window.CERTIFICATE_TEMPLATE_SRC = "data:image/png;base64,${b64}";\n`
);

console.log(`dimensions: ${w}x${h}`);
console.log(`png bytes: ${buf.length}`);
console.log(`js bytes: ${fs.statSync(outPath).size}`);
