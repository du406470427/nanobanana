# 部署指南

本文档说明如何将NanoBanana项目部署到Deno Deploy。

## 前置条件

1. **GitHub账户** - 用于托管代码
2. **Deno Deploy账户** - 访问 [dash.deno.com](https://dash.deno.com/) 注册
3. **火山引擎API密钥** - 用于即梦4.0模型

## 步骤1: 提交代码到GitHub

### 1.1 初始化Git仓库（如果还没有）

```bash
cd nanobanana
git init
git add .
git commit -m "Initial commit: NanoBanana AI image generation service"
```

### 1.2 创建GitHub仓库

1. 访问 [GitHub](https://github.com/)
2. 点击 "New repository"
3. 仓库名称: `nanobanana`
4. 设置为Public（Deno Deploy免费版需要公开仓库）
5. 不要初始化README（我们已有文件）

### 1.3 推送代码

```bash
# 添加远程仓库（替换为你的GitHub用户名）
git remote add origin https://github.com/YOUR_USERNAME/nanobanana.git

# 推送代码
git branch -M main
git push -u origin main
```

## 步骤2: 部署到Deno Deploy

### 2.1 连接GitHub

1. 访问 [Deno Deploy控制台](https://dash.deno.com/)
2. 点击 "New Project"
3. 选择 "Deploy from GitHub repository"
4. 授权Deno Deploy访问你的GitHub账户
5. 选择 `nanobanana` 仓库

### 2.2 配置部署设置

- **Entry Point**: `main.ts`
- **Branch**: `main`
- **Auto Deploy**: 启用（代码更新时自动部署）

### 2.3 完成部署

1. 点击 "Deploy"
2. 等待部署完成（通常1-2分钟）
3. 获得公网访问地址，格式如: `https://your-project-name.deno.dev`

## 步骤3: 验证部署

### 3.1 访问应用

打开Deno Deploy提供的URL，确认：
- 页面正常加载
- 界面显示正常
- 可以选择不同的AI模型

### 3.2 测试功能

1. **测试OpenRouter模型**:
   - 输入OpenRouter API密钥
   - 选择 "nano banana" 模型
   - 输入提示词测试

2. **测试ModelScope模型**:
   - 输入ModelScope API密钥
   - 选择Qwen-Image等模型
   - 输入提示词测试

3. **测试火山引擎模型**:
   - 输入火山引擎API密钥（格式: `AccessKeyId:SecretAccessKey`）
   - 选择 "volcengine" 模型
   - 输入提示词测试

## 步骤4: 后续维护

### 4.1 代码更新

```bash
# 修改代码后
git add .
git commit -m "Update: 描述你的更改"
git push origin main
```

由于启用了Auto Deploy，代码推送后会自动重新部署。

### 4.2 监控和日志

- 在Deno Deploy控制台可以查看:
  - 部署状态
  - 访问日志
  - 错误信息
  - 性能指标

## 故障排除

### 常见问题

1. **部署失败**
   - 检查 `main.ts` 语法是否正确
   - 确认所有依赖都是Deno兼容的
   - 查看部署日志中的错误信息

2. **API调用失败**
   - 确认API密钥格式正确
   - 检查网络连接
   - 查看浏览器控制台错误

3. **火山引擎签名错误**
   - 确认密钥格式为 `AccessKeyId:SecretAccessKey`
   - 检查AccessKey是否有相应权限
   - 确认服务地域设置正确

### 获取帮助

- [Deno Deploy文档](https://deno.com/deploy/docs)
- [火山引擎API文档](https://www.volcengine.com/docs/6444/1390583)
- 项目GitHub Issues页面

## 安全注意事项

1. **API密钥安全**
   - 不要在代码中硬编码API密钥
   - 使用前端输入方式，密钥仅在客户端临时存储
   - 定期轮换API密钥

2. **访问控制**
   - 考虑添加访问限制（如IP白名单）
   - 监控API使用量，防止滥用

3. **数据隐私**
   - 不记录用户输入的提示词
   - 不存储生成的图片
   - 遵守相关数据保护法规

---

部署完成后，你的NanoBanana服务就可以在全球范围内访问了！🎉