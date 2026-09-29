/*
 * Servidor estático mínimo (sem dependências) para servir o protótipo
 * RotaAcessível em http://localhost:3000. Uso opcional: `node server.js`.
 * Alternativa rápida sem esta linha: `npx serve` nesta pasta.
 */
const http = require('http');
const fs = require('fs');
const path = require('path');

const PORT = process.env.PORT || 3000;
const RAIZ = __dirname;

const TIPOS = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.ico': 'image/x-icon',
  '.json': 'application/json; charset=utf-8'
};

const servidor = http.createServer((req, res) => {
  // Remove query string e evita path traversal.
  let url = decodeURIComponent(req.url.split('?')[0]);
  if (url === '/') url = '/index.html';
  const caminho = path.normalize(path.join(RAIZ, url));
  if (!caminho.startsWith(RAIZ)) {
    res.writeHead(403);
    return res.end('403 - Acesso negado');
  }

  fs.readFile(caminho, (erro, dados) => {
    if (erro) {
      res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
      return res.end('404 - Arquivo nao encontrado');
    }
    const ext = path.extname(caminho).toLowerCase();
    res.writeHead(200, { 'Content-Type': TIPOS[ext] || 'application/octet-stream' });
    res.end(dados);
  });
});

servidor.listen(PORT, () => {
  console.log(`RotaAcessível rodando em http://localhost:${PORT}`);
});
