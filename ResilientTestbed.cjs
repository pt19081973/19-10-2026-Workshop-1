// ResilientTestbed.js
const http = require('http');

class BackendServer {
  constructor(id, maxSessions, processingTimeMs) {
    this.id = id;
    this.maxSessions = maxSessions;
    this.processingTimeMs = processingTimeMs;
    this.activeSessions = 0;
    this.healthy = true;
  }

  async handleRequest(payloadSizeMB, datastore) {
    if (!this.healthy) throw new Error(`SERVER_DOWN_${this.id}`);
    if (this.activeSessions >= this.maxSessions) {
      return { granted: false, reason: 'SERVER_SESSION_LIMIT_REACHED' };
    }
    this.activeSessions++;
    try {
      await new Promise((r) => setTimeout(r, this.processingTimeMs));
      if (!this.healthy) throw new Error(`SERVER_CRASHED_${this.id}`);
      const dbWrite = datastore.write(payloadSizeMB);
      if (!dbWrite) return { granted: false, reason: 'DATASTORE_FULL' };
      return { granted: true, reason: 'Session ACCESS GRANTED' };
    } finally {
      this.activeSessions = Math.max(0, this.activeSessions - 1);
    }
  }
}

class Datastore {
  constructor(id, capacityMB) {
    this.id = id;
    this.capacityMB = capacityMB;
    this.usedMB = 0;
    this.healthy = true;
  }
  write(sizeMB) {
    if (!this.healthy || this.usedMB + sizeMB > this.capacityMB) return false;
    this.usedMB += sizeMB;
    return true;
  }
}

class LoadBalancer {
  constructor(servers, datastores, options = {}) {
    this.allServers = servers;
    this.healthyServers = [...servers];
    this.datastores = datastores;
    this.enableFaultTolerance = options.enableFaultTolerance ?? false;
    this.enableDefences = options.enableDefences ?? false;
    this.maxPayloadSizeMB = options.maxPayloadSizeMB ?? 10;
    this.rateLimitPerWindow = options.rateLimitPerWindow ?? 15;
    this.requestTimeoutMs = options.requestTimeoutMs ?? 150;
    this.clientCounts = new Map();
    this.metrics = { failoverRetries: 0, healthProbes: 0, recoveryTimeMs: 0, lastFail: null };

    if (this.enableFaultTolerance) {
      this.healthTimer = setInterval(() => {
        for (const s of this.allServers) {
          this.metrics.healthProbes++;
          const inPool = this.healthyServers.includes(s);
          if (!s.healthy && inPool) {
            this.healthyServers = this.healthyServers.filter(x => x.id !== s.id);
          } else if (s.healthy && !inPool) {
            this.healthyServers.push(s);
            if (this.metrics.lastFail) {
              this.metrics.recoveryTimeMs = Date.now() - this.metrics.lastFail;
              this.metrics.lastFail = null;
            }
          }
        }
      }, 50);
    }
  }

  stop() { if (this.healthTimer) clearInterval(this.healthTimer); }

  async route(req) {
    if (this.enableDefences) {
      if (req.payloadSizeMB > this.maxPayloadSizeMB) {
        return { granted: false, reason: '413_PAYLOAD_TOO_LARGE' };
      }
      const win = Math.floor(Date.now() / 100);
      const key = `${req.clientId}_${win}`;
      const c = (this.clientCounts.get(key) || 0) + 1;
      this.clientCounts.set(key, c);
      if (c > this.rateLimitPerWindow) {
        return { granted: false, reason: '429_RATE_LIMITED' };
      }
    }

    const exec = async () => {
      const pool = this.enableFaultTolerance ? this.healthyServers : this.allServers;
      if (pool.length === 0) return { granted: false, reason: 'NO_SERVERS' };
      const srv = pool.reduce((a, b) => a.activeSessions < b.activeSessions ? a : b);
      const ds = this.datastores.find(d => d.healthy) || this.datastores[0];

      if (this.enableDefences) {
        return await Promise.race([
          srv.handleRequest(req.payloadSizeMB, ds),
          new Promise(r => setTimeout(() => r({ granted: false, reason: '408_TIMEOUT' }), this.requestTimeoutMs))
        ]);
      }
      return await srv.handleRequest(req.payloadSizeMB, ds);
    };

    try {
      return await exec();
    } catch {
      if (this.enableFaultTolerance) {
        this.metrics.failoverRetries++;
        this.healthyServers = this.healthyServers.filter(s => s.healthy);
        try { return await exec(); } catch (e) { return { granted: false, reason: e.message }; }
      }
      return { granted: false, reason: 'LOST_REQUEST' };
    }
  }
}

async function runTaskB() {
  console.log('\nRunning Task B Evaluations...\n');

  // Test B.1: Fault Tolerance Simulation
  const srvs = [new BackendServer(1,10,30), new BackendServer(2,10,30), new BackendServer(3,10,30)];
  const dss = [new Datastore(1, 5000)];
  const lbFT = new LoadBalancer(srvs, dss, { enableFaultTolerance: true });

  setTimeout(() => { srvs[1].healthy = false; lbFT.metrics.lastFail = Date.now(); }, 100);
  setTimeout(() => { srvs[1].healthy = true; }, 300);

  let ftSuccess = 0, ftFail = 0;
  for (let i = 0; i < 100; i++) {
    const res = await lbFT.route({ clientId: 'user', payloadSizeMB: 2 });
    if (res.granted) ftSuccess++; else ftFail++;
    await new Promise(r => setTimeout(r, 5));
  }
  lbFT.stop();

  console.log('--- Task B.1 Fault Tolerance Results ---');
  console.table([{
    SuccessRate: `${ftSuccess}%`,
    FailedOrLost: ftFail,
    FailoverRetries: lbFT.metrics.failoverRetries,
    RecoveryTimeMs: `${lbFT.metrics.recoveryTimeMs}ms`
  }]);

  // Test B.2: Abusive Traffic Defences Simulation
  const lbDef = new LoadBalancer(
    [new BackendServer(1,10,20), new BackendServer(2,10,20)],
    [new Datastore(1, 200)], // Small datastore to test storage exhaustion
    { enableFaultTolerance: true, enableDefences: true, maxPayloadSizeMB: 5 }
  );

  let legitOk = 0, legitTot = 0, abusiveRejected = 0;
  for (let i = 0; i < 50; i++) {
    legitTot++;
    const r1 = await lbDef.route({ clientId: 'legit', payloadSizeMB: 2 });
    if (r1.granted) legitOk++;

    const r2 = await lbDef.route({ clientId: 'attacker', payloadSizeMB: 100 }); // Oversized payload
    if (!r2.granted) abusiveRejected++;
  }
  lbDef.stop();

  console.log('\n--- Task B.2 Abusive Traffic Defences Results ---');
  console.table([{
    LegitRequestsServed: `${legitOk}/${legitTot}`,
    AbusivePayloadsRejected: abusiveRejected
  }]);
}

runTaskB();