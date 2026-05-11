#!/usr/bin/env node

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const root = path.resolve(__dirname, '..');

const featuresDir = path.join(root, 'src/features');
const files = fs.readdirSync(featuresDir).filter(f => f.endsWith('.js'));

let modified = 0;

for (const file of files) {
  const filePath = path.join(featuresDir, file);
  const content = fs.readFileSync(filePath, 'utf-8');

  if (content.includes('function cleanup(') || content.includes('cleanup(),') || content.includes(', cleanup') || content.includes('cleanup\n')) {
    console.log(`✓ ${file} already has cleanup`);
    continue;
  }

  const returnMatch = content.match(/return\s*\{[\s\S]*?\n  \};?\s*\n\}/);
  if (!returnMatch) {
    console.log(`⚠ ${file} - No return statement found`);
    continue;
  }

  const returnBlock = returnMatch[0];
  const fieldsMatch = returnBlock.match(/return\s*\{([\s\S]*?)\n  \}/);
  if (!fieldsMatch) {
    console.log(`⚠ ${file} - Cannot parse return fields`);
    continue;
  }

  const fields = fieldsMatch[1].trim();

  const cleanupFunction = `  function cleanup() {
    return {
      stopped: true,
      resources: []
    };
  }

`;

  const newReturnBlock = `return {
${fields},
    cleanup
  };
}`;

  const insertPoint = content.lastIndexOf('return {');
  const beforeReturn = content.slice(0, insertPoint);
  const afterReturn = content.slice(insertPoint);

  const newContent = beforeReturn + cleanupFunction + newReturnBlock + '\n';

  fs.writeFileSync(filePath, newContent, 'utf-8');
  console.log(`✓ Added cleanup to ${file}`);
  modified++;
}

console.log(`\n=== Summary ===`);
console.log(`Total files: ${files.length}`);
console.log(`Modified: ${modified}`);
