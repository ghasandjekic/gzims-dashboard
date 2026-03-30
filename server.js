const http = require('http');
const fs = require('fs');
const path = require('path');

const PORT = 3000;
const DIR = __dirname;
const DATA_FILE = path.join(DIR, 'tasks.json');

const MIME = {
    '.html': 'text/html',
    '.css': 'text/css',
    '.js': 'application/javascript',
    '.json': 'application/json',
    '.svg': 'image/svg+xml',
    '.png': 'image/png',
    '.ico': 'image/x-icon'
};

// Initialize tasks.json if it doesn't exist
if (!fs.existsSync(DATA_FILE)) {
    fs.writeFileSync(DATA_FILE, JSON.stringify({ tasks: [], clients: ['GPS', 'Josh', 'JMJ', 'WRC Flamur'] }, null, 2));
}

function readData() {
    try {
        return JSON.parse(fs.readFileSync(DATA_FILE, 'utf8'));
    } catch {
        return { tasks: [], clients: ['GPS', 'Josh', 'JMJ', 'WRC Flamur'] };
    }
}

function writeData(data) {
    fs.writeFileSync(DATA_FILE, JSON.stringify(data, null, 2));
}

function parseBody(req) {
    return new Promise((resolve, reject) => {
        let body = '';
        req.on('data', chunk => body += chunk);
        req.on('end', () => {
            try { resolve(JSON.parse(body)); }
            catch { reject(new Error('Invalid JSON')); }
        });
    });
}

function sendJson(res, status, data) {
    res.writeHead(status, {
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
        'Access-Control-Allow-Headers': 'Content-Type'
    });
    res.end(JSON.stringify(data));
}

function getLocalIP() {
    const nets = require('os').networkInterfaces();
    for (const name of Object.keys(nets)) {
        for (const net of nets[name]) {
            if (net.family === 'IPv4' && !net.internal) {
                return net.address;
            }
        }
    }
    return 'localhost';
}

const server = http.createServer(async (req, res) => {
    // Handle CORS preflight
    if (req.method === 'OPTIONS') {
        res.writeHead(204, {
            'Access-Control-Allow-Origin': '*',
            'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
            'Access-Control-Allow-Headers': 'Content-Type'
        });
        res.end();
        return;
    }

    const url = new URL(req.url, `http://${req.headers.host}`);
    const pathname = url.pathname;

    // ===== API ROUTES =====

    // GET /api/data — return all tasks and clients
    if (pathname === '/api/data' && req.method === 'GET') {
        return sendJson(res, 200, readData());
    }

    // POST /api/data — full sync: replace all data
    if (pathname === '/api/data' && req.method === 'POST') {
        try {
            const body = await parseBody(req);
            writeData({ tasks: body.tasks || [], clients: body.clients || [] });
            return sendJson(res, 200, { ok: true });
        } catch {
            return sendJson(res, 400, { error: 'Invalid data' });
        }
    }

    // POST /api/tasks — add a single task
    if (pathname === '/api/tasks' && req.method === 'POST') {
        try {
            const task = await parseBody(req);
            const data = readData();
            data.tasks.push(task);
            writeData(data);
            return sendJson(res, 201, { ok: true, task });
        } catch {
            return sendJson(res, 400, { error: 'Invalid task' });
        }
    }

    // PUT /api/tasks/:id — update a task
    if (pathname.startsWith('/api/tasks/') && req.method === 'PUT') {
        try {
            const id = pathname.split('/').pop();
            const updates = await parseBody(req);
            const data = readData();
            const idx = data.tasks.findIndex(t => t.id === id);
            if (idx === -1) return sendJson(res, 404, { error: 'Task not found' });
            data.tasks[idx] = { ...data.tasks[idx], ...updates };
            writeData(data);
            return sendJson(res, 200, { ok: true, task: data.tasks[idx] });
        } catch {
            return sendJson(res, 400, { error: 'Invalid data' });
        }
    }

    // DELETE /api/tasks/:id — delete a task
    if (pathname.startsWith('/api/tasks/') && req.method === 'DELETE') {
        const id = pathname.split('/').pop();
        const data = readData();
        data.tasks = data.tasks.filter(t => t.id !== id);
        writeData(data);
        return sendJson(res, 200, { ok: true });
    }

    // POST /api/clients — update client list
    if (pathname === '/api/clients' && req.method === 'POST') {
        try {
            const body = await parseBody(req);
            const data = readData();
            data.clients = body.clients || [];
            writeData(data);
            return sendJson(res, 200, { ok: true });
        } catch {
            return sendJson(res, 400, { error: 'Invalid data' });
        }
    }

    // ===== STATIC FILES =====
    let filePath = path.join(DIR, pathname === '/' ? 'index.html' : pathname);
    const ext = path.extname(filePath);
    const contentType = MIME[ext] || 'text/plain';

    fs.readFile(filePath, (err, data) => {
        if (err) {
            res.writeHead(404);
            res.end('Not found');
            return;
        }
        res.writeHead(200, { 'Content-Type': contentType });
        res.end(data);
    });
});

server.listen(PORT, '0.0.0.0', () => {
    const ip = getLocalIP();
    console.log('');
    console.log('===========================================');
    console.log('  Gzim\'s Dashboard is running!');
    console.log('===========================================');
    console.log('');
    console.log(`  Computer:  http://localhost:${PORT}`);
    console.log(`  Phone:     http://${ip}:${PORT}`);
    console.log('');
    console.log('  (Phone URL works when on the same WiFi)');
    console.log('===========================================');
    console.log('');
});
