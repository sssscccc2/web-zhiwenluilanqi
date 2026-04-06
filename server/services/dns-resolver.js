const { SocksClient } = require('socks');

// ISP keyword -> DNS servers mapping (fuzzy match against detected ISP name)
// When exit IP's ISP matches a keyword, use that ISP's own DNS for maximum realism
const ISP_DNS = {
  // === Philippines ===
  'pldt':           ['121.58.203.4', '121.58.203.3'],
  'smart':          ['121.58.203.4', '121.58.203.3'],     // Smart is PLDT subsidiary
  'globe':          ['120.28.0.18', '120.28.0.19'],
  'converge':       ['124.6.181.10', '124.6.181.9'],
  'sky cable':      ['202.78.96.3', '202.78.96.4'],
  'dito':           ['121.58.203.4', '121.58.203.3'],     // DITO uses PLDT backbone

  // === United States ===
  'comcast':        ['75.75.75.75', '75.75.76.76'],
  'xfinity':        ['75.75.75.75', '75.75.76.76'],
  'verizon':        ['4.2.2.1', '4.2.2.2'],
  'at&t':           ['68.94.156.1', '68.94.157.1'],
  'att ':           ['68.94.156.1', '68.94.157.1'],
  'spectrum':       ['209.18.47.61', '209.18.47.62'],
  'charter':        ['209.18.47.61', '209.18.47.62'],
  'cox':            ['68.105.28.11', '68.105.28.12'],
  't-mobile':       ['208.67.222.222', '208.67.220.220'], // T-Mobile uses OpenDNS
  'centurylink':    ['205.171.3.65', '205.171.2.65'],
  'lumen':          ['205.171.3.65', '205.171.2.65'],

  // === United Kingdom ===
  'bt ':            ['194.72.9.38', '194.72.9.34'],
  'british telecom':['194.72.9.38', '194.72.9.34'],
  'sky broadband':  ['90.207.238.97', '90.207.238.100'],
  'virgin media':   ['194.168.4.100', '194.168.8.100'],
  'talktalk':       ['62.24.228.167', '62.24.228.168'],
  'vodafone uk':    ['90.255.232.1', '90.255.232.2'],
  'ee ':            ['61.88.88.88', '139.130.4.4'],

  // === Germany ===
  'telekom':        ['217.237.150.33', '194.25.0.60'],
  'vodafone de':    ['139.7.30.1', '139.7.30.2'],
  'o2 ':            ['62.134.11.4', '195.182.110.132'],
  '1&1':            ['217.237.150.33', '194.25.0.60'],

  // === France ===
  'orange':         ['80.10.246.1', '80.10.246.132'],
  'sfr':            ['109.0.66.10', '109.0.66.20'],
  'free ':          ['212.27.40.240', '212.27.40.241'],
  'bouygues':       ['194.158.122.10', '194.158.122.15'],

  // === Japan ===
  'ntt ':           ['210.188.224.10', '210.188.224.11'],
  'softbank':       ['202.172.28.1', '202.172.28.2'],
  'kddi':           ['210.196.3.183', '61.195.56.161'],
  'au ':            ['210.196.3.183', '61.195.56.161'],

  // === South Korea ===
  'kt ':            ['168.126.63.1', '168.126.63.2'],
  'korea telecom':  ['168.126.63.1', '168.126.63.2'],
  'sk telecom':     ['210.220.163.82', '219.250.36.130'],
  'sk broadband':   ['210.220.163.82', '219.250.36.130'],
  'lg u+':          ['164.124.101.2', '203.248.252.2'],

  // === Singapore ===
  'singtel':        ['165.21.83.88', '165.21.100.88'],
  'starhub':        ['203.116.165.124', '203.116.165.125'],
  'm1 ':            ['203.188.200.20', '203.188.200.21'],

  // === India ===
  'jio':            ['49.44.108.131', '49.44.109.131'],
  'reliance':       ['49.44.108.131', '49.44.109.131'],
  'airtel':         ['122.179.12.20', '122.179.12.21'],
  'bsnl':           ['49.45.0.1', '117.96.40.72'],
  'vodafone in':    ['198.153.192.1', '198.153.194.1'],
  'idea':           ['198.153.192.1', '198.153.194.1'],

  // === Indonesia ===
  'telkom':         ['202.134.0.155', '202.134.0.62'],
  'indosat':        ['202.155.0.10', '202.155.0.15'],
  'xl axiata':      ['202.154.1.2', '202.154.1.3'],
  'biznet':         ['202.169.33.22', '202.169.33.23'],

  // === Thailand ===
  'true ':          ['203.144.207.29', '203.144.207.49'],
  'ais ':           ['203.113.5.130', '203.113.5.131'],
  'dtac':           ['203.113.5.130', '203.113.5.131'],
  'tot ':           ['203.113.5.130', '203.113.5.131'],

  // === Vietnam ===
  'vnpt':           ['203.162.4.191', '203.162.4.190'],
  'viettel':        ['203.113.131.1', '203.113.131.2'],
  'fpt ':           ['210.245.24.20', '210.245.24.22'],

  // === Malaysia ===
  'tm ':            ['49.236.193.35', '49.236.193.36'],
  'maxis':          ['61.6.4.4', '61.6.4.5'],
  'digi':           ['49.236.193.35', '49.236.193.36'],
  'celcom':         ['49.236.193.35', '49.236.193.36'],

  // === Brazil ===
  'vivo':           ['200.221.11.100', '200.221.11.101'],
  'claro':          ['200.169.126.100', '200.169.126.101'],
  'tim ':           ['200.175.89.139', '200.175.89.140'],
  'oi ':            ['200.222.0.33', '200.222.0.34'],

  // === Russia ===
  'rostelecom':     ['195.46.39.39', '195.46.39.40'],
  'mts ':           ['217.66.152.48', '217.66.152.49'],
  'beeline':        ['85.21.192.3', '213.234.192.7'],
  'megafon':        ['195.46.39.39', '195.46.39.40'],

  // === Australia ===
  'telstra':        ['61.88.88.88', '139.130.4.4'],
  'optus':          ['198.142.0.51', '198.142.0.52'],
  'tpg':            ['203.12.160.35', '203.12.160.36'],

  // === Canada ===
  'rogers':         ['64.71.255.198', '64.71.255.204'],
  'bell ':          ['209.148.180.15', '209.148.180.16'],
  'shaw':           ['64.59.144.17', '64.59.144.18'],
  'telus':          ['154.11.1.1', '154.11.1.2'],

  // === Mexico ===
  'telmex':         ['200.33.146.217', '200.33.146.218'],
  'totalplay':      ['200.33.146.217', '200.33.146.218'],

  // === Turkey ===
  'turk telekom':   ['195.175.39.39', '195.175.39.40'],
  'turkcell':       ['195.175.39.39', '195.175.39.40'],
  'superonline':    ['195.175.39.39', '195.175.39.40'],

  // === Taiwan ===
  'chunghwa':       ['168.95.1.1', '168.95.192.1'],
  'hinet':          ['168.95.1.1', '168.95.192.1'],
  'taiwan mobile':  ['168.95.1.1', '168.95.192.1'],
  'far eastone':    ['168.95.1.1', '168.95.192.1'],

  // === Hong Kong ===
  'pccw':           ['205.252.144.228', '208.151.69.65'],
  'hkt':            ['205.252.144.228', '208.151.69.65'],
  'hong kong broadband': ['203.80.96.10', '203.80.96.11'],
  'hkbn':           ['203.80.96.10', '203.80.96.11'],
  'smartone':       ['202.14.67.4', '202.14.67.14'],
  'china mobile hk':['223.120.32.1', '223.120.32.2'],
};

