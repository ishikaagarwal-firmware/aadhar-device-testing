import net from 'net';
import tls from 'tls';

function runRedisCommand(host, port, isSecure, password, cmdArgs) {
  return new Promise((resolve, reject) => {
    let resolved = false;
    const socket = (isSecure ? tls : net).connect({
      host,
      port: parseInt(port, 10),
      rejectUnauthorized: false
    });

    socket.setTimeout(5000);

    let buffer = Buffer.alloc(0);
    let state = password ? 'AUTH' : 'CMD';

    socket.on('connect', () => {
      if (password) {
        const passLen = Buffer.from(password).length;
        socket.write(`*2\r\n$4\r\nAUTH\r\n$${passLen}\r\n${password}\r\n`);
      } else {
        sendCmd();
      }
    });

    socket.on('timeout', () => {
      cleanup(new Error('Redis connection timeout'));
    });

    socket.on('data', (chunk) => {
      buffer = Buffer.concat([buffer, chunk]);
      try {
        processBuffer();
      } catch (err) {
        cleanup(err);
      }
    });

    socket.on('error', (err) => {
      cleanup(err);
    });

    socket.on('close', () => {
      cleanup(new Error('Redis socket closed unexpectedly'));
    });

    function sendCmd() {
      let cmd = `*${cmdArgs.length}\r\n`;
      for (const arg of cmdArgs) {
        const argStr = String(arg);
        const argBuf = Buffer.from(argStr, 'utf8');
        cmd += `$${argBuf.length}\r\n${argStr}\r\n`;
      }
      socket.write(cmd);
    }

    function cleanup(err) {
      if (resolved) return;
      resolved = true;
      socket.destroy();
      reject(err);
    }

    function processBuffer() {
      if (state === 'AUTH') {
        const idx = buffer.indexOf('\r\n');
        if (idx !== -1) {
          const line = buffer.toString('utf8', 0, idx);
          buffer = buffer.slice(idx + 2);
          if (line.startsWith('+')) {
            state = 'CMD';
            sendCmd();
          } else {
            cleanup(new Error(`Redis auth failed: ${line}`));
          }
        }
      } else if (state === 'CMD') {
        const result = parseResp();
        if (result !== undefined) {
          resolved = true;
          socket.destroy();
          resolve(result);
        }
      }
    }

    function parseResp() {
      if (buffer.length === 0) return undefined;
      const type = buffer[0];
      const idx = buffer.indexOf('\r\n');
      if (idx === -1) return undefined;
      
      const line = buffer.toString('utf8', 1, idx);
      
      if (type === 43) { // '+'
        buffer = buffer.slice(idx + 2);
        return line;
      }
      if (type === 45) { // '-'
        buffer = buffer.slice(idx + 2);
        throw new Error(line);
      }
      if (type === 58) { // ':'
        buffer = buffer.slice(idx + 2);
        return parseInt(line, 10);
      }
      if (type === 36) { // '$'
        const len = parseInt(line, 10);
        if (len === -1) {
          buffer = buffer.slice(idx + 2);
          return null;
        }
        const valStart = idx + 2;
        if (buffer.length < valStart + len + 2) {
          return undefined;
        }
        const val = buffer.toString('utf8', valStart, valStart + len);
        buffer = buffer.slice(valStart + len + 2);
        return val;
      }
      throw new Error(`Unsupported RESP type: ${String.fromCharCode(type)}`);
    }
  });
}

export default async function handler(req, res) {
  const kvUrl = process.env.KV_REST_API_URL;
  const kvToken = process.env.KV_REST_API_TOKEN;
  
  const debugData = {
    envKeys: Object.keys(process.env),
    env: {
      hasKvUrl: !!kvUrl,
      hasKvToken: !!kvToken,
    },
    redisTcpResult: null,
    redisTcpError: null
  };

  const redisUrl = process.env.REDIS_URL;
  if (redisUrl) {
    try {
      const u = new URL(redisUrl);
      const host = u.hostname;
      const password = u.password || u.username;
      const port = u.port || 6379;
      const isSecure = u.protocol === 'rediss:';

      debugData.redisConfig = {
        host,
        port,
        isSecure,
        hasPassword: !!password
      };

      // Test SET then GET
      const setRes = await runRedisCommand(host, port, isSecure, password, ['SET', 'test_key', 'hello_world']);
      const getRes = await runRedisCommand(host, port, isSecure, password, ['GET', 'test_key']);
      debugData.redisTcpResult = {
        setRes,
        getRes
      };
    } catch (e) {
      debugData.redisTcpError = {
        message: e.message,
        stack: e.stack
      };
    }
  }

  return res.status(200).json(debugData);
}
