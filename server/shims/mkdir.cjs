const fs = require('fs');
const path = require('path');

const args = process.argv.slice(2);
const dirs = [];

for (const arg of args) {
  if (arg === '-p' || arg.startsWith('-')) {
    continue;
  }
  dirs.push(arg);
}

for (const dir of dirs) {
  try {
    fs.mkdirSync(path.resolve(dir), { recursive: true });
  } catch (err) {
    console.error(`mkdir: ${err.message}`);
    process.exitCode = 1;
  }
}