// Country -> default DNS servers (most popular ISP in that country)
const COUNTRY_DNS = {
  PH: ['121.58.203.4', '121.58.203.3'],          // PLDT (largest ISP)
  US: ['75.75.75.75', '75.75.76.76'],             // Comcast (largest ISP)
  GB: ['194.72.9.38', '194.72.9.34'],             // BT (largest ISP)
  DE: ['217.237.150.33', '194.25.0.60'],           // Deutsche Telekom
  FR: ['80.10.246.1', '80.10.246.132'],            // Orange France
  JP: ['210.188.224.10', '210.188.224.11'],         // NTT/IIJ
  KR: ['168.126.63.1', '168.126.63.2'],            // KT Korea
  SG: ['165.21.83.88', '165.21.100.88'],            // Singtel
  HK: ['205.252.144.228', '208.151.69.65'],         // PCCW/HKT
  TW: ['168.95.1.1', '168.95.192.1'],              // HiNet (Chunghwa Telecom)
  IN: ['49.45.0.1', '117.96.40.72'],               // BSNL
  ID: ['202.134.0.155', '202.134.0.62'],            // Telkom Indonesia
  TH: ['203.113.5.130', '203.113.5.131'],           // CAT/AIS
  VN: ['203.162.4.191', '203.162.4.190'],           // VNPT
  MY: ['49.236.193.35', '49.236.193.36'],           // TM
  BR: ['200.221.11.100', '200.221.11.101'],         // Vivo/Telefonica
  MX: ['200.33.146.217', '200.33.146.218'],         // Telmex
  AR: ['200.49.130.41', '200.49.130.42'],           // Telefonica
  RU: ['195.46.39.39', '195.46.39.40'],             // Rostelecom
  AU: ['61.88.88.88', '139.130.4.4'],               // Telstra
  CA: ['64.71.255.198', '64.71.255.204'],           // Rogers
  IT: ['151.99.0.100', '151.99.125.1'],             // Telecom Italia
  ES: ['80.58.61.250', '80.58.61.254'],             // Telefonica
  NL: ['195.121.1.34', '195.121.1.66'],             // XS4ALL/KPN
  PL: ['194.204.152.34', '194.204.159.1'],          // TP Poland
  TR: ['195.175.39.39', '195.175.39.40'],           // Turk Telekom
  UA: ['194.44.214.2', '194.44.214.6'],             // Ukrtelecom
  ZA: ['196.43.46.190', '196.43.34.2'],             // Internet Solutions
  NG: ['154.113.0.5', '154.113.0.6'],               // MainOne
  EG: ['163.121.128.134', '163.121.128.135'],       // TE Data
  SA: ['212.26.44.55', '212.26.22.55'],             // STC
  AE: ['94.200.200.200', '94.200.201.201'],         // du
  CO: ['200.75.51.132', '200.75.51.133'],           // ETB
  CL: ['200.1.123.46', '200.1.123.47'],             // CTC
  PE: ['200.48.225.130', '200.48.225.146'],         // Telefonica
  BD: ['114.130.20.66', '114.130.20.88'],           // BTCL
  PK: ['209.150.154.1', '57.29.178.114'],           // PTCL
  NP: ['116.66.199.68', '116.66.199.69'],           // Nepal Telecom
  LK: ['203.115.0.97', '203.115.0.98'],             // Sri Lanka Telecom
  MM: ['203.81.162.1', '203.81.162.2'],              // MPT Myanmar
  KH: ['203.189.136.148', '203.189.136.149'],        // Ezecom Cambodia
  LA: ['202.137.128.2', '202.137.128.3'],            // Lao Telecom
  CN: ['114.114.114.114', '114.114.115.115'],        // 114DNS China
  SE: ['194.36.144.87', '194.36.144.88'],            // Telia Sweden
  NO: ['81.167.0.100', '81.167.0.101'],              // Telenor Norway
  FI: ['212.47.222.4', '212.47.222.5'],              // Elisa Finland
  DK: ['193.162.153.164', '212.88.64.10'],           // TDC Denmark
  AT: ['195.58.160.1', '195.58.161.1'],              // A1 Telekom Austria
  CH: ['195.186.1.110', '195.186.1.111'],            // Swisscom
  BE: ['195.238.2.21', '195.238.2.22'],              // Proximus Belgium
  PT: ['194.65.5.2', '194.65.5.3'],                  // MEO Portugal
  GR: ['62.1.1.2', '62.1.1.3'],                      // OTE Greece
  CZ: ['193.29.206.206', '193.29.206.207'],          // CZ.NIC
  RO: ['5.2.75.75', '5.2.75.76'],                    // RCS-RDS Romania
  HU: ['84.2.46.46', '84.2.46.47'],                  // Magyar Telekom
  IL: ['212.143.208.1', '212.143.208.2'],             // Bezeq Israel
  NZ: ['202.27.158.40', '202.27.158.41'],             // Spark NZ
  IE: ['159.134.0.1', '159.134.0.2'],                 // Eir Ireland
};

