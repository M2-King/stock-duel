// Run prebuild-install for better-sqlite3 by setting cwd and exec'ing it directly
process.chdir('D:/Stock-Double Play/node_modules/.pnpm/better-sqlite3@11.10.0/node_modules/better-sqlite3');
process.argv = [process.argv[0], 'prebuild-install'];
require('D:/Stock-Double Play/node_modules/.pnpm/prebuild-install@7.1.3/node_modules/prebuild-install/bin.js');
