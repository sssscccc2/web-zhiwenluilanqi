const { SocksClient } = require('socks');

// Country -> local DNS servers (ISP/national DNS that look "normal" for that country)
const COUNTRY_DNS = {
  PH: ['121.58.203.4', '121.58.203.3'],          // PLDT Philippines
  US: ['209.244.0.3', '209.244.0.4'],             // Level3
  GB: ['77.88.8.8', '195.46.39.39'],              // Sky UK / BT
  DE: ['217.237.150.33', '194.25.0.60'],           // Deutsche Telekom
  FR: ['80.67.169.12', '80.67.169.40'],            // FDN France
  JP: ['210.188.224.10', '210.188.224.11'],         // IIJ Japan
  KR: ['168.126.63.1', '168.126.63.2'],            // KT Korea
  SG: ['165.21.83.88', '165.21.100.88'],            // Singtel
  HK: ['205.252.144.228', '208.151.69.65'],         // PCCW
  TW: ['168.95.1.1', '168.95.192.1'],              // HiNet (Chunghwa Telecom)
  IN: ['49.45.0.1', '117.96.40.72'],               // BSNL India
  ID: ['202.134.0.155', '202.134.0.62'],            // Telkom Indonesia
  TH: ['203.113.5.130', '203.113.5.131'],           // CAT Telecom Thailand
  VN: ['203.162.4.191', '203.162.4.190'],           // VNPT Vietnam
  MY: ['49.236.193.35', '49.236.193.36'],           // TMNet Malaysia
  BR: ['200.221.11.100', '200.221.11.101'],         // Telefonica Brazil
  MX: ['200.33.146.217', '200.33.146.218'],         // Telmex Mexico
  AR: ['200.49.130.41', '200.49.130.42'],           // Telefonica Argentina
  RU: ['195.46.39.39', '195.46.39.40'],             // TTK Russia
  AU: ['61.88.88.88', '139.130.4.4'],               // Telstra Australia
  CA: ['209.244.0.3', '209.244.0.4'],               // Level3 (used by Rogers/Bell)
  IT: ['151.99.0.100', '151.99.125.1'],             // Telecom Italia
  ES: ['80.58.61.250', '80.58.61.254'],             // Telefonica Spain
  NL: ['195.121.1.34', '195.121.1.66'],             // XS4ALL
  PL: ['194.204.152.34', '194.204.159.1'],          // TP Poland
  TR: ['195.175.39.39', '195.175.39.40'],           // Turk Telekom
  UA: ['194.44.214.2', '194.44.214.6'],             // Ukrainian Telecom
  ZA: ['196.43.46.190', '196.43.34.2'],             // Internet Solutions SA
  NG: ['154.113.0.5', '154.113.0.6'],               // MainOne Nigeria
  EG: ['163.121.128.134', '163.121.128.135'],       // TE Data Egypt
  SA: ['212.26.44.55', '212.26.22.55'],             // STC Saudi Arabia
  AE: ['94.200.200.200', '94.200.201.201'],         // du UAE
  CO: ['200.75.51.132', '200.75.51.133'],           // ETB Colombia
  CL: ['200.1.123.46', '200.1.123.47'],             // CTC Chile
  PE: ['200.48.225.130', '200.48.225.146'],         // Telefonica Peru
  BD: ['114.130.20.66', '114.130.20.88'],           // BTCL Bangladesh
  PK: ['209.150.154.1', '57.29.178.114'],           // PTCL Pakistan
  NP: ['116.66.199.68', '116.66.199.69'],           // Nepal Telecom
};

const DNS_FALLBACK = ['1.1.1.1', '1.0.0.1']; // Cloudflare (global anycast, resolves locally)

function getDnsForCountry(countryCode) {
  const code = (countryCode || '').toUpperCase();
  return COUNTRY_DNS[code] || DNS_FALLBACK;
}

/**
 * Resolve a hostname via DNS-over-TCP through a SOCKS5 proxy to a specific DNS server.
 * This ensures DNS queries go through the proxy tunnel to the target country's DNS.
 */
async function resolveThroughSocks(hostname, socksProxy, dnsServer, timeout = 8000) {
  const dnsQuery = buildDnsQuery(hostname);
  const tcpPayload = Buffer.alloc(2 + dnsQuery.length);
  tcpPayload.writeUInt16BE(dnsQuery.length, 0);
  dnsQuery.copy(tcpPayload, 2);

  const { socket } = await SocksClient.createConnection({
    proxy: {
      host: socksProxy.host,
      port: socksProxy.port,
      type: 5,
      userId: socksProxy.user || undefined,
      password: socksProxy.pass || undefined,
    },
    command: 'connect',
    destination: { host: dnsServer, port: 53 },
    timeout,
  });

  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      socket.destroy();
      reject(new Error('DNS resolve timeout'));
    }, timeout);

    let responseBuffer = Buffer.alloc(0);
    socket.on('data', (chunk) => {
      responseBuffer = Buffer.concat([responseBuffer, chunk]);
      if (responseBuffer.length >= 2) {
        const respLen = responseBuffer.readUInt16BE(0);
        if (responseBuffer.length >= 2 + respLen) {
          clearTimeout(timer);
          socket.destroy();
          const dnsResponse = responseBuffer.slice(2, 2 + respLen);
          const ip = parseDnsResponse(dnsResponse);
          if (ip) {
            resolve(ip);
          } else {
            reject(new Error(`DNS: no A record for ${hostname}`));
          }
        }
      }
    });

    socket.on('error', (err) => {
      clearTimeout(timer);
      reject(err);
    });

    socket.write(tcpPayload);
  });
}

