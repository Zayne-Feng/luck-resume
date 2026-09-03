import { createServer } from 'node:http';
import { apiMiddleware } from '../server/http.mjs';
import { publicConfiguration } from '../server/publicConfig.mjs';

try {
  const configuration = publicConfiguration(process.env);
  const server = createServer(async (request, response) => {
    try {
      const handled = await apiMiddleware(request, response, undefined, configuration);
      if (!handled)
        response
          .writeHead(404, { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' })
          .end(JSON.stringify({ error: 'This service provides API endpoints only.' }));
    } catch {
      if (!response.headersSent)
        response.writeHead(500, {
          'Content-Type': 'application/json',
          'Cache-Control': 'no-store',
        });
      response.end(
        JSON.stringify({ error: 'The local service could not complete this operation.' }),
      );
    }
  });
  server.on('error', (error) => {
    console.error(`The API service could not listen on its loopback port (${error.code}).`);
    process.exitCode = 1;
  });
  server.listen(configuration.port, '127.0.0.1', () => {
    console.log(`Local API: http://127.0.0.1:${configuration.port}`);
    console.log(`Application origin: ${configuration.publicOrigin}`);
  });
} catch (error) {
  console.error(error.message);
  process.exitCode = 1;
}
