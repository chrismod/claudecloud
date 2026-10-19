// Startet Server (mit Neustart bei Änderungen) und Vite gemeinsam: npm run dev
import { spawn } from 'node:child_process';

const procs = [
  spawn('node', ['--disable-warning=ExperimentalWarning', '--watch', 'server/index.js'], { stdio: 'inherit' }),
  spawn('npx', ['vite'], { stdio: 'inherit' }),
];
const stop = () => procs.forEach((p) => p.kill());
process.on('SIGINT', stop);
process.on('SIGTERM', stop);
procs.forEach((p) => p.on('exit', (code) => (stop(), process.exit(code ?? 0))));
