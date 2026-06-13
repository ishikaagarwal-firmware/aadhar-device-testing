export default async function handler(req, res) {
  const kvUrl = process.env.KV_REST_API_URL;
  const kvToken = process.env.KV_REST_API_TOKEN;
  
  const debugData = {
    envKeys: Object.keys(process.env),
    env: {
      hasKvUrl: !!kvUrl,
      hasKvToken: !!kvToken,
      kvUrlLength: kvUrl ? kvUrl.length : 0,
      kvTokenLength: kvToken ? kvToken.length : 0,
    },
    rawKvResponse: null,
    sessionsParsed: null,
    error: null
  };

  let parsedRedis = null;
  const redisUrl = process.env.REDIS_URL;
  if (redisUrl) {
    try {
      const u = new URL(redisUrl);
      const host = u.hostname;
      // In redis URLs, password is often after the colon: redis://:password@host:port
      // or redis://username:password@host:port
      const password = u.password || u.username; 
      parsedRedis = {
        host,
        hasPassword: !!password,
        passwordLength: password ? password.length : 0,
        protocol: u.protocol,
        port: u.port
      };

      if (password && host) {
        const restUrl = `https://${host}`;
        const restToken = password;
        
        const response = await fetch(restUrl, {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${restToken}`,
            'Content-Type': 'application/json'
          },
          body: JSON.stringify(['GET', 'sessions'])
        });
        debugData.kvStatus = response.status;
        debugData.kvStatusText = response.statusText;
        const text = await response.text();
        debugData.rawKvResponse = text;
        
        try {
          const json = JSON.parse(text);
          debugData.parsedJson = json;
          if (json && json.hasOwnProperty('result')) {
            if (json.result === null) {
              debugData.sessionsParsed = [];
            } else {
              debugData.sessionsParsed = JSON.parse(json.result);
            }
          }
        } catch (e) {
          debugData.jsonError = e.message;
        }
      }
    } catch (e) {
      debugData.redisParseError = e.message;
    }
  }

  debugData.parsedRedis = parsedRedis;

  if (kvUrl && kvToken) {
    try {
      const response = await fetch(kvUrl, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${kvToken}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(['GET', 'sessions'])
      });
      debugData.kvStatus = response.status;
      debugData.kvStatusText = response.statusText;
      const text = await response.text();
      debugData.rawKvResponse = text;
      try {
        const json = JSON.parse(text);
        debugData.parsedJson = json;
        if (json && json.hasOwnProperty('result')) {
          if (json.result === null) {
            debugData.sessionsParsed = [];
          } else {
            debugData.sessionsParsed = JSON.parse(json.result);
          }
        }
      } catch (e) {
        debugData.jsonError = e.message;
      }
    } catch (err) {
      debugData.error = err.message;
      debugData.stack = err.stack;
    }
  }

  return res.status(200).json(debugData);
}