const DNS_FALLBACK = ['1.1.1.1', '1.0.0.1'];

/**
 * Smart DNS selection: first try ISP match, then country fallback.
 * Returns the most realistic DNS servers for the given exit IP context.
 */
function getDnsForExit(countryCode, ispName) {
  // Step 1: Try ISP-level match (most realistic)
  if (ispName) {
    const ispLower = ispName.toLowerCase();
    for (const [keyword, servers] of Object.entries(ISP_DNS)) {
      if (ispLower.includes(keyword)) {
        return { servers, matchType: 'isp', matchedKeyword: keyword };
      }
    }
  }

  // Step 2: Country-level fallback
  const code = (countryCode || '').toUpperCase();
  if (COUNTRY_DNS[code]) {
    return { servers: COUNTRY_DNS[code], matchType: 'country', matchedKeyword: code };
  }

  // Step 3: Global fallback (Cloudflare anycast)
  return { servers: DNS_FALLBACK, matchType: 'fallback', matchedKeyword: 'cloudflare' };
}

// Keep backward compatibility
function getDnsForCountry(countryCode) {
  const code = (countryCode || '').toUpperCase();
  return COUNTRY_DNS[code] || DNS_FALLBACK;
}

/**
 * Resolve a hostname via DNS-over-TCP through a SOCKS5 proxy to a specific DNS server.
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

  const flags = Buffer.from([0x01, 0x00]);
  const counts = Buffer.from([0x00, 0x01, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00]);

  const parts = hostname.split('.');
  const qname = [];
  for (const part of parts) {
    qname.push(part.length);
    for (let i = 0; i < part.length; i++) qname.push(part.charCodeAt(i));
  }
  qname.push(0);

  const qtype = Buffer.from([0x00, 0x01]);
  const qclass = Buffer.from([0x00, 0x01]);

  return Buffer.concat([id, flags, counts, Buffer.from(qname), qtype, qclass]);
}

function parseDnsResponse(buf) {
  if (buf.length < 12) return null;

  const qdcount = buf.readUInt16BE(4);
  const ancount = buf.readUInt16BE(6);

  let offset = 12;

  for (let i = 0; i < qdcount; i++) {
    while (offset < buf.length && buf[offset] !== 0) {
      if ((buf[offset] & 0xc0) === 0xc0) { offset += 2; break; }
      offset += buf[offset] + 1;
    }
    if (offset < buf.length && buf[offset] === 0) offset++;
    offset += 4;
  }

  for (let i = 0; i < ancount; i++) {
    if (offset >= buf.length) break;
    if ((buf[offset] & 0xc0) === 0xc0) {
      offset += 2;
    } else {
      while (offset < buf.length && buf[offset] !== 0) offset += buf[offset] + 1;
      if (offset < buf.length) offset++;
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
 * Detect the exit IP's country and ISP by querying geolocation API through SOCKS proxy.
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

const dnsCache = new Map();
const DNS_CACHE_TTL = 300000;

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
  ISP_DNS,
  COUNTRY_DNS,
  DNS_FALLBACK,
  getDnsForExit,
  getDnsForCountry,
  resolveThroughSocks,
  detectCountry,
  getCachedDns,
  setCachedDns,
};
