const fs = require('fs');

const args = process.argv.slice(2);
let ignoreCase = false;
let pattern = '';
let file = null;

for (const arg of args) {
  if (arg === '-i' || arg === '--ignore-case') {
    ignoreCase = true;
  } else if (!pattern && !arg.startsWith('-')) {
    pattern = arg;
  } else if (!file && !arg.startsWith('-')) {
    file = arg;
  }
}

if (!pattern) process.exit(0);

try {
  const regex = new RegExp(pattern, ignoreCase ? 'i' : '');
  const input = file ? fs.readFileSync(file, 'utf-8') : fs.readFileSync(0, 'utf-8');
  const lines = input.split(/\r?\n/);
  let matched = false;
  for (const line of lines) {
    if (regex.test(line)) {
      console.log(line);
      matched = true;
    }
  }
  process.exit(matched ? 0 : 1);
} catch (err) {
  console.error(err.message);
  process.exit(1);
}
