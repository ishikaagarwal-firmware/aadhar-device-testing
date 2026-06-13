import { getSessions, saveSessions, updateSessionStatuses } from './_utils.js';

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

  if (req.method !== 'POST') {
    return res.status(405).json({ success: false, message: 'Method Not Allowed' });
  }

  const { token } = req.body;
  if (!token) {
    return res.status(400).json({ success: false, message: 'Token is required' });
  }

  let sessions = await getSessions();
  
  // Update statuses
  const sweep = updateSessionStatuses(sessions);
  sessions = sweep.sessions;

  const session = sessions.find(s => s && s.token === token);
  if (session) {
    const now = new Date();
    const loginDt = new Date(session.loginTime);
    
    session.lastActive = now.toISOString();
    session.duration = Math.floor((now - loginDt) / 1000);
    session.status = 'ACTIVE';

    await saveSessions(sessions);
    return res.status(200).json({ success: true });
  } else {
    return res.status(404).json({ success: false, message: 'Session not found' });
  }
}
