import { getSessions, saveSessions, updateSessionStatuses, getAllowedEmails } from './_utils.js';

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

  const { email } = req.body;
  if (!email || !email.includes('@')) {
    return res.status(400).json({ success: false, message: 'Valid email is required' });
  }

  // Verify email is in the authorized whitelist
  const allowed = await getAllowedEmails();
  if (allowed && allowed.length > 0 && !allowed.map(e => e.toLowerCase()).includes(email.toLowerCase())) {
    return res.status(403).json({ success: false, message: 'Email address is not authorized for access.' });
  }

  // Run status sweep
  let sessions = await getSessions();
  const sweep = updateSessionStatuses(sessions);
  sessions = sweep.sessions;

  // Generate new token & session
  const token = Math.random().toString(36).substring(2, 15) + Math.random().toString(36).substring(2, 15);
  const nowStr = new Date().toISOString();
  
  const newSession = {
    token,
    email,
    loginTime: nowStr,
    lastActive: nowStr,
    duration: 0,
    status: 'ACTIVE'
  };

  sessions.push(newSession);
  await saveSessions(sessions);

  return res.status(200).json({ success: true, token, email });
}
