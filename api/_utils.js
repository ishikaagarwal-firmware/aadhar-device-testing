import fs from 'fs';
import path from 'path';

const SESSIONS_KEY = 'sessions';
const TEMP_FILE = path.join('/tmp', 'sessions.json');

// Get Vercel KV config
const kvUrl = process.env.KV_REST_API_URL;
const kvToken = process.env.KV_REST_API_TOKEN;

export async function getSessions() {
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
      console.error('Failed to fetch from Vercel KV:', err);
    }
  }

  // Fallback to local /tmp file
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
      console.error('Failed to save to Vercel KV:', err);
    }
  }

  // Fallback to local /tmp file
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
