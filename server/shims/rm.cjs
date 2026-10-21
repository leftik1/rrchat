const fs = require('fs');
const path = require('path');

const args = process.argv.slice(2);
let recursive = false;
let force = false;
const targets = [];

for (const arg of args) {
  if (arg.startsWith('-') && arg.length > 1) {
    if (arg.includes('r') || arg.includes('R')) recursive = true;
    if (arg.includes('f')) force = true;
  } else {
    targets.push(arg);
  }
}

for (const target of targets) {
  try {
    const resolved = path.resolve(target);
    if (!fs.existsSync(resolved)) {
      if (!force) {
        console.error(`rm: cannot remove '${target}': No such file or directory`);
        process.exitCode = 1;
      }
      continue;
    }
    const stat = fs.statSync(resolved);
    if (stat.isDirectory()) {
      if (!recursive) {
        console.error(`rm: cannot remove '${target}': Is a directory`);
        process.exitCode = 1;
        continue;
      }
      fs.rmSync(resolved, { recursive: true, force: true });
    } else {
      fs.unlinkSync(resolved);
    }
  } catch (err) {
    if (!force) {
      console.error(`rm: cannot remove '${target}': ${err.message}`);
      process.exitCode = 1;
    }
  }
}
