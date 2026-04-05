const http = require('http');
const https = require('https');
const { SocksClient } = require('socks');

// Country -> language/timezone/locale mapping
const COUNTRY_LOCALE = {
  US: { languages: ['en-US', 'en'], timezone: 'America/New_York', lang: 'en-US' },
  GB: { languages: ['en-GB', 'en'], timezone: 'Europe/London', lang: 'en-GB' },
  CA: { languages: ['en-CA', 'en'], timezone: 'America/Toronto', lang: 'en-CA' },
  AU: { languages: ['en-AU', 'en'], timezone: 'Australia/Sydney', lang: 'en-AU' },
  DE: { languages: ['de-DE', 'de', 'en'], timezone: 'Europe/Berlin', lang: 'de-DE' },
  FR: { languages: ['fr-FR', 'fr', 'en'], timezone: 'Europe/Paris', lang: 'fr-FR' },
  JP: { languages: ['ja-JP', 'ja', 'en'], timezone: 'Asia/Tokyo', lang: 'ja' },
  KR: { languages: ['ko-KR', 'ko', 'en'], timezone: 'Asia/Seoul', lang: 'ko' },
  BR: { languages: ['pt-BR', 'pt', 'en'], timezone: 'America/Sao_Paulo', lang: 'pt-BR' },
  IN: { languages: ['en-IN', 'hi', 'en'], timezone: 'Asia/Kolkata', lang: 'en-IN' },
  RU: { languages: ['ru-RU', 'ru', 'en'], timezone: 'Europe/Moscow', lang: 'ru' },
  CN: { languages: ['zh-CN', 'zh', 'en'], timezone: 'Asia/Shanghai', lang: 'zh-CN' },
  HK: { languages: ['zh-HK', 'zh', 'en'], timezone: 'Asia/Hong_Kong', lang: 'zh-HK' },
  TW: { languages: ['zh-TW', 'zh', 'en'], timezone: 'Asia/Taipei', lang: 'zh-TW' },
  SG: { languages: ['en-SG', 'zh', 'en'], timezone: 'Asia/Singapore', lang: 'en-SG' },
  NL: { languages: ['nl-NL', 'nl', 'en'], timezone: 'Europe/Amsterdam', lang: 'nl' },
  IT: { languages: ['it-IT', 'it', 'en'], timezone: 'Europe/Rome', lang: 'it' },
  ES: { languages: ['es-ES', 'es', 'en'], timezone: 'Europe/Madrid', lang: 'es' },
  MX: { languages: ['es-MX', 'es', 'en'], timezone: 'America/Mexico_City', lang: 'es-MX' },
  PH: { languages: ['en-PH', 'fil', 'en'], timezone: 'Asia/Manila', lang: 'en-PH' },
  TH: { languages: ['th-TH', 'th', 'en'], timezone: 'Asia/Bangkok', lang: 'th' },
  VN: { languages: ['vi-VN', 'vi', 'en'], timezone: 'Asia/Ho_Chi_Minh', lang: 'vi' },
  ID: { languages: ['id-ID', 'id', 'en'], timezone: 'Asia/Jakarta', lang: 'id' },
  PL: { languages: ['pl-PL', 'pl', 'en'], timezone: 'Europe/Warsaw', lang: 'pl' },
  TR: { languages: ['tr-TR', 'tr', 'en'], timezone: 'Europe/Istanbul', lang: 'tr' },
  UA: { languages: ['uk-UA', 'uk', 'en'], timezone: 'Europe/Kiev', lang: 'uk' },
  SE: { languages: ['sv-SE', 'sv', 'en'], timezone: 'Europe/Stockholm', lang: 'sv' },
  NO: { languages: ['nb-NO', 'no', 'en'], timezone: 'Europe/Oslo', lang: 'nb' },
  DK: { languages: ['da-DK', 'da', 'en'], timezone: 'Europe/Copenhagen', lang: 'da' },
  FI: { languages: ['fi-FI', 'fi', 'en'], timezone: 'Europe/Helsinki', lang: 'fi' },
  PT: { languages: ['pt-PT', 'pt', 'en'], timezone: 'Europe/Lisbon', lang: 'pt-PT' },
  AR: { languages: ['es-AR', 'es', 'en'], timezone: 'America/Argentina/Buenos_Aires', lang: 'es-AR' },
  CL: { languages: ['es-CL', 'es', 'en'], timezone: 'America/Santiago', lang: 'es-CL' },
  CO: { languages: ['es-CO', 'es', 'en'], timezone: 'America/Bogota', lang: 'es-CO' },
  ZA: { languages: ['en-ZA', 'af', 'en'], timezone: 'Africa/Johannesburg', lang: 'en-ZA' },
  EG: { languages: ['ar-EG', 'ar', 'en'], timezone: 'Africa/Cairo', lang: 'ar' },
  SA: { languages: ['ar-SA', 'ar', 'en'], timezone: 'Asia/Riyadh', lang: 'ar' },
  AE: { languages: ['ar-AE', 'ar', 'en'], timezone: 'Asia/Dubai', lang: 'ar' },
  IL: { languages: ['he-IL', 'he', 'en'], timezone: 'Asia/Jerusalem', lang: 'he' },
  MY: { languages: ['ms-MY', 'ms', 'en'], timezone: 'Asia/Kuala_Lumpur', lang: 'ms' },
  NZ: { languages: ['en-NZ', 'en'], timezone: 'Pacific/Auckland', lang: 'en-NZ' },
  IE: { languages: ['en-IE', 'ga', 'en'], timezone: 'Europe/Dublin', lang: 'en-IE' },
  AT: { languages: ['de-AT', 'de', 'en'], timezone: 'Europe/Vienna', lang: 'de-AT' },
  CH: { languages: ['de-CH', 'de', 'fr', 'en'], timezone: 'Europe/Zurich', lang: 'de-CH' },
  BE: { languages: ['nl-BE', 'fr', 'en'], timezone: 'Europe/Brussels', lang: 'nl-BE' },
};

