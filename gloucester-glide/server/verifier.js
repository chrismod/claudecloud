// Kleiner Pool aus Worker-Threads, damit lange Nachspielläufe den Server nicht blockieren.
import { Worker } from 'node:worker_threads';
import os from 'node:os';

export function createVerifier({ size = Math.max(1, Math.min(4, os.availableParallelism() - 1)) } = {}) {
  const url = new URL('./verify-worker.js', import.meta.url);
  const idle = [];
  const queue = [];
  const pending = new Map();
  const workers = [];
  let nextJob = 1;

  function spawn() {
    const w = new Worker(url);
    workers.push(w);
    w.on('message', (msg) => {
      if (msg.ready) return release(w);
      const p = pending.get(msg.job);
      pending.delete(msg.job);
      release(w);
      p?.resolve(msg);
    });
    w.on('error', (err) => {
      for (const [job, p] of pending) if (p.worker === w) (pending.delete(job), p.reject(err));
      workers.splice(workers.indexOf(w), 1);
      const i = idle.indexOf(w);
      if (i >= 0) idle.splice(i, 1);
      if (!closed) spawn();
    });
  }

  function release(w) {
    const next = queue.shift();
    if (next) run(w, next);
    else idle.push(w);
  }

  function run(w, task) {
    pending.set(task.msg.job, { ...task, worker: w });
    w.postMessage(task.msg);
  }

  let closed = false;
  for (let i = 0; i < size; i++) spawn();

  return {
    verify(trackId, cheese, inputs) {
      return new Promise((resolve, reject) => {
        const task = { msg: { job: nextJob++, trackId, cheese, inputs }, resolve, reject };
        const w = idle.pop();
        if (w) run(w, task);
        else queue.push(task);
      });
    },
    get queued() {
      return queue.length;
    },
    async close() {
      closed = true;
      await Promise.all(workers.map((w) => w.terminate()));
    },
  };
}