function buildDnsQuery(hostname) {
  const id = Buffer.alloc(2);
  id.writeUInt16BE(Math.floor(Math.random() * 65535));

  const flags = Buffer.from([0x01, 0x00]); // Standard query, recursion desired
  const counts = Buffer.from([0x00, 0x01, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00]); // 1 question

  const parts = hostname.split('.');
  const qname = [];
  for (const part of parts) {
    qname.push(part.length);
    for (let i = 0; i < part.length; i++) qname.push(part.charCodeAt(i));
  }
  qname.push(0); // root label

  const qtype = Buffer.from([0x00, 0x01]);  // A record
  const qclass = Buffer.from([0x00, 0x01]); // IN class

  return Buffer.concat([id, flags, counts, Buffer.from(qname), qtype, qclass]);
}

function parseDnsResponse(buf) {
  if (buf.length < 12) return null;

  const qdcount = buf.readUInt16BE(4);
  const ancount = buf.readUInt16BE(6);

  let offset = 12;

  // Skip question section
  for (let i = 0; i < qdcount; i++) {
    while (offset < buf.length && buf[offset] !== 0) {
      if ((buf[offset] & 0xc0) === 0xc0) { offset += 2; break; }
      offset += buf[offset] + 1;
    }
    if (offset < buf.length && buf[offset] === 0) offset++;
    offset += 4; // qtype + qclass
  }

  // Parse answer section - find first A record (type 1)
  for (let i = 0; i < ancount; i++) {
    if (offset >= buf.length) break;
    // Skip name (might be pointer)
    if ((buf[offset] & 0xc0) === 0xc0) {
      offset += 2;
    } else {
      while (offset < buf.length && buf[offset] !== 0) offset += buf[offset] + 1;
      if (offset < buf.length) offset++; // skip null
    }

    if (offset + 10 > buf.length) break;
    const rtype = buf.readUInt16BE(offset);
    const rdlength = buf.readUInt16BE(offset + 8);
    offset += 10;

    if (rtype === 1 && rdlength === 4 && offset + 4 <= buf.length) {
      return `${buf[offset]}.${buf[offset + 1]}.${buf[offset + 2]}.${buf[offset + 3]}`;
    }
    offset += rdlength;
  }

  return null;
}

/**
 * Detect the exit IP's country by querying a geolocation API through the SOCKS proxy.
 */
async function detectCountry(socksProxy, timeout = 10000) {
  try {
    const { socket } = await SocksClient.createConnection({
      proxy: {
        host: socksProxy.host,
        port: socksProxy.port,
        type: 5,
        userId: socksProxy.user || undefined,
        password: socksProxy.pass || undefined,
      },
      command: 'connect',
      destination: { host: 'ip-api.com', port: 80 },
      timeout,
    });

    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        socket.destroy();
        resolve(null);
      }, timeout);

      let data = '';
      socket.on('data', (chunk) => {
        data += chunk.toString();
        if (data.includes('\r\n\r\n') && data.includes('}')) {
          clearTimeout(timer);
          socket.destroy();
          try {
            const body = data.split('\r\n\r\n').slice(1).join('');
            const json = JSON.parse(body);
            resolve({
              country: json.countryCode,
              city: json.city,
              ip: json.query,
              isp: json.isp,
            });
          } catch (e) {
            resolve(null);
          }
        }
      });

      socket.on('error', () => {
        clearTimeout(timer);
        resolve(null);
      });

      socket.write(
        'GET /json?fields=countryCode,city,query,isp HTTP/1.1\r\n' +
        'Host: ip-api.com\r\n' +
        'Connection: close\r\n\r\n'
      );
    });
  } catch (e) {
    return null;
  }
}

// Simple LRU DNS cache to avoid repeated lookups
const dnsCache = new Map();
const DNS_CACHE_TTL = 300000; // 5 minutes

function getCachedDns(hostname) {
  const entry = dnsCache.get(hostname);
  if (entry && Date.now() - entry.time < DNS_CACHE_TTL) return entry.ip;
  if (entry) dnsCache.delete(hostname);
  return null;
}

function setCachedDns(hostname, ip) {
  if (dnsCache.size > 5000) {
    const oldest = dnsCache.keys().next().value;
    dnsCache.delete(oldest);
  }
  dnsCache.set(hostname, { ip, time: Date.now() });
}

module.exports = {
  COUNTRY_DNS,
  DNS_FALLBACK,
  getDnsForCountry,
  resolveThroughSocks,
  detectCountry,
  getCachedDns,
  setCachedDns,
};
