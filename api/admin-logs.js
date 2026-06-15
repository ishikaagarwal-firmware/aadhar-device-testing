import { getSessions, saveSessions, updateSessionStatuses, getAllowedEmails, saveAllowedEmails } from './_utils.js';

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
  let action = '';
  if (req.method === 'POST') {
    passcode = req.body?.passcode;
    action = req.body?.action;
  } else {
    passcode = req.query?.passcode;
    action = req.query?.action;
  }

  if (passcode !== ADMIN_PASSCODE) {
    return res.status(401).json({ success: false, message: 'Invalid admin passcode' });
  }

  let sessions = await getSessions();
  let allowedEmails = await getAllowedEmails();

  if (req.method === 'POST' && action) {
    if (action === 'add_allowed_email') {
      const email = req.body?.email?.trim();
      if (email && email.includes('@')) {
        if (!allowedEmails.map(e => e.toLowerCase()).includes(email.toLowerCase())) {
          allowedEmails.push(email);
          await saveAllowedEmails(allowedEmails);
        }
      }
    } 
    else if (action === 'remove_allowed_email') {
      const email = req.body?.email?.trim();
      if (email) {
        allowedEmails = allowedEmails.filter(e => e.toLowerCase() !== email.toLowerCase());
        await saveAllowedEmails(allowedEmails);
      }
    } 
    else if (action === 'terminate_session') {
      const token = req.body?.token;
      if (token) {
        const session = sessions.find(s => s && s.token === token);
        if (session) {
          session.status = 'OFFLINE';
          session.lastActive = new Date().toISOString();
          await saveSessions(sessions);
        }
      }
    } 
    else if (action === 'delete_session') {
      const token = req.body?.token;
      if (token) {
        sessions = sessions.filter(s => s && s.token !== token);
        await saveSessions(sessions);
      }
    }
  }

  // Sweep inactive sessions
  const sweep = updateSessionStatuses(sessions);
  sessions = sweep.sessions;
  
  if (sweep.changed) {
    await saveSessions(sessions);
  }

  return res.status(200).json({ success: true, sessions, allowedEmails });
}
