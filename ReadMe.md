Workshop 1: Designing a System that Scales to Millions of Users
Course: Fundamentals of System Security (COMSM0122)[cite: 2]

Overview
This project implements an incrementally scaling system architecture, load-balancing testbed, fault-tolerance mechanisms, and DDoS/abusive traffic defences handling from tens to millions of user requests[cite: 2, 4].

Task A: Scalable System Design & Simulation
Architectural Design:** Evaluated vertical vs. horizontal scaling, replica counts (up to 100), and session capacity bounds[cite: 2].
Load-Balancing Algorithms:** Compared *Round Robin*, *Least Connections*, and *Consistent Hashing* under heavy traffic spikes[cite: 2].
Simulation:** Automated stress tests running via `RequestSimulation.js` across intervals from 500ms down to 1ms[cite: 4].

Task B: Resilience & Security Defences
B.1 Fault Tolerance: Integrated active health checks, automatic server quarantine, failover routing retry mechanisms, and node recovery tracking[cite: 4].
B.2 Abusive Traffic Defences: Developed a threat model mitigating volumetric floods, storage exhaustion via oversized payloads (>10MB), and slow-processing resource hogging using rate-limiting, size checks, and hard request timeouts[cite: 4].
