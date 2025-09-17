const http = require('http');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

// 使用系统环境变量（无需dotenv）

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
    
    // 处理图片上传
    if (req.url === '/upload' && req.method === 'POST') {
        let body = '';
        req.on('data', chunk => {
            body += chunk.toString();
        });
        req.on('end', async () => {
            try {
                const uploadData = JSON.parse(body);
                console.log('收到图片上传请求');
                
                const uploadedUrls = [];
                
                // 处理每个base64图片
                if (uploadData.images && Array.isArray(uploadData.images)) {
                    for (const base64Data of uploadData.images) {
                        try {
                            // 优先使用ImgBB图床服务
                            if (process.env.IMGBB_API_KEY) {
                                console.log('使用ImgBB图床服务上传图片');
                                
                                // 提取base64数据（去掉data:image/xxx;base64,前缀）
                                const base64Only = base64Data.replace(/^data:image\/[a-zA-Z]+;base64,/, '');
                                
                                // 上传到ImgBB
                                const formData = new URLSearchParams();
                                formData.append('image', base64Only);
                                
                                const imgbbResponse = await fetch(`https://api.imgbb.com/1/upload?key=${process.env.IMGBB_API_KEY}`, {
                                    method: 'POST',
                                    body: formData
                                });
                                
                                if (imgbbResponse.ok) {
                                    const imgbbResult = await imgbbResponse.json();
                                    if (imgbbResult.success) {
                                        uploadedUrls.push(imgbbResult.data.url);
                                        console.log(`图片已上传到ImgBB: ${imgbbResult.data.url}`);
                                        continue;
                                    }
                                }
                                
                                console.log('ImgBB上传失败，回退到本地存储');
                            }
                            
                            // 回退方案：本地存储
                            console.log('使用本地存储');
                            
                            // 确保uploads目录存在
                            const uploadsDir = path.join(__dirname, 'static', 'uploads');
                            if (!fs.existsSync(uploadsDir)) {
                                fs.mkdirSync(uploadsDir, { recursive: true });
                            }
                            
                            // 提取base64数据（去掉data:image/xxx;base64,前缀）
                            const matches = base64Data.match(/^data:image\/([a-zA-Z]+);base64,(.+)$/);
                            if (matches) {
                                const imageType = matches[1];
                                const imageBuffer = Buffer.from(matches[2], 'base64');
                                
                                // 生成唯一文件名
                                const fileName = `${crypto.randomUUID()}.${imageType}`;
                                const filePath = path.join(uploadsDir, fileName);
                                
                                // 保存文件
                                fs.writeFileSync(filePath, imageBuffer);
                                
                                // 生成可访问的URL
                                const imageUrl = `http://localhost:${PORT}/uploads/${fileName}`;
                                uploadedUrls.push(imageUrl);
                                
                                console.log(`图片已保存到本地: ${fileName}`);
                            } else {
                                console.error('无效的base64图片格式');
                            }
                        } catch (imageError) {
                            console.error('单个图片处理失败:', imageError);
                        }
                    }
                }
                
                res.writeHead(200, { 'Content-Type': 'application/json' });
                res.end(JSON.stringify({ urls: uploadedUrls }));
            } catch (error) {
                console.error('图片上传错误:', error);
                res.writeHead(500, { 'Content-Type': 'application/json' });
                res.end(JSON.stringify({ error: error.message }));
            }
        });
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
                
                // 检查是否为即梦4.0请求（通过apikey字段识别）
                if (requestData.apikey && requestData.parameters) {
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

// 火山引擎V4签名算法实现
class VolcengineV4Signer {
    constructor(accessKeyId, secretAccessKey, region = 'cn-north-1', service = 'cv') {
        this.accessKeyId = accessKeyId;
        this.secretAccessKey = secretAccessKey;
        this.region = region;
        this.service = service;
    }

    // SHA256哈希
    async sha256(data) {
        const crypto = require('crypto');
        return crypto.createHash('sha256').update(data, 'utf8').digest('hex');
    }

    // HMAC-SHA256签名
    async hmacSha256(key, data) {
        const crypto = require('crypto');
        return crypto.createHmac('sha256', key).update(data, 'utf8').digest();
    }

    // URL编码
    urlEncode(str) {
        return encodeURIComponent(str)
            .replace(/[!'()*]/g, (c) => '%' + c.charCodeAt(0).toString(16).toUpperCase())
            .replace(/%20/g, '+');
    }

    // 生成签名
    async sign(method, path, query, headers, body) {
        const now = new Date();
        const xDate = now.toISOString().replace(/[:\-]|\.\d{3}/g, '').replace('T', 'T').replace('Z', 'Z');
        const shortDate = xDate.substring(0, 8);

        // 添加必要的头部
        const signedHeaders = {
            ...headers,
            'X-Date': xDate,
            'Host': 'visual.volcengineapi.com',
            'Content-Type': 'application/json'
        };

        // 1. 创建正规化请求
        const sortedQuery = Object.keys(query).sort().map(key => 
            `${this.urlEncode(key)}=${this.urlEncode(query[key])}`
        ).join('&');

        const sortedHeaderKeys = Object.keys(signedHeaders).map(k => k.toLowerCase()).sort();
        const canonicalHeaders = sortedHeaderKeys.map(key => 
            `${key}:${signedHeaders[Object.keys(signedHeaders).find(k => k.toLowerCase() === key)].trim()}`
        ).join('\n') + '\n';

        const signedHeadersStr = sortedHeaderKeys.join(';');
        const bodyHash = await this.sha256(body);

        const canonicalRequest = [
            method,
            path,
            sortedQuery,
            canonicalHeaders,
            signedHeadersStr,
            bodyHash
        ].join('\n');

        // 2. 创建签名字符串
        const algorithm = 'HMAC-SHA256';
        const credentialScope = `${shortDate}/${this.region}/${this.service}/request`;
        const canonicalRequestHash = await this.sha256(canonicalRequest);
        
        const stringToSign = [
            algorithm,
            xDate,
            credentialScope,
            canonicalRequestHash
        ].join('\n');

        // 3. 计算签名
        let signingKey = await this.hmacSha256(this.secretAccessKey, shortDate);
        signingKey = await this.hmacSha256(signingKey, this.region);
        signingKey = await this.hmacSha256(signingKey, this.service);
        signingKey = await this.hmacSha256(signingKey, 'request');
        
        const signature = await this.hmacSha256(signingKey, stringToSign);
        const signatureHex = signature.toString('hex');

        // 4. 构建Authorization头
        const authorization = `${algorithm} Credential=${this.accessKeyId}/${credentialScope}, SignedHeaders=${signedHeadersStr}, Signature=${signatureHex}`;

        return {
            ...signedHeaders,
            'Authorization': authorization
        };
    }
}

// 火山引擎API调用函数 - 使用V4签名
async function handleVolcengineGeneration(requestData) {
    const { apikey, parameters } = requestData;
    const { prompt, width, height, force_single, scale, image_urls } = parameters;
    
    // 解析credentials格式: "AccessKeyId:SecretAccessKey"
    const [accessKeyId, secretAccessKey] = apikey.split(':');
    if (!accessKeyId || !secretAccessKey) {
        throw new Error('火山引擎API密钥格式错误，应为: AccessKeyId:SecretAccessKey');
    }
    
    // 验证参数
    if (!prompt || prompt.length > 800) {
        throw new Error('提示词不能为空且不能超过800字符');
    }
    
    // 验证分辨率范围 [1024*1024, 4096*4096]
    const area = width * height;
    if (area < 1024 * 1024 || area > 4096 * 4096) {
        throw new Error('图片分辨率必须在1K到4K范围内');
    }
    
    const signer = new VolcengineV4Signer(accessKeyId, secretAccessKey);
    
    // 构建请求体
    const requestBody = {
        req_key: "jimeng_t2i_v40",
        prompt: prompt,
        width: width,
        height: height,
        scale: scale || 0.5,
        force_single: force_single,
    };
    
    // 如果有图片URL，添加到请求体中
    if (image_urls && image_urls.length > 0) {
        requestBody.image_urls = image_urls;
    }

    const body = JSON.stringify(requestBody);
    const query = {
        Action: 'CVSync2AsyncSubmitTask',
        Version: '2022-08-31'
    };

    console.log("[Volcengine] 提交任务，请求参数:", requestBody);

    // 生成签名头
    const headers = await signer.sign('POST', '/', query, {}, body);
    const queryString = Object.keys(query).map(key => `${key}=${query[key]}`).join('&');
    const url = `https://visual.volcengineapi.com/?${queryString}`;

    // 提交任务
    const response = await fetch(url, {
        method: "POST",
        headers: headers,
        body: body,
    });

    if (!response.ok) {
        const errorBody = await response.text();
        console.error('[Volcengine] API错误响应:', errorBody);
        throw new Error(`火山引擎API调用失败: ${response.status} - ${errorBody}`);
    }

    const data = await response.json();
    console.log('[Volcengine] 任务提交响应:', data);
    
    // 检查任务ID
    if (data.data?.task_id) {
        const taskId = data.data.task_id;
        console.log(`[Volcengine] 任务已提交，任务ID: ${taskId}`);
        
        // 轮询任务状态
        const pollingQuery = {
            Action: 'CVSync2AsyncGetResult',
            Version: '2022-08-31'
        };
        
        const pollingBody = {
            req_key: 'jimeng_t2i_v40',
            task_id: taskId,
            req_json: JSON.stringify({
                return_url: true
            })
        };
        
        const pollingIntervalSeconds = 5;
        const maxRetries = 24; // 2分钟超时

        for (let i = 0; i < maxRetries; i++) {
            await new Promise(resolve => setTimeout(resolve, pollingIntervalSeconds * 1000));
            console.log(`[Volcengine] 轮询任务状态... 第${i + 1}/${maxRetries}次`);
            
            const pollingBodyStr = JSON.stringify(pollingBody);
            const pollingHeaders = await signer.sign('POST', '/', pollingQuery, {}, pollingBodyStr);
            const pollingQueryString = Object.keys(pollingQuery).map(key => `${key}=${pollingQuery[key]}`).join('&');
            const pollingUrl = `https://visual.volcengineapi.com/?${pollingQueryString}`;
            
            const statusResponse = await fetch(pollingUrl, { 
                method: 'POST',
                headers: {
                    ...pollingHeaders,
                    'Content-Type': 'application/json'
                },
                body: pollingBodyStr
            });

            if (!statusResponse.ok) {
                console.error(`[Volcengine] 获取任务状态失败: ${statusResponse.status}`);
                continue;
            }

            const statusData = await statusResponse.json();
            console.log('[Volcengine] 任务状态:', statusData);
            
            if (statusData.data?.status === "done") {
                console.log("[Volcengine] 任务完成成功");
                const imageUrl = statusData.data?.image_urls?.[0];
                if (imageUrl) {
                    return {
                        imageUrl: imageUrl,
                        success: true,
                        message: '图片生成成功'
                    };
                } else {
                    throw new Error("任务完成但未返回图片URL");
                }
            } else if (statusData.data?.status === "failed") {
                console.error("[Volcengine] 任务执行失败:", statusData);
                throw new Error(`任务执行失败: ${statusData.data?.error_message || '未知错误'}`);
            }
            // 如果状态是running或pending，继续轮询
        }
        throw new Error(`任务超时，${pollingIntervalSeconds * maxRetries}秒内未完成`);
    }

    throw new Error("API响应格式不正确，未返回任务ID");
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