// US state -> timezone mapping for more precise matching
const US_STATE_TZ = {
  'AL': 'America/Chicago', 'AK': 'America/Anchorage', 'AZ': 'America/Phoenix',
  'AR': 'America/Chicago', 'CA': 'America/Los_Angeles', 'CO': 'America/Denver',
  'CT': 'America/New_York', 'DE': 'America/New_York', 'FL': 'America/New_York',
  'GA': 'America/New_York', 'HI': 'Pacific/Honolulu', 'ID': 'America/Boise',
  'IL': 'America/Chicago', 'IN': 'America/Indiana/Indianapolis', 'IA': 'America/Chicago',
  'KS': 'America/Chicago', 'KY': 'America/New_York', 'LA': 'America/Chicago',
  'ME': 'America/New_York', 'MD': 'America/New_York', 'MA': 'America/New_York',
  'MI': 'America/Detroit', 'MN': 'America/Chicago', 'MS': 'America/Chicago',
  'MO': 'America/Chicago', 'MT': 'America/Denver', 'NE': 'America/Chicago',
  'NV': 'America/Los_Angeles', 'NH': 'America/New_York', 'NJ': 'America/New_York',
  'NM': 'America/Denver', 'NY': 'America/New_York', 'NC': 'America/New_York',
  'ND': 'America/Chicago', 'OH': 'America/New_York', 'OK': 'America/Chicago',
  'OR': 'America/Los_Angeles', 'PA': 'America/New_York', 'RI': 'America/New_York',
  'SC': 'America/New_York', 'SD': 'America/Chicago', 'TN': 'America/Chicago',
  'TX': 'America/Chicago', 'UT': 'America/Denver', 'VT': 'America/New_York',
  'VA': 'America/New_York', 'WA': 'America/Los_Angeles', 'WV': 'America/New_York',
  'WI': 'America/Chicago', 'WY': 'America/Denver', 'DC': 'America/New_York',
};

