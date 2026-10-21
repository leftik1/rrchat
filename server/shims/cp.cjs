const fs = require('fs');
const path = require('path');

const args = process.argv.slice(2);
let recursive = false;
const paths = [];

for (const arg of args) {
  if (arg.startsWith('-') && arg.length > 1) {
    if (arg.includes('r') || arg.includes('R')) recursive = true;
  } else {
    paths.push(arg);
  }
}

if (paths.length < 2) {
  console.error('cp: missing file operand');
  process.exit(1);
}

const dest = path.resolve(paths[paths.length - 1]);
const sources = paths.slice(0, paths.length - 1).map((p) => path.resolve(p));

try {
  for (const src of sources) {
    if (!fs.existsSync(src)) {
      console.error(`cp: cannot stat '${src}': No such file or directory`);
      process.exit(1);
    }
    const stat = fs.statSync(src);
    let targetFile = dest;
    if (fs.existsSync(dest) && fs.statSync(dest).isDirectory()) {
      targetFile = path.join(dest, path.basename(src));
    }

    if (stat.isDirectory()) {
      if (!recursive) {
        console.error(`cp: -r not specified; omitting directory '${src}'`);
        process.exit(1);
      }
      fs.cpSync(src, targetFile, { recursive: true });
    } else {
      fs.copyFileSync(src, targetFile);
    }
  }
} catch (err) {
  console.error(`cp: ${err.message}`);
  process.exit(1);
}
