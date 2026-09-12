import { defineConfig } from 'vite';

// The bridge is the only thing that touches ~/.claude transcripts, and it binds
// 127.0.0.1. Proxying through the dev server keeps the browser on one origin so
// EventSource doesn't need CORS.
//
// strictPort matters here: with port-hunting on, Vite once landed on the
// bridge's own port over IPv6 while the bridge held IPv4, and the proxy target
// became ambiguous. Fail loudly instead.
export default defineConfig({
  server: {
    host: '127.0.0.1',
    port: 5180,
    strictPort: true,
    proxy: {
      '/api': {
        target: 'http://127.0.0.1:8787',
        changeOrigin: false,
        // SSE must not be buffered or timed out by the proxy.
        configure: (proxy) => {
          proxy.on('proxyRes', (proxyRes) => {
            proxyRes.headers['cache-control'] = 'no-cache, no-transform';
          });
        },
      },
    },
  },
});
