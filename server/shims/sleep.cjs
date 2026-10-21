const seconds = parseFloat(process.argv[2]) || 1;
setTimeout(() => {
  process.exit(0);
}, seconds * 1000);
