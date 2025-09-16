# 故障排除指南

## 火山引擎API调用问题

### 问题1: "API响应格式不正确，未返回任务ID"

**可能原因:**
1. API密钥格式错误
2. 签名算法实现问题
3. 请求参数不正确
4. 网络连接问题

**解决步骤:**

#### 1. 检查API密钥格式
确保API密钥格式为: `AccessKeyId:SecretAccessKey`
```
正确格式: AKIAIOSFODNN7EXAMPLE:wJalrXUtnFEMI/K7MDENG/bPxRfiCYEXAMPLEKEY
错误格式: Bearer AKIAIOSFODNN7EXAMPLE
```

#### 2. 验证API密钥权限
- 登录火山引擎控制台
- 确认AccessKey有视觉智能服务权限
- 确认账户余额充足

#### 3. 检查请求参数
确保传递的参数符合要求:
```javascript
{
  "prompt": "描述文本",     // 必需，不超过800字符
  "width": 1024,           // 必需，1024-4096
  "height": 1024,          // 必需，1024-4096
  "force_single": true     // 可选，布尔值
}
```

#### 4. 本地测试
使用提供的测试脚本:
```bash
node test_volcengine.js
```

#### 5. 查看详细日志
在Deno Deploy控制台查看函数日志:
1. 登录Deno Deploy
2. 进入项目页面
3. 点击"Function Logs"
4. 查看错误详情

### 问题2: 签名验证失败

**错误信息:** `SignatureDoesNotMatch` 或 `InvalidAccessKeyId`

**解决方案:**
1. 确认AccessKeyId和SecretAccessKey正确
2. 检查系统时间是否准确（签名对时间敏感）
3. 确认没有额外的空格或特殊字符

### 问题3: 任务超时

**错误信息:** `任务超时，180秒内未完成`

**解决方案:**
1. 增加timeout参数值
2. 简化prompt描述
3. 检查网络连接稳定性

## Deno Deploy特定问题

### 问题1: 环境变量未设置

在Deno Deploy项目设置中添加环境变量:
```
VOLCENGINE_API_KEY=your_access_key:your_secret_key
```

### 问题2: 函数冷启动超时

Deno Deploy函数可能需要时间启动，首次调用可能较慢。

### 问题3: 内存或执行时间限制

Deno Deploy有执行时间限制，确保:
- 优化轮询间隔
- 设置合理的超时时间
- 避免无限循环

## 调试技巧

### 1. 启用详细日志
在代码中添加更多console.log语句:
```javascript
console.log('[Debug] 请求体:', JSON.stringify(requestBody));
console.log('[Debug] 签名头:', headers);
console.log('[Debug] API响应:', data);
```

### 2. 使用Postman测试
创建POST请求到 `/generate` 端点:
```json
{
  "model": "volcengine",
  "apikey": "your_access_key:your_secret_key",
  "parameters": {
    "prompt": "测试图片",
    "width": 1024,
    "height": 1024,
    "force_single": true
  },
  "timeout": 180
}
```

### 3. 对比本地和部署版本
- 本地Node.js版本正常工作
- Deno Deploy版本出错
- 检查两个版本的代码差异

## 常见错误代码

| 错误代码 | 含义 | 解决方案 |
|---------|------|----------|
| 400 | 请求参数错误 | 检查prompt、width、height参数 |
| 401 | 认证失败 | 检查API密钥格式和权限 |
| 403 | 权限不足 | 确认账户权限和余额 |
| 429 | 请求频率过高 | 降低请求频率 |
| 500 | 服务器内部错误 | 查看详细错误信息 |

## 联系支持

如果问题仍未解决:
1. 收集错误日志
2. 记录重现步骤
3. 检查火山引擎官方文档
4. 联系火山引擎技术支持

## 有用的链接

- [火山引擎视觉智能API文档](https://www.volcengine.com/docs/6791/97889)
- [Deno Deploy文档](https://deno.com/deploy/docs)
- [项目GitHub仓库](https://github.com/your-username/your-repo)