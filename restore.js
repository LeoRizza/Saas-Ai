import { execSync } from 'child_process';
try {
  execSync('git checkout server.ts');
  console.log('Restored server.ts');
} catch (e) {
  console.error(e.message);
}
