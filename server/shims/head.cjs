const fs = require('fs');
const readline = require('readline');

const args = process.argv.slice(2);
let n = 10;
let file = null;

for (let i = 0; i < args.length; i++) {
  const arg = args[i];
  if (arg.startsWith('-n')) {
    n = parseInt(args[++i] || arg.slice(2), 10) || 10;
  } else if (arg.startsWith('-') && /^\d+$/.test(arg.slice(1))) {
    n = parseInt(arg.slice(1), 10) || 10;
  } else if (!arg.startsWith('-')) {
    file = arg;
  }
}

let count = 0;
const rl = readline.createInterface({
  input: file ? fs.createReadStream(file) : process.stdin,
  output: process.stdout,
  terminal: false,
});

rl.on('line', (line) => {
  if (count++ < n) {
    console.log(line);
  }
  if (count >= n) {
    process.exit(0);
  }
});
