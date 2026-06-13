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
