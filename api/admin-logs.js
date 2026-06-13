import { getSessions, saveSessions, updateSessionStatuses } from './_utils.js';

const ADMIN_PASSCODE = 'admin123';

export default async function handler(req, res) {
  // Set CORS headers
  res.setHeader('Access-Control-Allow-Credentials', true);
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,OPTIONS,PATCH,DELETE,POST,PUT');
  res.setHeader(
    'Access-Control-Allow-Headers',
    'X-CSRF-Token, X-Requested-With, Accept, Accept-Version, Content-Length, Content-MD5, Content-Type, Date, X-Api-Version'
  );

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  // Allow both POST and GET
  let passcode = '';
  if (req.method === 'POST') {
    passcode = req.body?.passcode;
  } else {
    passcode = req.query?.passcode;
  }

  if (passcode !== ADMIN_PASSCODE) {
    return res.status(401).json({ success: false, message: 'Invalid admin passcode' });
  }

  let sessions = await getSessions();
  
  // Sweep inactive sessions
  const sweep = updateSessionStatuses(sessions);
  sessions = sweep.sessions;
  
  if (sweep.changed) {
    await saveSessions(sessions);
  }

  return res.status(200).json({ success: true, sessions });
}
