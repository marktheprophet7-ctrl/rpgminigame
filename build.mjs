import fs from 'node:fs';
import AdmZip from 'adm-zip';

const parts = [
  'HEAVENBOUND_v3.1.1.part-00',
  'HEAVENBOUND_v3.1.1.part-01',
  'HEAVENBOUND_v3.1.1.part-02'
];

const buffers = parts.map((p) => fs.readFileSync(p));
const zipPath = '/tmp/heavenbound.zip';
fs.writeFileSync(zipPath, Buffer.concat(buffers));

fs.mkdirSync('dist', { recursive: true });
new AdmZip(zipPath).extractAllTo('dist', true);

console.log('HEAVENBOUND release reconstructed.');
