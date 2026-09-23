/** Точка входа сервера: проверка настроек, маршруты, раздача собранного фронта. */

import { serve } from '@hono/node-server';
import { serveStatic } from '@hono/node-server/serve-static';
import { Hono } from 'hono';
import { config } from './config.ts';
import { log } from './lib/logger.ts';
import { chatRoute } from './routes/chat.ts';

const app = new Hono();

app.get('/api/health', (c) => c.json({ ok: true }));

app.route('/api', chatRoute);

// В разработке фронт поднимает Vite и сюда не обращается, а папки сборки ещё нет —
// подключать раздачу статики в этом режиме значит писать в лог ошибку на каждом старте.
if (config.isProduction) {
  app.use('/*', serveStatic({ root: './web/dist' }));
  app.get('/*', serveStatic({ path: './web/dist/index.html' }));
}

serve({ fetch: app.fetch, port: config.port }, (info) => {
  log.info('server.started', { port: info.port, production: config.isProduction });
});
