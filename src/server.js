const http = require('http');
const path = require('path');
const fs = require('fs/promises');

const PORT = process.env.PORT || 3000;
const DASH_SCOPE_URL = 'https://dashscope.aliyuncs.com/compatible-mode/v1/chat/completions';
const PUBLIC_DIR = path.join(__dirname, '..', 'public');
const PUBLIC_DIR_WITH_SEP = `${PUBLIC_DIR}${path.sep}`;

const CONTENT_TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'application/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.gif': 'image/gif',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon'
};

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, `http://${req.headers.host}`);

  if (req.method === 'GET') {
    await handleStaticAsset(url.pathname, res);
    return;
  }

  if (req.method === 'POST' && url.pathname === '/api/chat') {
    await handleChatRequest(req, res);
    return;
  }

  if (req.method === 'POST' && url.pathname === '/api/image-to-text') {
    await handleImageToTextRequest(req, res);
    return;
  }

  if (req.method === 'OPTIONS' && (url.pathname === '/api/chat' || url.pathname === '/api/image-to-text')) {
    res.writeHead(204, {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'POST, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type'
    });
    res.end();
    return;
  }

  res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
  res.end('Not Found');
});

async function handleStaticAsset(requestPath, res) {
  const relativePath = requestPath === '/' ? 'index.html' : requestPath.replace(/^\/+/, '');
  const assetPath = path.normalize(path.join(PUBLIC_DIR, relativePath));

  const isInsidePublic = assetPath === PUBLIC_DIR || assetPath.startsWith(PUBLIC_DIR_WITH_SEP);
  if (!isInsidePublic) {
    res.writeHead(403, { 'Content-Type': 'text/plain; charset=utf-8' });
    res.end('Forbidden');
    return;
  }

  try {
    const data = await fs.readFile(assetPath);
    const ext = path.extname(assetPath).toLowerCase();
    const contentType = CONTENT_TYPES[ext] || 'application/octet-stream';
    res.writeHead(200, {
      'Content-Type': contentType,
      'Cache-Control': 'no-store'
    });
    res.end(data);
  } catch (error) {
    if (error.code === 'ENOENT') {
      res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
      res.end('Not Found');
      return;
    }

    console.error('Error serving asset:', error);
    res.writeHead(500, { 'Content-Type': 'text/plain; charset=utf-8' });
    res.end('Internal Server Error');
  }
}

async function handleChatRequest(req, res) {
  collectRequestBody(req, res, async rawBody => {
    try {
      const parsed = JSON.parse(rawBody || '{}');
      const prompt = typeof parsed.prompt === 'string' ? parsed.prompt.trim() : '';

      if (!prompt) {
        sendJson(res, 400, { error: 'Prompt is required.' });
        return;
      }

      const apiKey = process.env.DASHSCOPE_API_KEY;
      if (!apiKey) {
        sendJson(res, 500, { error: 'DASHSCOPE_API_KEY is not set on the server.' });
        return;
      }

      const payload = {
        model: 'qwen-plus',
        messages: [
          { role: 'system', content: 'You are a helpful assistant.' },
          { role: 'user', content: prompt }
        ]
      };

      const response = await fetch(DASH_SCOPE_URL, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${apiKey}`
        },
        body: JSON.stringify(payload)
      });

      const result = await response.json();

      if (!response.ok) {
        console.error('DashScope error:', result);
        sendJson(res, response.status, {
          error: result?.error?.message || 'Failed to retrieve response from Qwen.'
        });
        return;
      }

      const message = Array.isArray(result?.choices)
        ? result.choices[0]?.message?.content || 'No response generated.'
        : 'No response generated.';

      sendJson(res, 200, { response: message });
    } catch (error) {
      console.error('Error handling chat request:', error);
      sendJson(res, 500, { error: 'Failed to process request.' });
    }
  });
}

async function handleImageToTextRequest(req, res) {
  collectRequestBody(req, res, async rawBody => {
    try {
      const parsed = JSON.parse(rawBody || '{}');
      const imageData = typeof parsed.imageData === 'string' ? parsed.imageData.trim() : '';
      const prompt = typeof parsed.prompt === 'string' && parsed.prompt.trim()
        ? parsed.prompt.trim()
        : '请识别这张图片中的内容，并输出清晰的文字描述。';

      if (!imageData) {
        sendJson(res, 400, { error: 'Image data is required.' });
        return;
      }

      const apiKey = process.env.DASHSCOPE_API_KEY;
      if (!apiKey) {
        sendJson(res, 500, { error: 'DASHSCOPE_API_KEY is not set on the server.' });
        return;
      }

      const payload = {
        model: 'qwen-vl-plus',
        messages: [
          {
            role: 'user',
            content: [
              { type: 'input_text', text: prompt },
              { type: 'input_image', image_url: imageData }
            ]
          }
        ]
      };

      const response = await fetch(DASH_SCOPE_URL, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${apiKey}`
        },
        body: JSON.stringify(payload)
      });

      const result = await response.json();

      if (!response.ok) {
        console.error('DashScope error:', result);
        sendJson(res, response.status, {
          error: result?.error?.message || 'Failed to retrieve response from Qwen.'
        });
        return;
      }

      const messageContent = result?.choices?.[0]?.message?.content;
      let textResponse = 'No response generated.';

      if (Array.isArray(messageContent)) {
        textResponse = messageContent
          .filter(part => part?.type === 'output_text' && typeof part?.text === 'string')
          .map(part => part.text)
          .join('\n') || textResponse;
      } else if (typeof messageContent === 'string') {
        textResponse = messageContent;
      }

      sendJson(res, 200, { response: textResponse });
    } catch (error) {
      console.error('Error handling image-to-text request:', error);
      sendJson(res, 500, { error: 'Failed to process image.' });
    }
  });
}

function collectRequestBody(req, res, onComplete) {
  let rawBody = '';

  req.on('data', chunk => {
    rawBody += chunk;
    if (rawBody.length > 15e6) {
      req.socket.destroy();
    }
  });

  req.on('error', error => {
    console.error('Request stream error:', error);
    sendJson(res, 400, { error: 'Invalid request stream.' });
  });

  req.on('end', () => {
    onComplete(rawBody);
  });
}

function sendJson(res, statusCode, data) {
  res.writeHead(statusCode, {
    'Content-Type': 'application/json; charset=utf-8',
    'Access-Control-Allow-Origin': '*'
  });
  res.end(JSON.stringify(data));
}

server.listen(PORT, () => {
  console.log(`Server listening on http://localhost:${PORT}`);
});
