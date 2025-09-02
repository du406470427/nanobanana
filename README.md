
# Nanobanana - OpenRouter Gemini API 代理 & 图片生成 Web UI

本项目已经从一个简单的 Web 应用进化为一个功能强大的双用途服务。它既是一个 **兼容 Google Gemini API 的 OpenRouter 代理服务器**，又提供了一个直观的 **Web 用户界面**，让您可以轻松地与多模态模型进行交互。

## 核心功能

### 🚀 API 代理功能 (为开发者)

*   **Gemini API 兼容**: 提供了与 Google AI for JS SDK (`@google/generative-ai`) 完全兼容的 API 端点。您可以将现有的 Gemini 客户端代码无缝对接到本服务，从而通过 OpenRouter 使用其支持的任意模型。
*   **支持流式与非流式响应**: 完整实现了 `:streamGenerateContent` (流式) 和 `:generateContent` (非流式) 两个核心端点。
*   **智能历史提取**: 代理服务器会自动从 Gemini 的完整对话历史 (`contents`) 中提取最近的、相关的上下文发送给模型，优化了请求效率。
*   **统一认证**: 支持通过 `Authorization: Bearer <API_KEY>` 或 `x-goog-api-key` header 传递 OpenRouter API Key。

### ✨ Web UI 功能 (为最终用户)

*   **多图上传**: 支持上传一张或多张本地图片并显示缩略图。
*   **直观交互**: 输入文本提示词，结合上传的图片与 AI 进行对话或创作。
*   **API Key 输入**: 方便地在前端输入您的 OpenRouter API Key 进行认证。
*   **即时结果展示**: 在前端界面直接显示模型生成的文本或图片结果。

## 为何使用本项目？

*   **对于开发者**: 您可以利用丰富的 Gemini 客户端生态和 SDK，但将后端的模型请求路由到 OpenRouter。这使得切换不同供应商的模型变得异常简单，避免了厂商锁定。
*   **对于使用者**: 您获得了一个无需安装、部署在云端的免费 Web 界面，可以方便地测试和使用 `google/gemini-pro-vision` 等强大的多模态模型。

## API 端点说明

本服务暴露了以下主要 API 端点：

*   **`/v1beta/models/gemini-pro:streamGenerateContent`**
    *   **用途**: 流式生成内容，兼容 Gemini SDK。
    *   **请求体**: Google AI SDK 的标准请求格式。
    *   **响应**: Server-Sent Events (SSE) 数据流。

*   **`/v1beta/models/gemini-pro:generateContent`**
    *   **用途**: 非流式（一次性）生成内容，兼容 Gemini SDK。
    *   **请求体**: Google AI SDK 的标准请求格式。
    *   **响应**: JSON 对象。

*   **`/generate`**
    *   **用途**: 为本项目自带的 "Nanobanana" Web UI 提供后端服务。
    *   **请求体**: `{ "prompt": string, "images": string[], "apikey": string }`
    *   **响应**: `{ "imageUrl": string }` 或 `{ "error": string }`

## 技术栈

- **前端**: HTML, CSS, JavaScript (无框架)
- **后端**: Deno, Deno Standard Library
- **AI 模型**: 通过 OpenRouter 代理，默认为 `google/gemini-2.5-flash-image-preview:free`，但可由 API 请求指定其他模型。

## 如何部署到 Deno Deploy

1.  **Fork 本项目**: 将此项目 Fork 到您自己的 GitHub 仓库。

2.  **登录 Deno Deploy**: 使用您的 GitHub 账号登录 [Deno Deploy](https://dash.deno.com/account/overview)。

3.  **创建新项目**:
    *   点击 "New Project"。
    *   选择您 Fork 的 GitHub 仓库。
    *   选择 `main` 分支和 `main.ts` (或您的主文件名) 作为入口文件。

4.  **配置环境变量 (可选但推荐)**:
    *   在 Deno Deploy 项目的设置中，找到 "Environment Variables"。
    *   添加一个名为 `OPENROUTER_API_KEY` 的新变量，值为您的 OpenRouter API Key。
    *   这样做可以避免每次都在前端 UI 输入 API Key，也为 API 代理提供一个默认 Key。

5.  **部署**: 点击 "Link" 或 "Deploy" 按钮，Deno Deploy 将会自动部署您的应用。

6.  **访问**: 部署成功后，您将获得一个 `*.deno.dev` 的 URL，通过该 URL 即可访问您的 Web UI。

## 如何使用

### 方式一：使用 Web 界面

1.  打开您部署后的 `*.deno.dev` URL。
2.  (可选) 如果您没有在 Deno Deploy 中设置环境变量，请在 "输入你的 OpenRouter API Key..." 输入框中填入您的 Key。
3.  (可选) 点击 "选择图片" 上传一张或多张图片。
4.  在 "输入提示词..." 文本框中输入您的想法。
5.  点击 "生成" 按钮。
6.  等待片刻，生成的图片或文本将显示在下方。

### 方式二：作为 API 代理 (开发者)

将您现有的 Gemini 客户端代码中的 API 端点指向您部署的 Deno Deploy URL。

**示例 (使用 cURL)**:
假设您的 Deno Deploy URL 是 `https://my-gemini-proxy.deno.dev`。

```bash
curl -X POST https://my-gemini-proxy.deno.dev/v1beta/models/gemini-pro:generateContent \
-H "Content-Type: application/json" \
-H "Authorization: Bearer YOUR_OPENROUTER_API_KEY" \
-d '{
  "contents": [
    {
      "role": "user",
      "parts": [
        { "text": "这张图里有什么？" },
        {
          "inlineData": {
            "mimeType": "image/jpeg",
            "data": "BASE64_ENCODED_IMAGE_DATA"
          }
        }
      ]
    }
  ]
}'
```
