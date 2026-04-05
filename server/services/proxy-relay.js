const net = require('net');
const { SocksClient } = require('socks');

const activeRelays = new Map();
let nextPort = 21080;

/**
 * Create a local SOCKS5 relay that forwards through an authenticated upstream proxy.
 * Browser connects to localhost:localPort (no auth) → relay → upstream SOCKS5 (with auth)
 */
function createRelay(upstream) {
  const key = `${upstream.type}:${upstream.host}:${upstream.port}:${upstream.user}`;
  if (activeRelays.has(key)) {
    return activeRelays.get(key);
  }

  const localPort = nextPort++;
  const server = net.createServer((clientSocket) => {
    handleSocks5Client(clientSocket, upstream);
  });

  server.listen(localPort, '127.0.0.1', () => {});

  server.on('error', (err) => {
    console.error(`[Relay] Error on port ${localPort}:`, err.message);
  });

  const info = { localPort, server, key, upstream };
  activeRelays.set(key, info);
  return info;
}

function handleSocks5Client(client, upstream) {
  let state = 'greeting';
  let targetHost = '';
  let targetPort = 0;

  client.on('error', () => client.destroy());

  client.on('data', async (data) => {
    if (state === 'greeting') {
      // SOCKS5 greeting: respond with no-auth
      client.write(Buffer.from([0x05, 0x00]));
      state = 'request';
      return;
    }

    if (state === 'request') {
      // Parse SOCKS5 connect request
      if (data[0] !== 0x05 || data[1] !== 0x01) {
        client.destroy();
        return;
      }

      const addrType = data[3];
      let host, port;

      if (addrType === 0x01) {
        // IPv4
        host = `${data[4]}.${data[5]}.${data[6]}.${data[7]}`;
        port = data.readUInt16BE(8);
      } else if (addrType === 0x03) {
        // Domain
        const domainLen = data[4];
        host = data.slice(5, 5 + domainLen).toString();
        port = data.readUInt16BE(5 + domainLen);
      } else if (addrType === 0x04) {
        // IPv6
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

      targetHost = host;
      targetPort = port;
      state = 'connecting';

      try {
        const proxyType = upstream.type === 'socks4' ? 4 : 5;
        const socksOptions = {
          proxy: {
            host: upstream.host,
            port: parseInt(upstream.port),
            type: proxyType,
          },
          command: 'connect',
          destination: { host: targetHost, port: targetPort },
          timeout: 15000,
        };

        if (upstream.user) {
          socksOptions.proxy.userId = upstream.user;
          socksOptions.proxy.password = upstream.pass || '';
        }

        const { socket: upstreamSocket } = await SocksClient.createConnection(socksOptions);

        // Send success response to client
        const response = Buffer.alloc(10);
        response[0] = 0x05; // version
        response[1] = 0x00; // success
        response[2] = 0x00; // reserved
        response[3] = 0x01; // IPv4
        // bound addr 0.0.0.0:0
        client.write(response);

        // Pipe bidirectionally
        client.pipe(upstreamSocket);
        upstreamSocket.pipe(client);

        upstreamSocket.on('error', () => { client.destroy(); upstreamSocket.destroy(); });
        client.on('error', () => { upstreamSocket.destroy(); client.destroy(); });
        client.on('close', () => upstreamSocket.destroy());
        upstreamSocket.on('close', () => client.destroy());

      } catch (err) {
        // Connection failed response
        const response = Buffer.alloc(10);
        response[0] = 0x05;
        response[1] = 0x05; // connection refused
        client.write(response);
        client.destroy();
      }
    }
  });
}

/**
 * For HTTP/HTTPS proxies with auth, create a local HTTP CONNECT proxy
 */
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
 * Returns { localPort } - browser should connect to socks5://127.0.0.1:localPort
 */
function getRelay(proxyType, proxyHost, proxyPort, proxyUser, proxyPass) {
  if (!proxyUser) return null; // No auth needed, direct connection is fine

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
  return createRelay(upstream);
}

module.exports = { getRelay, destroyRelay, destroyAllRelays };
