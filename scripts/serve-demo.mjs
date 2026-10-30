import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
const root=path.resolve('demo/public'),mime={'.html':'text/html','.js':'text/javascript','.mjs':'text/javascript','.css':'text/css','.svg':'image/svg+xml'};
http.createServer((req,res)=>{try{let name=decodeURIComponent(new URL(req.url,'http://localhost').pathname);if(name==='/')name='/index.html';const file=path.resolve(root,'.'+name);if(!file.startsWith(root+path.sep))throw Error();const bytes=fs.readFileSync(file);res.writeHead(200,{'Content-Type':(mime[path.extname(file)]||'application/octet-stream')+'; charset=utf-8','Cache-Control':'no-store','Content-Security-Policy':"default-src 'self'; script-src 'self'; style-src 'self'; img-src 'self' data:; connect-src 'none'; base-uri 'none'"});res.end(bytes);}catch{res.writeHead(404);res.end('Not found');}}).listen(5138,'127.0.0.1',()=>console.log('在线演示本地预览：http://127.0.0.1:5138/'));
