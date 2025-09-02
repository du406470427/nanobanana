import { serve } from "https://deno.land/std@0.200.0/http/server.ts";
import { serveDir } from "https://deno.land/std@0.200.0/http/file_server.ts";

serve(async (req) => {
    const pathname = new URL(req.url).pathname;

    if (pathname === "/generate") {
        try {
            const { prompt, image, apikey } = await req.json();
            const openrouterApiKey = apikey || Deno.env.get("OPENROUTER_API_KEY");

            if (!openrouterApiKey) {
                return new Response(JSON.stringify({ error: "OpenRouter API key is not set." }), { status: 500, headers: { "Content-Type": "application/json" } });
            }

            let contentPayload: any[] = [];

            if (image) {
                contentPayload.push({ type: "text", text: `根据我上传的图片，${prompt}` });
                contentPayload.push({ type: "image_url", image_url: { url: image } });
            } else {
                contentPayload.push({ type: "text", text: prompt });
            }

            const openrouterPayload = {
                model: "google/gemini-2.5-flash-image-preview:free",
                messages: [
                    { role: "user", content: contentPayload },
                ],
                modalities: ["image"]
            };

            const apiResponse = await fetch("https://openrouter.ai/api/v1/chat/completions", {
                method: "POST",
                headers: {
                    "Authorization": `Bearer ${openrouterApiKey}`,
                    "Content-Type": "application/json"
                },
                body: JSON.stringify(openrouterPayload)
            });

            if (!apiResponse.ok) {
                const errorBody = await apiResponse.text();
                console.error("OpenRouter API error:", errorBody);
                return new Response(JSON.stringify({ error: `OpenRouter API error: ${apiResponse.statusText}` }), { status: apiResponse.status, headers: { "Content-Type": "application/json" } });
            }

            const responseData = await apiResponse.json();
            console.log("OpenRouter Response:", JSON.stringify(responseData, null, 2));

            // --- 修改开始 ---
            // 核心改动：不再因为 message.content 不存在而直接报错，
            // 而是尝试从多个可能的字段中提取图片URL。

            const message = responseData.choices?.[0]?.message;

            if (!message) {
                // 如果连 message 对象都没有，说明响应结构确实有问题
                throw new Error("Invalid response structure from OpenRouter API: No 'message' object found.");
            }

            const messageContent = message.content || ""; // 安全地获取 content，如果不存在则为空字符串
            let imageUrl = '';

            // 1. 检查 message.content 是否为 Base64 编码的图片 URL
            if (messageContent.startsWith('data:image/')) {
                imageUrl = messageContent;
            } 
            // 2. 如果 content 不是图片，则检查 images 数组（作为备用方案）
            else if (message.images && message.images.length > 0 && message.images[0].image_url?.url) {
                imageUrl = message.images[0].image_url.url;
            }

            // 在所有可能性都检查完毕后，如果仍然没有找到 imageUrl，才抛出错误
            if (!imageUrl) {
                console.error("无法从 OpenRouter 响应中提取有效的图片 URL。返回内容：", JSON.stringify(message, null, 2));
                // 抛出一个更具体的错误
                throw new Error("Could not extract a valid image URL from the OpenRouter API response.");
            }

            console.log("最终解析的图片 URL:", imageUrl);

            return new Response(JSON.stringify({ imageUrl }), {
                headers: { "Content-Type": "application/json" },
            });
            // --- 修改结束 ---

        } catch (error) {
            console.error("Error handling /generate request:", error);
            return new Response(JSON.stringify({ error: error.message }), { status: 500, headers: { "Content-Type": "application/json" } });
        }
    }

    return serveDir(req, {
        fsRoot: "static",
        urlRoot: "",
        showDirListing: true,
        enableCors: true,
    });
});
