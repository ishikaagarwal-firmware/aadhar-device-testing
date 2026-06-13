import fs from 'fs';
import path from 'path';
import net from 'net';
import tls from 'tls';

const SESSIONS_KEY = 'sessions';
const TEMP_FILE = path.join('/tmp', 'sessions.json');

// Get Vercel KV config
const kvUrl = process.env.KV_REST_API_URL;
const kvToken = process.env.KV_REST_API_TOKEN;

// Native TCP Redis Client for Redis Cloud / standard Redis instances
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

export async function getSessions() {
  // 1. Try REDIS_URL (Redis Cloud / TCP) first
  const redisUrl = process.env.REDIS_URL;
  if (redisUrl) {
    try {
      const u = new URL(redisUrl);
      const host = u.hostname;
      const password = u.password || u.username;
      const port = u.port || 6379;
      const isSecure = u.protocol === 'rediss:';

      const res = await runRedisCommand(host, port, isSecure, password, ['GET', SESSIONS_KEY]);
      if (res === null) {
        return [];
      }
      return JSON.parse(res) || [];
    } catch (err) {
      console.error('Failed to fetch from Redis URL (TCP):', err);
    }
  }

  // 2. Try Vercel KV REST API fallback
  if (kvUrl && kvToken) {
    try {
      const res = await fetch(kvUrl, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${kvToken}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(['GET', SESSIONS_KEY])
      });
      const data = await res.json();
      if (data && data.hasOwnProperty('result')) {
        if (data.result === null) {
          return [];
        }
        return JSON.parse(data.result) || [];
      }
    } catch (err) {
      console.error('Failed to fetch from Vercel KV REST API:', err);
    }
  }

  // 3. Fallback to local /tmp file
  try {
    if (fs.existsSync(TEMP_FILE)) {
      const data = fs.readFileSync(TEMP_FILE, 'utf8');
      if (data) {
        return JSON.parse(data) || [];
      }
    }
  } catch (err) {
    console.error('Failed to read from fallback temp file:', err);
  }

  return [];
}

export async function saveSessions(sessions) {
  const jsonStr = JSON.stringify(sessions);

  // 1. Try REDIS_URL (Redis Cloud / TCP) first
  const redisUrl = process.env.REDIS_URL;
  if (redisUrl) {
    try {
      const u = new URL(redisUrl);
      const host = u.hostname;
      const password = u.password || u.username;
      const port = u.port || 6379;
      const isSecure = u.protocol === 'rediss:';

      const res = await runRedisCommand(host, port, isSecure, password, ['SET', SESSIONS_KEY, jsonStr]);
      if (res === 'OK') {
        return true;
      }
    } catch (err) {
      console.error('Failed to save to Redis URL (TCP):', err);
    }
  }

  // 2. Try Vercel KV REST API fallback
  if (kvUrl && kvToken) {
    try {
      const res = await fetch(kvUrl, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${kvToken}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(['SET', SESSIONS_KEY, jsonStr])
      });
      const data = await res.json();
      if (data && data.result === 'OK') {
        return true;
      }
    } catch (err) {
      console.error('Failed to save to Vercel KV REST API:', err);
    }
  }

  // 3. Fallback to local /tmp file
  try {
    const dir = path.dirname(TEMP_FILE);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
    fs.writeFileSync(TEMP_FILE, jsonStr, 'utf8');
    return true;
  } catch (err) {
    console.error('Failed to write to fallback temp file:', err);
  }

  return false;
}

export function updateSessionStatuses(sessions) {
  if (!Array.isArray(sessions)) {
    sessions = [];
  }
  const now = new Date();
  let changed = false;

  for (let s of sessions) {
    if (s && s.status === 'ACTIVE') {
      const lastActiveDt = new Date(s.lastActive);
      const diffSeconds = (now - lastActiveDt) / 1000;
      if (diffSeconds > 30) {
        s.status = 'OFFLINE';
        changed = true;
      }
    }
  }

  return { sessions, changed };
}
