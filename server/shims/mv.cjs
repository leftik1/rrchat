const fs = require('fs');
const path = require('path');

const args = process.argv.slice(2).filter((a) => !a.startsWith('-'));
if (args.length < 2) {
  console.error('mv: missing destination file operand');
  process.exit(1);
}

const dest = path.resolve(args[args.length - 1]);
const sources = args.slice(0, args.length - 1).map((p) => path.resolve(p));

try {
  for (const src of sources) {
    if (!fs.existsSync(src)) {
      console.error(`mv: cannot stat '${src}': No such file or directory`);
      process.exit(1);
    }
    let target = dest;
    if (fs.existsSync(dest) && fs.statSync(dest).isDirectory()) {
      target = path.join(dest, path.basename(src));
    }
    fs.renameSync(src, target);
  }
} catch (err) {
  console.error(`mv: ${err.message}`);
  process.exit(1);
}
