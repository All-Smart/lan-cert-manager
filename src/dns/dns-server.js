/**
 * @module dns-server
 * @description Lightweight DNS server with local zone resolution and upstream forwarding
 */

const dns2 = require('dns2');
const { Packet } = dns2;
const config = require('../config');
const db = require('../db/database');

let server = null;
let running = false;

/**
 * Resolve a query against local records
 * @param {string} name - Query name
 * @param {string} type - Query type string
 * @returns {Array|null} Matching records or null
 */
function resolveLocal(name, type) {
  const typeName = getTypeName(type);
  if (!typeName) return null;

  let records = db.dns.resolve(name, typeName);

  // If CNAME found, also resolve the CNAME target
  if (records.length === 0 && typeName !== 'CNAME') {
    const cnames = db.dns.resolve(name, 'CNAME');
    if (cnames.length > 0) {
      return cnames; // Return CNAME, let client follow
    }
  }

  return records.length > 0 ? records : null;
}

/**
 * Map numeric DNS type to string
 */
function getTypeName(type) {
  const map = { 1: 'A', 28: 'AAAA', 5: 'CNAME' };
  return map[type] || null;
}

/**
 * Start the DNS server
 * @returns {Promise<void>}
 */
function start() {
  return new Promise((resolve, reject) => {
    if (running) return resolve();

    server = dns2.createServer({
      udp: true,
      handle: async (request, send, rinfo) => {
        const response = Packet.createResponseFromRequest(request);

        for (const question of request.questions) {
          const { name, type } = question;
          const typeName = getTypeName(type);

          // Try local resolution
          const localRecords = resolveLocal(name, type);

          if (localRecords) {
            for (const rec of localRecords) {
              if (rec.type === 'A') {
                response.answers.push({
                  name, type: Packet.TYPE.A, class: Packet.CLASS.IN,
                  ttl: rec.ttl, address: rec.value,
                });
              } else if (rec.type === 'AAAA') {
                response.answers.push({
                  name, type: Packet.TYPE.AAAA, class: Packet.CLASS.IN,
                  ttl: rec.ttl, address: rec.value,
                });
              } else if (rec.type === 'CNAME') {
                response.answers.push({
                  name, type: Packet.TYPE.CNAME, class: Packet.CLASS.IN,
                  ttl: rec.ttl, domain: rec.value,
                });
              }
            }
          } else {
            // Forward to upstream via dns2 UDPClient
            try {
              const upstream = config.upstreamDns[Math.floor(Math.random() * config.upstreamDns.length)];
              const resolve = dns2.UDPClient({ dns: upstream });
              const result = await resolve(name, typeName || 'A');
              if (result.answers) {
                response.answers.push(...result.answers);
              }
            } catch (err) {
              console.error(`DNS forward failed for ${name}: ${err.message}`);
            }
          }
        }

        send(response);
      },
    });

    server.on('error', (err) => {
      console.error('DNS server error:', err);
      if (!running) reject(err);
    });

    server.listen({ udp: config.dnsPort })
      .then(() => {
        running = true;
        console.log(`DNS server listening on port ${config.dnsPort}`);
        resolve();
      })
      .catch(reject);
  });
}

/**
 * Stop the DNS server
 */
function stop() {
  if (server && running) {
    server.close();
    running = false;
    console.log('DNS server stopped');
  }
}

/**
 * Get server status
 * @returns {{ running: boolean, port: number }}
 */
function getStatus() {
  return { running, port: config.dnsPort };
}

module.exports = { start, stop, getStatus };
