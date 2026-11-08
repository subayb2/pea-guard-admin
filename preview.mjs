import http from 'node:http';
import fs from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
const root=fileURLToPath(new URL('./web/',import.meta.url));
const types={'.html':'text/html; charset=utf-8','.css':'text/css; charset=utf-8','.js':'text/javascript; charset=utf-8','.svg':'image/svg+xml'};
http.createServer(async(req,res)=>{try{const pathname=decodeURIComponent(new URL(req.url,'http://localhost').pathname),filename=path.resolve(root,'.'+(pathname.endsWith('/')?pathname+'index.html':pathname));if(!filename.startsWith(root)){res.writeHead(403);res.end();return;}const bytes=await fs.readFile(filename);res.writeHead(200,{'Content-Type':types[path.extname(filename)]||'application/octet-stream','Cache-Control':'no-store'});res.end(bytes);}catch{res.writeHead(404);res.end('Not found');}}).listen(8766,'127.0.0.1',()=>console.log('Admin Dashboard preview: http://127.0.0.1:8766/'));
