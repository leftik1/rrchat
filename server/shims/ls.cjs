const fs = require('fs');
const path = require('path');

const args = process.argv.slice(2);
let targetDir = '.';
let showAll = false;
let longFormat = false;

for (const arg of args) {
  if (arg.startsWith('-') && arg.length > 1) {
    if (arg.includes('a')) showAll = true;
    if (arg.includes('l')) longFormat = true;
  } else if (!arg.startsWith('-')) {
    targetDir = arg;
  }
}

try {
  const resolved = path.resolve(targetDir);
  const entries = fs.readdirSync(resolved, { withFileTypes: true });
  for (const entry of entries) {
    if (!showAll && entry.name.startsWith('.')) continue;
    if (longFormat) {
      try {
        const stat = fs.statSync(path.join(resolved, entry.name));
        const type = entry.isDirectory() ? 'd' : '-';
        const size = String(stat.size).padStart(8, ' ');
        console.log(`${type} ${size} ${entry.name}`);
      } catch {
        console.log(entry.name);
      }
    } else {
      console.log(entry.name);
    }
  }
} catch (err) {
  console.error(err.message);
  process.exit(1);
}
