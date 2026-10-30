const http = require('node:http');

/** Development transport only. Business rules and HMAC stay in the Next backend. */
function createWebhookProxy(origin) {
  const target = new URL(origin);
  if (!['127.0.0.1','localhost','[::1]'].includes(target.hostname) || target.protocol !== 'http:') throw new Error('LOCAL_ORIGIN_REQUIRED');
  return http.createServer((request, response) => {
    if (request.method !== 'POST' || !/^\/api\/whatsapp\/webhooks\/[A-Za-z0-9_-]{1,100}$/.test(request.url || '')) {
      response.writeHead(404); response.end(); return;
    }
    let size = 0;
    const parts = [];
    request.on('data', chunk => {
      size += chunk.length;
      if (size <= 262144) parts.push(chunk);
    });
    request.on('end', () => {
      if (size > 262144) { response.writeHead(413); response.end(); return; }
      const headers = { 'content-type': 'application/json' };
      for (const name of ['x-webhook-hmac','x-webhook-hmac-algorithm','x-webhook-request-id','x-webhook-timestamp']) if (typeof request.headers[name] === 'string') headers[name] = request.headers[name];
      // Forward the original bytes; serializing JSON would invalidate HMAC.
      const outgoing = http.request(new URL(request.url, target), { method: 'POST', headers, timeout: 15000 }, incoming => {
        response.writeHead(incoming.statusCode || 502, { 'content-type': incoming.headers['content-type'] || 'application/json', 'cache-control': 'no-store' });
        incoming.pipe(response);
      });
      outgoing.on('timeout', () => outgoing.destroy());
      outgoing.on('error', () => { if (!response.headersSent) response.writeHead(502); response.end(); });
      response.on('close', () => outgoing.destroy());
      outgoing.end(Buffer.concat(parts));
    });
    request.on('error', () => { if (!response.headersSent) response.writeHead(400); response.end(); });
  });
}
module.exports = { createWebhookProxy };
