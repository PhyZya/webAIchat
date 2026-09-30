import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';

const SERVER_PORT = 8787;

export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    // Всё, что начинается с /api, уходит на наш прокси. Браузер не знает
    // ни адреса OpenRouter, ни ключа — во вкладке Network видно только localhost.
    proxy: {
      '/api': {
        target: `http://localhost:${SERVER_PORT}`,
        changeOrigin: true,
      },
    },
    // Общий с сервером пакет лежит выше корня фронта.
    fs: { allow: ['..'] },
  },
  // Пакет с исходниками на TypeScript не нужно предварительно собирать в зависимость.
  optimizeDeps: { exclude: ['@filament/shared'] },
});
