// RequestSimulation.cjs (CommonJS Version)
const http = require('http');

const INTERVALS_MS = [
  500, 450, 400, 350, 300, 250, 200, 150, 100, 50, 40, 30, 20, 15, 10, 5, 1
];

const TARGET_HOST = 'localhost';
const TARGET_PORT = 8080;

function generatePayload() {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
  let result = 'payload_';
  for (let i = 0; i < 50; i++) {
    result += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return result;
}

function sendRequest(payload) {
  return new Promise((resolve) => {
    const startTime = Date.now();
    const req = http.get(
      {
        hostname: TARGET_HOST,
        port: TARGET_PORT,
        path: `/${encodeURIComponent(payload)}`,
        timeout: 5000
      },
      (res) => {
        let data = '';
        res.on('data', (chunk) => (data += chunk));
        res.on('end', () => {
          const latency = Date.now() - startTime;
          const isGranted = data.includes('Session ACCESS GRANTED');
          resolve({
            success: isGranted,
            status: res.statusCode,
            latency
          });
        });
      }
    );

    req.on('error', () => {
      resolve({ success: false, status: 0, latency: Date.now() - startTime });
    });

    req.on('timeout', () => {
      req.destroy();
      resolve({ success: false, status: 408, latency: Date.now() - startTime });
    });
  });
}

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

async function simulateAtInterval(numRequests, intervalMs) {
  let granted = 0;
  let denied = 0;
  let totalLatency = 0;
  const promises = [];

  const startBatch = Date.now();

  for (let i = 0; i < numRequests; i++) {
    const payload = generatePayload();
    const p = sendRequest(payload).then((res) => {
      totalLatency += res.latency;
      if (res.success) {
        granted++;
      } else {
        denied++;
      }
    });
    promises.push(p);
    if (intervalMs > 1) {
      await sleep(intervalMs);
    }
  }

  await Promise.all(promises);
  const totalTime = Date.now() - startBatch;
  const successRate = ((granted / numRequests) * 100).toFixed(2);
  const failureRate = ((denied / numRequests) * 100).toFixed(2);
  const avgLatency = (totalLatency / numRequests).toFixed(1);

  return {
    intervalMs: `${intervalMs}ms`,
    requests: numRequests,
    successRate: `${successRate}%`,
    failureRate: `${failureRate}%`,
    avgLatency: `${avgLatency}ms`,
    duration: `${totalTime}ms`
  };
}

async function runFullSimulation() {
  const numRequests = parseInt(process.argv[2], 10) || 20;
  console.log(`\n=== Running Simulation with ${numRequests} requests per interval tier ===\n`);

  const summaryTable = [];

  for (const intervalMs of INTERVALS_MS) {
    process.stdout.write(`Testing interval: ${intervalMs}ms ... `);
    const result = await simulateAtInterval(numRequests, intervalMs);
    console.log(`Success: ${result.successRate} | Failure: ${result.failureRate}`);
    summaryTable.push(result);
  }

  console.log('\n--- Final Simulation Summary Table ---');
  console.table(summaryTable);
}

runFullSimulation();