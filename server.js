const http = require('http');
const fs = require('fs');
const path = require('path');

const PORT = 3000;

// MIME类型映射
const mimeTypes = {
    '.html': 'text/html',
    '.js': 'text/javascript',
    '.css': 'text/css',
    '.json': 'application/json',
    '.png': 'image/png',
    '.jpg': 'image/jpg',
    '.gif': 'image/gif',
    '.svg': 'image/svg+xml',
    '.wav': 'audio/wav',
    '.mp4': 'video/mp4',
    '.woff': 'application/font-woff',
    '.ttf': 'application/font-ttf',
    '.eot': 'application/vnd.ms-fontobject',
    '.otf': 'application/font-otf',
    '.wasm': 'application/wasm'
};

const server = http.createServer((req, res) => {
    console.log(`${req.method} ${req.url}`);
    
    // 处理CORS
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
    
    if (req.method === 'OPTIONS') {
        res.writeHead(200);
        res.end();
        return;
    }
    
    // 处理API请求
    if (req.url === '/generate' && req.method === 'POST') {
        let body = '';
        req.on('data', chunk => {
            body += chunk.toString();
        });
        req.on('end', async () => {
            try {
                const requestData = JSON.parse(body);
                console.log('收到生成请求:', requestData);
                
                if (requestData.model === 'volcengine') {
                    const result = await handleVolcengineGeneration(requestData);
                    res.writeHead(200, { 'Content-Type': 'application/json' });
                    res.end(JSON.stringify(result));
                } else {
                    // 其他模型的处理逻辑
                    res.writeHead(400, { 'Content-Type': 'application/json' });
                    res.end(JSON.stringify({ error: '不支持的模型类型' }));
                }
            } catch (error) {
                console.error('API处理错误:', error);
                res.writeHead(500, { 'Content-Type': 'application/json' });
                res.end(JSON.stringify({ error: error.message }));
            }
        });
        return;
    }
    
    // 解析URL路径
    let filePath = req.url;
    if (filePath === '/') {
        filePath = '/index.html';
    }
    
    // 构建完整文件路径
    const fullPath = path.join(__dirname, 'static', filePath);
    
    // 获取文件扩展名
    const extname = String(path.extname(fullPath)).toLowerCase();
    const mimeType = mimeTypes[extname] || 'application/octet-stream';
    
    // 读取文件
    fs.readFile(fullPath, (error, content) => {
        if (error) {
            if (error.code === 'ENOENT') {
                // 文件不存在
                res.writeHead(404, { 'Content-Type': 'text/html' });
                res.end('<h1>404 - File Not Found</h1>', 'utf-8');
            } else {
                // 服务器错误
                res.writeHead(500);
                res.end(`Server Error: ${error.code}`, 'utf-8');
            }
        } else {
            // 成功返回文件
            res.writeHead(200, { 'Content-Type': mimeType });
            res.end(content, 'utf-8');
        }
    });
});

// 火山引擎API调用函数 - 暂时返回模拟结果，需要正确的签名机制
async function handleVolcengineGeneration(requestData) {
    const { apikey, parameters } = requestData;
    const { prompt, width, height, force_single } = parameters;
    
    // 验证参数
    if (!prompt || prompt.length > 800) {
        throw new Error('提示词不能为空且不能超过800字符');
    }
    
    // 验证分辨率范围 [1024*1024, 4096*4096]
    const area = width * height;
    if (area < 1024 * 1024 || area > 4096 * 4096) {
        throw new Error('图片分辨率必须在1K到4K范围内');
    }
    
    if (!apikey) {
        throw new Error('火山引擎API密钥未提供');
    }
    
    console.log('火山引擎即梦4.0 API调用 - 当前为模拟模式');
    console.log('请求参数:', { prompt, width, height, force_single });
    console.log('API Key已提供:', apikey.substring(0, 10) + '...');
    
    // 注意：火山引擎API需要复杂的签名机制，不是简单的Bearer Token
    // 当前返回模拟结果，需要实现正确的签名算法才能调用真实API
    console.warn('警告：当前使用模拟响应。火山引擎API需要实现V4签名算法，包括：');
    console.warn('1. 正规化请求构造');
    console.warn('2. 签名字符串生成');
    console.warn('3. 签名密钥计算');
    console.warn('4. 正确的请求头设置');
    
    // 模拟API调用延迟
    await new Promise(resolve => setTimeout(resolve, 2000));
    
    // 返回模拟结果
    return {
        imageUrl: 'https://via.placeholder.com/512x512/FF6B6B/FFFFFF?text=Volcengine+Mock+Result',
        success: true,
        message: '模拟结果：火山引擎API需要实现正确的签名机制才能调用真实接口'
    };
}

server.listen(PORT, () => {
    console.log(`服务器运行在 http://localhost:${PORT}`);
    console.log('按 Ctrl+C 停止服务器');
});

// 优雅关闭
process.on('SIGINT', () => {
    console.log('\n正在关闭服务器...');
    server.close(() => {
        console.log('服务器已关闭');
        process.exit(0);
    });
});