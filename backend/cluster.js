const cluster = require('cluster');
const os = require('os');

const requestedWorkers = parseInt(process.env.WEB_CONCURRENCY || '0', 10);
const workerCount = Math.max(1, requestedWorkers || Math.min(os.cpus().length, 4));

if (cluster.isPrimary) {
  console.log(`[CLUSTER] Starting ${workerCount} worker(s)`);
  for (let i = 0; i < workerCount; i++) {
    cluster.fork();
  }

  cluster.on('exit', (worker, code, signal) => {
    console.error(`[CLUSTER] Worker ${worker.process.pid} exited with code ${code || signal}. Restarting.`);
    cluster.fork();
  });
} else {
  require('./server').startServer();
}
