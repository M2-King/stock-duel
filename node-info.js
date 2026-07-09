try {
  const sqlite = require('node:sqlite');
  console.log('node:sqlite is available:', !!sqlite.DatabaseSync);
} catch (e) {
  console.log('node:sqlite NOT available:', e.message);
}
