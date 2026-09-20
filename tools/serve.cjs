const http = require('http');
const fs = require('fs');
const path = require('path');
const root = path.resolve(__dirname, '../release/web');
const port = Number(process.env.PORT || 18765);
const mime = { '.html':'text/html; charset=utf-8', '.js':'text/javascript; charset=utf-8', '.json':'application/json', '.wasm':'application/wasm', '.png':'image/png', '.jpg':'image/jpeg', '.css':'text/css' };
http.createServer((req,res)=>{
  if(req.url==='/favicon.ico'){res.writeHead(204);res.end();return;}
  let pathname;
  try { pathname = decodeURIComponent(new URL(req.url,'http://localhost').pathname); } catch {res.writeHead(400);res.end();return;}
  const file=path.resolve(root,'.'+(pathname==='/'?'/index.html':pathname));
  if(file!==root && !file.startsWith(root+path.sep)){res.writeHead(403);res.end();return;}
  fs.stat(file,(err,stat)=>{
    if(err||!stat.isFile()){res.writeHead(404);res.end('Not found');return;}
    res.writeHead(200,{'Content-Type':mime[path.extname(file)]||'application/octet-stream','Cache-Control':'no-store'});
    fs.createReadStream(file).pipe(res);
  });
}).on('error',error=>{if(error.code==='EADDRINUSE')console.log(`端口 ${port} 已被占用；若游戏已启动，可直接打开 http://127.0.0.1:${port}`);else console.error(error);}).listen(port,'127.0.0.1',()=>console.log(`凌水湖游戏：http://127.0.0.1:${port}`));