/**
 * Fetch geolocation from ip-api.com (free, no key needed, 45 req/min)
 */
function fetchGeoFromIpApi(ip) {
  return new Promise((resolve, reject) => {
    const url = `http://ip-api.com/json/${ip}?fields=status,country,countryCode,region,regionName,city,zip,lat,lon,timezone,isp,query`;
    http.get(url, { timeout: 8000 }, (res) => {
      let data = '';
      res.on('data', (chunk) => data += chunk);
      res.on('end', () => {
        try {
          const json = JSON.parse(data);
          if (json.status === 'success') {
            resolve(json);
          } else {
            reject(new Error(json.message || 'IP lookup failed'));
          }
        } catch (e) {
          reject(e);
        }
      });
    }).on('error', reject);
  });
}

/**
 * Randomize lat/lng within ~5-15 km radius to avoid exact location fingerprinting
 */
function randomizeCoords(lat, lon) {
  const radiusKm = 5 + Math.random() * 10;
  const angle = Math.random() * 2 * Math.PI;
  const dLat = (radiusKm / 111) * Math.cos(angle);
  const dLon = (radiusKm / (111 * Math.cos(lat * Math.PI / 180))) * Math.sin(angle);
  return {
    latitude: Math.round((lat + dLat) * 10000) / 10000,
    longitude: Math.round((lon + dLon) * 10000) / 10000,
    accuracy: Math.floor(30 + Math.random() * 70),
  };
}

/**
 * Get timezone offset in minutes for a given timezone name
 */
function getTimezoneOffset(tz) {
  try {
    const now = new Date();
    const utc = new Date(now.toLocaleString('en-US', { timeZone: 'UTC' }));
    const local = new Date(now.toLocaleString('en-US', { timeZone: tz }));
    return Math.round((utc - local) / 60000);
  } catch {
    return 0;
  }
}

/**
 * Fetch the real exit IP by making an HTTP request through the SOCKS5 proxy
 */
function fetchExitIpViaSocks(proxyHost, proxyPort, proxyUser, proxyPass) {
  return new Promise(async (resolve, reject) => {
    try {
      const socksOptions = {
        proxy: {
          host: proxyHost,
          port: parseInt(proxyPort),
          type: 5,
        },
        command: 'connect',
        destination: { host: 'ip-api.com', port: 80 },
        timeout: 15000,
      };
      if (proxyUser) {
        socksOptions.proxy.userId = proxyUser;
        socksOptions.proxy.password = proxyPass || '';
      }

      const { socket } = await SocksClient.createConnection(socksOptions);

      const httpReq = `GET /json/?fields=status,country,countryCode,region,regionName,city,zip,lat,lon,timezone,isp,query HTTP/1.1\r\nHost: ip-api.com\r\nConnection: close\r\n\r\n`;
      socket.write(httpReq);

      let data = '';
      socket.on('data', (chunk) => data += chunk.toString());
      socket.on('end', () => {
        try {
          const bodyStart = data.indexOf('\r\n\r\n');
          if (bodyStart === -1) { reject(new Error('Invalid response')); return; }
          let body = data.slice(bodyStart + 4);
          // Handle chunked encoding
          if (data.toLowerCase().includes('transfer-encoding: chunked')) {
            const lines = body.split('\r\n');
            body = '';
            for (let i = 1; i < lines.length; i += 2) {
              if (lines[i]) body += lines[i];
            }
          }
          const json = JSON.parse(body.trim());
          if (json.status === 'success') resolve(json);
          else reject(new Error(json.message || 'IP lookup failed'));
        } catch (e) { reject(e); }
        socket.destroy();
      });
      socket.on('error', (e) => { reject(e); socket.destroy(); });
    } catch (e) { reject(e); }
  });
}

/**
 * Fetch exit IP via HTTP/HTTPS proxy
 */
