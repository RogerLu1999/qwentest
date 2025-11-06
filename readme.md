# Qwen Web Tool

A minimal Node.js application that exposes a browser-based interface for sending prompts to the Qwen large language model through the DashScope API.

## Prerequisites

- Node.js 18 or newer (the project was built with Node.js 22).
- A valid DashScope API key with access to a Qwen model, stored in the `DASHSCOPE_API_KEY` environment variable.

## Getting started

1. Install dependencies (none are required beyond Node.js itself).
2. Export your DashScope API key:

   ```bash
   export DASHSCOPE_API_KEY="your_api_key_here"
   ```

3. Start the server:

   ```bash
   npm start
   ```

4. Open your browser to [http://localhost:3000](http://localhost:3000) and begin chatting with Qwen.

## Project structure

```
.
├── package.json
├── public
│   └── index.html
└── src
    └── server.js
```

- `src/server.js` – Node.js HTTP server that serves the static web client and proxies chat requests to the DashScope API.
- `public/index.html` – Single-page interface for composing prompts and viewing responses.

## Customization tips

- Update the `model` field inside `src/server.js` if you want to target a different Qwen model family member.
- Adjust the front-end styles in `public/index.html` to match your desired look and feel.

## Troubleshooting

- Ensure `DASHSCOPE_API_KEY` is set before launching the server. Requests to `/api/chat` will return an error if the key is missing.
- Network access is required for the server to reach the DashScope API endpoint. If you are behind a proxy, configure it using standard environment variables like `HTTPS_PROXY` or `HTTP_PROXY`.
