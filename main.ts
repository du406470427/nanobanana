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

            const message = responseData.choices?.[0]?.message;

            if (!message || !message.content) {
                throw new Error("Invalid response structure from OpenRouter API. No content.");
            }

            const messageContent = responseData.choices[0].message.content;
            console.log("OpenRouter message content:", messageContent);

            let imageUrl = '';

            // 检查 messageContent 是否为 Base64 编码的图片 URL
            if (messageContent && messageContent.startsWith('data:image/')) {
                imageUrl = messageContent;
            } else if (responseData.choices[0].message.images && responseData.choices[0].message.images.length > 0) {
                // 尝试从 images 数组中获取图片 URL
                imageUrl = responseData.choices[0].message.images[0].image_url.url;
            }

            if (!imageUrl) {
                console.error("无法从 OpenRouter 响应中提取有效的图片 URL。返回内容：", messageContent);
                return new Response("无法生成图片，请尝试其他提示词或稍后再试。", { status: 500 });
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
