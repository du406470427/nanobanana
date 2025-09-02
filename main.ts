import { serve } from "https://deno.land/std@0.200.0/http/server.ts";
import { serveDir } from "https://deno.land/std@0.200.0/http/file_server.ts";

serve(async (req) => {
    const pathname = new URL(req.url).pathname;

    if (pathname === "/generate") {
        try {
            // --- 修改 1: 从接收 "image" 改为接收 "images" 数组 ---
            // 确保 images 是一个数组，如果没传则默认为空数组
            const { prompt, images, apikey } = await req.json();
            const openrouterApiKey = apikey || Deno.env.get("OPENROUTER_API_KEY");

            if (!openrouterApiKey) {
                return new Response(JSON.stringify({ error: "OpenRouter API key is not set." }), { status: 500, headers: { "Content-Type": "application/json" } });
            }

            // --- 修改 2: 动态构建支持多图的 contentPayload ---
            const contentPayload: any[] = [{ type: "text", text: prompt }];

            // 如果 images 数组存在且不为空，则遍历并添加所有图片
            if (images && Array.isArray(images) && images.length > 0) {
                for (const imageUrl of images) {
                    contentPayload.push({
                        type: "image_url",
                        image_url: { url: imageUrl }
                    });
                }
                 // 如果有图片，可以考虑修改一下提示词，让模型知道有多张图片
                contentPayload[0].text = `根据我上传的这几张图片，${prompt}`;
            }

            const openrouterPayload = {
                model: "google/gemini-2.5-flash-image-preview:free",
                messages: [
                    { role: "user", content: contentPayload },
                ],
                modalities: ["image"]
            };

            // --- 修改 3: 添加日志，用于调试发送的参数 ---
            console.log("Sending payload to OpenRouter:", JSON.stringify(openrouterPayload, null, 2));

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

            const message = responseData.choices?.[0]?.message;

            if (!message) {
                throw new Error("Invalid response structure from OpenRouter API: No 'message' object found.");
            }

            const messageContent = message.content || "";
            let imageUrl = '';

            if (messageContent.startsWith('data:image/')) {
                imageUrl = messageContent;
            } 
            else if (message.images && message.images.length > 0 && message.images[0].image_url?.url) {
                imageUrl = message.images[0].image_url.url;
            }

            if (!imageUrl) {
                console.error("无法从 OpenRouter 响应中提取有效的图片 URL。返回内容：", JSON.stringify(message, null, 2));
                throw new Error("Could not extract a valid image URL from the OpenRouter API response.");
            }

            console.log("最终解析的图片 URL:", imageUrl);

            return new Response(JSON.stringify({ imageUrl }), {
                headers: { "Content-Type": "application/json" },
            });

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
