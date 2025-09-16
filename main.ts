// --- START OF FILE main.ts ---

import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { serveDir } from "https://deno.land/std@0.224.0/http/file_server.ts";

// --- 辅助函数：创建 JSON 错误响应 ---
function createJsonErrorResponse(message: string, statusCode = 500) {
    return new Response(JSON.stringify({ error: message }), {
        status: statusCode,
        headers: { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*" },
    });
}

// --- 辅助函数：休眠/等待 ---
const sleep = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

// =======================================================
// 模块 1: OpenRouter API 调用逻辑 (用于 nano banana)
// =======================================================
async function callOpenRouter(messages: any[], apiKey: string): Promise<{ type: 'image' | 'text'; content: string }> {
    if (!apiKey) { throw new Error("callOpenRouter received an empty apiKey."); }
    const openrouterPayload = { model: "google/gemini-2.5-flash-image-preview", messages };
    console.log("Sending payload to OpenRouter:", JSON.stringify(openrouterPayload, null, 2));
    const apiResponse = await fetch("https://openrouter.ai/api/v1/chat/completions", {
        method: "POST", headers: { "Authorization": `Bearer ${apiKey}`, "Content-Type": "application/json" },
        body: JSON.stringify(openrouterPayload)
    });
    if (!apiResponse.ok) {
        const errorBody = await apiResponse.text();
        throw new Error(`OpenRouter API error: ${apiResponse.status} ${apiResponse.statusText} - ${errorBody}`);
    }
    const responseData = await apiResponse.json();
    console.log("OpenRouter Response:", JSON.stringify(responseData, null, 2));
    const message = responseData.choices?.[0]?.message;
    if (message?.images?.[0]?.image_url?.url) { return { type: 'image', content: message.images[0].image_url.url }; }
    if (typeof message?.content === 'string' && message.content.startsWith('data:image/')) { return { type: 'image', content: message.content }; }
    if (typeof message?.content === 'string' && message.content.trim() !== '') { return { type: 'text', content: message.content }; }
    return { type: 'text', content: "[模型没有返回有效内容]" };
}

// =======================================================
// 模块 2: ModelScope API 调用逻辑 (用于 Qwen-Image 等)
// =======================================================
// [修改] 函数接收一个 timeoutSeconds 参数
async function callModelScope(model: string, apikey: string, parameters: any, timeoutSeconds: number): Promise<{ imageUrl: string }> {
    const base_url = 'https://api-inference.modelscope.cn/';
    const common_headers = {
        "Authorization": `Bearer ${apikey}`,
        "Content-Type": "application/json",
    };
    console.log(`[ModelScope] Submitting task for model: ${model}`);
    const generationResponse = await fetch(`${base_url}v1/images/generations`, {
        method: "POST",
        headers: { ...common_headers, "X-ModelScope-Async-Mode": "true" },
        body: JSON.stringify({ model, ...parameters }),
    });
    if (!generationResponse.ok) {
        const errorBody = await generationResponse.text();
        throw new Error(`ModelScope API Error (Generation): ${generationResponse.status} - ${errorBody}`);
    }
    const { task_id } = await generationResponse.json();
    if (!task_id) { throw new Error("ModelScope API did not return a task_id."); }
    console.log(`[ModelScope] Task submitted. Task ID: ${task_id}`);
    
    // [修改] 动态计算最大轮询次数
    const pollingIntervalSeconds = 5;
    const maxRetries = Math.ceil(timeoutSeconds / pollingIntervalSeconds);
    console.log(`[ModelScope] Task timeout set to ${timeoutSeconds}s, polling a max of ${maxRetries} times.`);

    for (let i = 0; i < maxRetries; i++) {
        await sleep(pollingIntervalSeconds * 1000); // 使用变量
        console.log(`[ModelScope] Polling task status... Attempt ${i + 1}/${maxRetries}`);
        const statusResponse = await fetch(`${base_url}v1/tasks/${task_id}`, { headers: { ...common_headers, "X-ModelScope-Task-Type": "image_generation" } });
        if (!statusResponse.ok) {
            console.error(`[ModelScope] Failed to get task status. Status: ${statusResponse.status}`);
            continue;
        }
        const data = await statusResponse.json();
        if (data.task_status === "SUCCEED") {
            console.log("[ModelScope] Task Succeeded.");
            if (data.output?.images?.[0]?.url) {
                return { imageUrl: data.output.images[0].url };
            } else if (data.output_images?.[0]) {
                return { imageUrl: data.output_images[0] };
            } else {
                throw new Error("ModelScope task succeeded but returned no images.");
            }
        } else if (data.task_status === "FAILED") {
            console.error("[ModelScope] Task Failed.", data);
            throw new Error(`ModelScope task failed: ${data.message || 'Unknown error'}`);
        }
    }
    throw new Error(`ModelScope task timed out after ${timeoutSeconds} seconds.`);
}

// =======================================================
// 模块 3: Volcengine API 调用逻辑 (火山引擎) - 基于官方V4签名机制
// =======================================================

// 火山引擎V4签名算法实现
class VolcengineV4Signer {
    private accessKeyId: string;
    private secretAccessKey: string;
    private region: string;
    private service: string;

    constructor(accessKeyId: string, secretAccessKey: string, region = 'cn-north-1', service = 'cv') {
        this.accessKeyId = accessKeyId;
        this.secretAccessKey = secretAccessKey;
        this.region = region;
        this.service = service;
    }

    // SHA256哈希
    private async sha256(data: string): Promise<string> {
        const encoder = new TextEncoder();
        const dataBuffer = encoder.encode(data);
        const hashBuffer = await crypto.subtle.digest('SHA-256', dataBuffer);
        return Array.from(new Uint8Array(hashBuffer))
            .map(b => b.toString(16).padStart(2, '0'))
            .join('');
    }

    // HMAC-SHA256签名
    private async hmacSha256(key: Uint8Array, data: string): Promise<Uint8Array> {
        const encoder = new TextEncoder();
        const cryptoKey = await crypto.subtle.importKey(
            'raw', key, { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']
        );
        const signature = await crypto.subtle.sign('HMAC', cryptoKey, encoder.encode(data));
        return new Uint8Array(signature);
    }

    // URL编码
    private urlEncode(str: string): string {
        return encodeURIComponent(str)
            .replace(/[!'()*]/g, (c) => '%' + c.charCodeAt(0).toString(16).toUpperCase())
            .replace(/%20/g, '+');
    }

    // 生成签名
    async sign(method: string, path: string, query: Record<string, string>, headers: Record<string, string>, body: string): Promise<Record<string, string>> {
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
            `${key}:${signedHeaders[Object.keys(signedHeaders).find(k => k.toLowerCase() === key)!].trim()}`
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
        const encoder = new TextEncoder();
        let signingKey = await this.hmacSha256(encoder.encode(this.secretAccessKey), shortDate);
        signingKey = await this.hmacSha256(signingKey, this.region);
        signingKey = await this.hmacSha256(signingKey, this.service);
        signingKey = await this.hmacSha256(signingKey, 'request');
        
        const signature = await this.hmacSha256(signingKey, stringToSign);
        const signatureHex = Array.from(signature).map(b => b.toString(16).padStart(2, '0')).join('');

        // 4. 构建Authorization头
        const authorization = `${algorithm} Credential=${this.accessKeyId}/${credentialScope}, SignedHeaders=${signedHeadersStr}, Signature=${signatureHex}`;

        return {
            ...signedHeaders,
            'Authorization': authorization
        };
    }
}

// 火山引擎API调用函数 - 使用V4签名
async function callVolcengine(credentials: string, parameters: any, timeoutSeconds: number): Promise<{ imageUrl: string }> {
    // 解析credentials格式: "AccessKeyId:SecretAccessKey"
    const [accessKeyId, secretAccessKey] = credentials.split(':');
    if (!accessKeyId || !secretAccessKey) {
        throw new Error('火山引擎API密钥格式错误，应为: AccessKeyId:SecretAccessKey');
    }

    const signer = new VolcengineV4Signer(accessKeyId, secretAccessKey);
    const [width, height] = (parameters.size || "2048x2048").split('x').map(Number);

    // 构建请求体
    const requestBody = {
        req_key: "jimeng_t2i_v40",
        prompt: parameters.prompt,
        width: width,
        height: height,
        force_single: parameters.count === 1,
    };

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
    const generationResponse = await fetch(url, {
        method: "POST",
        headers: headers,
        body: body,
    });

    if (!generationResponse.ok) {
        const errorBody = await generationResponse.text();
        console.error('[Volcengine] API错误响应:', errorBody);
        throw new Error(`火山引擎API调用失败: ${generationResponse.status} - ${errorBody}`);
    }

    const data = await generationResponse.json();
    console.log('[Volcengine] 任务提交响应:', data);
    
    // 检查任务ID
    if (data.Result?.TaskId) {
        const taskId = data.Result.TaskId;
        console.log(`[Volcengine] 任务已提交，任务ID: ${taskId}`);
        
        // 轮询任务状态
        const pollingQuery = {
            Action: 'CVGetTaskResult',
            Version: '2022-08-31',
            TaskId: taskId
        };
        
        const pollingIntervalSeconds = 5;
        const maxRetries = Math.ceil(timeoutSeconds / pollingIntervalSeconds);

        for (let i = 0; i < maxRetries; i++) {
            await sleep(pollingIntervalSeconds * 1000);
            console.log(`[Volcengine] 轮询任务状态... 第${i + 1}/${maxRetries}次`);
            
            const pollingHeaders = await signer.sign('GET', '/', pollingQuery, {}, '');
            const pollingQueryString = Object.keys(pollingQuery).map(key => `${key}=${pollingQuery[key]}`).join('&');
            const pollingUrl = `https://visual.volcengineapi.com/?${pollingQueryString}`;
            
            const statusResponse = await fetch(pollingUrl, { 
                method: 'GET',
                headers: pollingHeaders 
            });

            if (!statusResponse.ok) {
                console.error(`[Volcengine] 获取任务状态失败: ${statusResponse.status}`);
                continue;
            }

            const statusData = await statusResponse.json();
            console.log('[Volcengine] 任务状态:', statusData);
            
            if (statusData.Result?.Status === "done") {
                console.log("[Volcengine] 任务完成成功");
                const imageUrl = statusData.Result?.Data?.image_urls?.[0];
                if (imageUrl) {
                    return { imageUrl };
                } else {
                    throw new Error("任务完成但未返回图片URL");
                }
            } else if (statusData.Result?.Status === "failed") {
                console.error("[Volcengine] 任务执行失败:", statusData);
                throw new Error(`任务执行失败: ${statusData.Result?.ErrorMessage || '未知错误'}`);
            }
            // 如果状态是running或pending，继续轮询
        }
        throw new Error(`任务超时，${timeoutSeconds}秒内未完成`);
    }

    throw new Error("API响应格式不正确，未返回任务ID");
}

// =======================================================
// 主服务逻辑
// =======================================================
serve(async (req) => {
    const pathname = new URL(req.url).pathname;
    
    if (req.method === 'OPTIONS') { 
        return new Response(null, { 
            status: 204, 
            headers: { 
                "Access-Control-Allow-Origin": "*", 
                "Access-Control-Allow-Methods": "POST, GET, OPTIONS", 
                "Access-Control-Allow-Headers": "Content-Type, Authorization" 
            } 
        }); 
    }

    if (pathname === "/api/key-status") {
        const isSet = !!Deno.env.get("OPENROUTER_API_KEY");
        return new Response(JSON.stringify({ isSet }), {
            headers: { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*" },
        });
    }

    if (pathname === "/api/modelscope-key-status") {
        const isSet = !!Deno.env.get("MODELSCOPE_API_KEY");
        return new Response(JSON.stringify({ isSet }), {
            headers: { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*" },
        });
    }

    if (pathname === "/api/volcengine-key-status") {
        const isSet = !!Deno.env.get("VOLCENGINE_API_KEY");
        return new Response(JSON.stringify({ isSet }), {
            headers: { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*" },
        });
    }

    if (pathname === "/generate") {
        try {
            // [修改] 从请求体中解构出 timeout
            const requestData = await req.json();
            const { model, apikey, prompt, images, parameters, timeout } = requestData;

            if (model === 'nanobanana') {
                const openrouterApiKey = apikey || Deno.env.get("OPENROUTER_API_KEY");
                if (!openrouterApiKey) { return createJsonErrorResponse("OpenRouter API key is not set.", 500); }
                if (!prompt) { return createJsonErrorResponse("Prompt is required.", 400); }
                const contentPayload: any[] = [{ type: "text", text: prompt }];
                if (images && Array.isArray(images) && images.length > 0) {
                    const imageParts = images.map(img => ({ type: "image_url", image_url: { url: img } }));
                    contentPayload.push(...imageParts);
                }
                const webUiMessages = [{ role: "user", content: contentPayload }];
                const result = await callOpenRouter(webUiMessages, openrouterApiKey);
                if (result.type === 'image') {
                    return new Response(JSON.stringify({ imageUrl: result.content }), { headers: { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*" } });
                } else {
                    return createJsonErrorResponse(`Model returned text instead of an image: "${result.content}"`, 400);
                }
            } else if (model === 'volcengine') {
                const volcengineApiKey = apikey || Deno.env.get("VOLCENGINE_API_KEY");
                if (!volcengineApiKey) { return createJsonErrorResponse("Volcengine API key is not set.", 401); }
                if (!parameters?.prompt) { return createJsonErrorResponse("Prompt is required for Volcengine models.", 400); }
                
                const timeoutSeconds = timeout || 180;
                const result = await callVolcengine(volcengineApiKey, parameters, timeoutSeconds);

                return new Response(JSON.stringify(result), {
                    headers: { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*" }
                });
            }
            else {
                const modelscopeApiKey = apikey || Deno.env.get("MODELSCOPE_API_KEY");
                if (!modelscopeApiKey) { return createJsonErrorResponse("ModelScope API key is not set.", 401); }
                if (!parameters?.prompt) { return createJsonErrorResponse("Positive prompt is required for ModelScope models.", 400); }
                
                // [修改] 将 timeout (或默认值) 传递给 callModelScope
                // Qwen 默认2分钟，其他默认3分钟
                const timeoutSeconds = timeout || (model.includes('Qwen') ? 120 : 180); 
                const result = await callModelScope(model, modelscopeApiKey, parameters, timeoutSeconds);

                return new Response(JSON.stringify(result), {
                    headers: { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*" }
                });
            }
        } catch (error) {
            console.error("Error handling /generate request:", error);
            return createJsonErrorResponse(error.message, 500);
        }
    }

    return serveDir(req, { fsRoot: "static", urlRoot: "", showDirListing: true, enableCors: true });
});
