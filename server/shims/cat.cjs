const fs = require('fs');

const args = process.argv.slice(2);
if (args.length === 0) {
  process.stdin.pipe(process.stdout);
} else {
  for (const file of args) {
    try {
      process.stdout.write(fs.readFileSync(file));
    } catch (err) {
      console.error(`cat: ${file}: ${err.message}`);
      process.exitCode = 1;
    }
  }
}
