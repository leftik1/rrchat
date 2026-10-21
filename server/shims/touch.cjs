const fs = require('fs');

const args = process.argv.slice(2).filter((a) => !a.startsWith('-'));
for (const file of args) {
  try {
    const fd = fs.openSync(file, 'a');
    fs.closeSync(fd);
  } catch (err) {
    console.error(`touch: ${file}: ${err.message}`);
    process.exitCode = 1;
  }
}