function fetchExitIpViaHttp(proxyHost, proxyPort, proxyUser, proxyPass) {
  return new Promise((resolve, reject) => {
    const proxySocket = require('net').connect(parseInt(proxyPort), proxyHost, () => {
      let connectReq = `CONNECT ip-api.com:80 HTTP/1.1\r\nHost: ip-api.com:80\r\n`;
      if (proxyUser) {
        const auth = Buffer.from(`${proxyUser}:${proxyPass || ''}`).toString('base64');
        connectReq += `Proxy-Authorization: Basic ${auth}\r\n`;
      }
      connectReq += '\r\n';
      proxySocket.write(connectReq);
    });

    let phase = 'connect';
    let buf = '';
    proxySocket.on('data', (chunk) => {
      buf += chunk.toString();
      if (phase === 'connect' && buf.includes('\r\n\r\n')) {
        if (!buf.startsWith('HTTP/1.1 200')) { reject(new Error('Proxy CONNECT failed')); return; }
        phase = 'request';
        buf = '';
        proxySocket.write(`GET /json/?fields=status,country,countryCode,region,regionName,city,zip,lat,lon,timezone,isp,query HTTP/1.1\r\nHost: ip-api.com\r\nConnection: close\r\n\r\n`);
      }
    });
    proxySocket.on('end', () => {
      try {
        const bodyStart = buf.indexOf('\r\n\r\n');
        let body = bodyStart > -1 ? buf.slice(bodyStart + 4) : buf;
        const json = JSON.parse(body.trim());
        if (json.status === 'success') resolve(json);
        else reject(new Error('Lookup failed'));
      } catch (e) { reject(e); }
    });
    proxySocket.on('error', reject);
    setTimeout(() => { proxySocket.destroy(); reject(new Error('Timeout')); }, 15000);
  });
}

/**
 * Main function: resolve proxy to full geo info using actual exit IP
 * Supports: direct host lookup (no auth), or full proxy connection (with auth)
 */
async function resolveProxyGeo(proxyHost, proxyPort, proxyUser, proxyPass, proxyType) {
  let ipGeo;

  if (proxyPort && (proxyUser || proxyType === 'socks5')) {
    // Connect through the proxy to get real exit IP
    try {
      if (proxyType === 'http' || proxyType === 'https') {
        ipGeo = await fetchExitIpViaHttp(proxyHost, proxyPort, proxyUser, proxyPass);
      } else {
        ipGeo = await fetchExitIpViaSocks(proxyHost, proxyPort, proxyUser, proxyPass);
      }
      console.log(`[Geo] Exit IP via proxy: ${ipGeo.query} (${ipGeo.city}, ${ipGeo.countryCode})`);
    } catch (err) {
      console.warn(`[Geo] Failed to get exit IP via proxy (${err.message}), falling back to DNS resolve`);
      ipGeo = await fetchGeoFromIpApi(proxyHost);
    }
  } else {
    ipGeo = await fetchGeoFromIpApi(proxyHost);
  }

  const countryCode = ipGeo.countryCode || 'US';
  const locale = COUNTRY_LOCALE[countryCode] || COUNTRY_LOCALE['US'];

  let timezone = ipGeo.timezone || locale.timezone;
  if (countryCode === 'US' && ipGeo.region && US_STATE_TZ[ipGeo.region]) {
    timezone = US_STATE_TZ[ipGeo.region];
  }

  const coords = randomizeCoords(ipGeo.lat, ipGeo.lon);

  return {
    ip: ipGeo.query,
    country: ipGeo.country,
    countryCode,
    region: ipGeo.regionName,
    regionCode: ipGeo.region,
    city: ipGeo.city,
    zip: ipGeo.zip,
    isp: ipGeo.isp,

    timezone,
    timezoneOffset: getTimezoneOffset(timezone),
    languages: locale.languages,
    lang: locale.lang,

    geolocation: coords,

    _rawLat: ipGeo.lat,
    _rawLon: ipGeo.lon,
  };
}

module.exports = { resolveProxyGeo, COUNTRY_LOCALE, getTimezoneOffset };
