const net = require('net');
const { SocksClient } = require('socks');
const dnsResolver = require('./dns-resolver');

const activeRelays = new Map();
let nextPort = 21080;

/**
 * Create a local SOCKS5 relay that forwards through an authenticated upstream proxy.
 * When localDns is configured, hostnames are resolved through the SOCKS tunnel
 * to the target country's DNS servers, then the IP is sent to the upstream proxy.
 * This makes DNS leak tests show the target country's DNS instead of the proxy's default DNS.
 *
 * Options:
 *   localDns: { servers: ['ip1','ip2'], socksProxy: {host,port,user,pass} }
 */
function createRelay(upstream, options = {}) {
  const dnsKey = options.localDns ? `:dns=${options.localDns.servers[0]}` : '';
  const key = `${upstream.type}:${upstream.host}:${upstream.port}:${upstream.user}${dnsKey}`;
  if (activeRelays.has(key)) {
    return activeRelays.get(key);
  }

  const localPort = nextPort++;
  const server = net.createServer((clientSocket) => {
    handleSocks5Client(clientSocket, upstream, options.localDns || null);
  });

  server.listen(localPort, '127.0.0.1', () => {});

  server.on('error', (err) => {
    console.error(`[Relay] Error on port ${localPort}:`, err.message);
  });

  const info = { localPort, server, key, upstream };
  activeRelays.set(key, info);
  return info;
}

function handleSocks5Client(client, upstream, localDns) {
  let state = 'greeting';

  client.on('error', () => client.destroy());

  client.on('data', async (data) => {
    if (state === 'greeting') {
      client.write(Buffer.from([0x05, 0x00]));
      state = 'request';
      return;
    }

    if (state === 'request') {
      if (data[0] !== 0x05 || data[1] !== 0x01) {
        client.destroy();
        return;
      }

      const addrType = data[3];
      let host, port;

      if (addrType === 0x01) {
        host = `${data[4]}.${data[5]}.${data[6]}.${data[7]}`;
        port = data.readUInt16BE(8);
      } else if (addrType === 0x03) {
        const domainLen = data[4];
        host = data.slice(5, 5 + domainLen).toString();
        port = data.readUInt16BE(5 + domainLen);
      } else if (addrType === 0x04) {
        const parts = [];
        for (let i = 0; i < 16; i += 2) {
          parts.push(data.readUInt16BE(4 + i).toString(16));
        }
        host = parts.join(':');
        port = data.readUInt16BE(20);
      } else {
        client.destroy();
        return;
      }

      state = 'connecting';

      try {
        let connectHost = host;

        // If localDns is configured and the host is a domain (not IP),
        // resolve it through the SOCKS tunnel to the target country's DNS
        if (localDns && addrType === 0x03) {
          const cached = dnsResolver.getCachedDns(host);
          if (cached) {
            connectHost = cached;
          } else {
            const dnsServers = localDns.servers;
            const socksProxy = localDns.socksProxy;
            let resolved = null;

            for (const dnsServer of dnsServers) {
              try {
                resolved = await dnsResolver.resolveThroughSocks(host, socksProxy, dnsServer, 6000);
                if (resolved) break;
              } catch (e) {
                // try next DNS server
              }
            }

            if (resolved) {
              dnsResolver.setCachedDns(host, resolved);
              connectHost = resolved;
            }
            // If DNS resolution failed, fall back to sending hostname (proxy will resolve)
          }
        }

        const proxyType = upstream.type === 'socks4' ? 4 : 5;
        const socksOptions = {
          proxy: {
            host: upstream.host,
            port: parseInt(upstream.port),
            type: proxyType,
          },
          command: 'connect',
          destination: { host: connectHost, port },
          timeout: 15000,
        };

        if (upstream.user) {
          socksOptions.proxy.userId = upstream.user;
          socksOptions.proxy.password = upstream.pass || '';
        }

        const { socket: upstreamSocket } = await SocksClient.createConnection(socksOptions);

        const response = Buffer.alloc(10);
        response[0] = 0x05;
        response[1] = 0x00;
        response[2] = 0x00;
        response[3] = 0x01;
        client.write(response);

        client.pipe(upstreamSocket);
        upstreamSocket.pipe(client);

        upstreamSocket.on('error', () => { client.destroy(); upstreamSocket.destroy(); });
        client.on('error', () => { upstreamSocket.destroy(); client.destroy(); });
        client.on('close', () => upstreamSocket.destroy());
        upstreamSocket.on('close', () => client.destroy());

      } catch (err) {
        const response = Buffer.alloc(10);
        response[0] = 0x05;
        response[1] = 0x05;
        client.write(response);
        client.destroy();
      }
    }
  });
}

function createHttpRelay(upstream) {
  const key = `http:${upstream.host}:${upstream.port}:${upstream.user}`;
  if (activeRelays.has(key)) {
    return activeRelays.get(key);
  }

  const localPort = nextPort++;
  const server = net.createServer((clientSocket) => {
    handleHttpConnectClient(clientSocket, upstream);
  });

  server.listen(localPort, '127.0.0.1');

  const info = { localPort, server, key, upstream };
  activeRelays.set(key, info);
  return info;
}

function handleHttpConnectClient(client, upstream) {
  let buffer = '';
  client.on('data', (data) => {
    buffer += data.toString();
    if (buffer.includes('\r\n\r\n')) {
      const firstLine = buffer.split('\r\n')[0];
      const match = firstLine.match(/^CONNECT\s+(.+):(\d+)/i);
      if (!match) { client.destroy(); return; }

      const targetHost = match[1];
      const targetPort = parseInt(match[2]);

      const upstreamSocket = net.connect(parseInt(upstream.port), upstream.host, () => {
        const auth = Buffer.from(`${upstream.user}:${upstream.pass}`).toString('base64');
        upstreamSocket.write(`CONNECT ${targetHost}:${targetPort} HTTP/1.1\r\nHost: ${targetHost}:${targetPort}\r\nProxy-Authorization: Basic ${auth}\r\n\r\n`);
      });

      let upstreamBuffer = '';
      upstreamSocket.once('data', (d) => {
        upstreamBuffer += d.toString();
        if (upstreamBuffer.includes('200')) {
          client.write('HTTP/1.1 200 Connection Established\r\n\r\n');
          client.pipe(upstreamSocket);
          upstreamSocket.pipe(client);
        } else {
          client.destroy();
          upstreamSocket.destroy();
        }
      });

      upstreamSocket.on('error', () => client.destroy());
      client.on('error', () => upstreamSocket.destroy());
    }
  });
}

function destroyRelay(key) {
  const relay = activeRelays.get(key);
  if (relay) {
    relay.server.close();
    activeRelays.delete(key);
  }
}

function destroyAllRelays() {
  for (const [key, relay] of activeRelays) {
    relay.server.close();
  }
  activeRelays.clear();
}

/**
 * Get or create a relay for the given proxy config.
 * Options:
 *   localDns: { servers: ['ip'], socksProxy: {host,port,user,pass} }
 */
function getRelay(proxyType, proxyHost, proxyPort, proxyUser, proxyPass, options = {}) {
  if (!proxyUser) return null;

  const upstream = {
    type: proxyType,
    host: proxyHost,
    port: proxyPort,
    user: proxyUser,
    pass: proxyPass || '',
  };

  if (proxyType === 'http' || proxyType === 'https') {
    return createHttpRelay(upstream);
  }
  return createRelay(upstream, options);
}

module.exports = { getRelay, destroyRelay, destroyAllRelays };
