const fs = require('fs');

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

try {
  const input = file ? fs.readFileSync(file, 'utf-8') : fs.readFileSync(0, 'utf-8');
  const lines = input.split(/\r?\n/);
  if (lines.length > 0 && lines[lines.length - 1] === '') {
    lines.pop();
  }
  const tail = lines.slice(Math.max(0, lines.length - n));
  for (const l of tail) {
    console.log(l);
  }
} catch (err) {
  console.error(err.message);
  process.exit(1);
}
