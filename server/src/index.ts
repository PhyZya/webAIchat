/** Точка входа сервера: проверка настроек, маршруты, раздача собранного фронта. */

import { resolve } from 'node:path';
import { serve } from '@hono/node-server';
import { serveStatic } from '@hono/node-server/serve-static';
import { Hono } from 'hono';
import { config } from './config.ts';
import { log } from './lib/logger.ts';
import { chatRoute } from './routes/chat.ts';

const app = new Hono();

// Путь от файла, а не от текущей папки: npm start -w server запускает процесс
// из server/, и относительный './web/dist' там указывает в пустоту.
const WEB_DIST = resolve(import.meta.dirname, '../../web/dist');

app.get('/api/health', (c) => c.json({ ok: true }));

app.route('/api', chatRoute);

// Неизвестный адрес API — это ошибка клиента, а не повод отдать index.html.
app.all('/api/*', (c) => c.json({ code: 'not_found' }, 404));

// В разработке фронт поднимает Vite и сюда не обращается, а папки сборки ещё нет —
// подключать раздачу статики в этом режиме значит писать в лог ошибку на каждом старте.
if (config.isProduction) {
  app.use('/*', serveStatic({ root: WEB_DIST }));
  app.get('/*', serveStatic({ root: WEB_DIST, path: 'index.html' }));
}

const server = serve({ fetch: app.fetch, port: config.port }, (info) => {
  log.info('server.started', { port: info.port, production: config.isProduction });
});

// Самый частый случай — порт уже занят вторым запуском. Без обработчика это
// голый стек-трейс, а так в логе видно код ошибки.
server.on('error', (error: NodeJS.ErrnoException) => {
  log.error('server.failed', { code: error.code, reason: error.message });
  process.exitCode = 1;
});
