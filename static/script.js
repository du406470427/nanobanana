// --- START OF FILE script.js ---

document.addEventListener('DOMContentLoaded', async () => {
    const uploadArea = document.querySelector('.upload-area');
    const fileInput = document.getElementById('image-upload');
    const thumbnailsContainer = document.getElementById('thumbnails-container');
    const promptInput = document.getElementById('prompt-input');
    const apiKeyInput = document.getElementById('api-key-input');
    const generateBtn = document.getElementById('generate-btn');
    const btnText = generateBtn.querySelector('.btn-text');
    const spinner = generateBtn.querySelector('.spinner');
    const resultContainer = document.getElementById('result-image-container');
    const apiKeySection = document.querySelector('.api-key-section');

    let selectedFiles = [];

    try {
        const response = await fetch('/api/key-status');
        if (response.ok) {
            const data = await response.json();
            if (data.isSet) {
                apiKeySection.style.display = 'none';
            }
        }
    } catch (error) {
        console.error("无法检查 API key 状态:", error);
    }

    // ... (拖放和文件处理等未修改的代码)
    ['dragenter', 'dragover', 'dragleave', 'drop'].forEach(eventName => {
        uploadArea.addEventListener(eventName, preventDefaults, false);
    });
    function preventDefaults(e) { e.preventDefault(); e.stopPropagation(); }
    ['dragenter', 'dragover'].forEach(eventName => {
        uploadArea.addEventListener(eventName, () => uploadArea.classList.add('drag-over'));
    });
    ['dragleave', 'drop'].forEach(eventName => {
        uploadArea.addEventListener(eventName, () => uploadArea.classList.remove('drag-over'));
    });
    uploadArea.addEventListener('drop', (e) => {
        const files = Array.from(e.dataTransfer.files).filter(file => file.type.startsWith('image/'));
        handleFiles(files);
    });
    fileInput.addEventListener('change', (e) => {
        const files = Array.from(e.target.files).filter(file => file.type.startsWith('image/'));
        handleFiles(files);
    });
    function handleFiles(files) {
        files.forEach(file => {
            if (!selectedFiles.some(f => f.name === file.name)) {
                selectedFiles.push(file);
                createThumbnail(file);
            }
        });
    }
    function createThumbnail(file) {
        const reader = new FileReader();
        reader.onload = (e) => {
            const wrapper = document.createElement('div');
            wrapper.className = 'thumbnail-wrapper';
            const img = document.createElement('img');
            img.src = e.target.result;
            img.alt = file.name;
            const removeBtn = document.createElement('button');
            removeBtn.className = 'remove-btn';
            removeBtn.innerHTML = '×';
            removeBtn.onclick = () => {
                selectedFiles = selectedFiles.filter(f => f.name !== file.name);
                wrapper.remove();
            };
            wrapper.appendChild(img);
            wrapper.appendChild(removeBtn);
            thumbnailsContainer.appendChild(wrapper);
        };
        reader.readAsDataURL(file);
    }

    // --- 核心修改区域：增加了重试逻辑 ---
    generateBtn.addEventListener('click', async () => {
        if (apiKeySection.style.display !== 'none' && !apiKeyInput.value.trim()) {
            alert('请输入 OpenRouter API 密钥');
            return;
        }
        if (selectedFiles.length === 0) {
            alert('请选择至少一张图片');
            return;
        }
        if (!promptInput.value.trim()) {
            alert('请输入提示词');
            return;
        }

        setLoading(true);
        
        const maxRetries = 3;
        let lastError = '未知错误';

        try {
            const base64Images = await Promise.all(selectedFiles.map(file => fileToBase64(file)));
            
            for (let attempt = 1; attempt <= maxRetries; attempt++) {
                try {
                    // 如果不是第一次尝试，显示重试信息
                    if (attempt > 1) {
                        updateResultStatus(`仅收到文本，正在重新请求... (第 ${attempt}/${maxRetries} 次)`);
                        // 等待1秒再重试
                        await new Promise(resolve => setTimeout(resolve, 1000));
                    } else {
                        updateResultStatus('正在请求模型...');
                    }

                    const response = await fetch('/generate', {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({
                            prompt: promptInput.value,
                            images: base64Images,
                            apikey: apiKeyInput.value
                        })
                    });

                    const data = await response.json();

                    // 硬错误，直接抛出并终止循环
                    if (data.error) {
                        throw new Error(data.error);
                    }

                    // 成功，显示图片并跳出循环
                    if (data.imageUrl) {
                        displayResult(data.imageUrl);
                        return; // 成功后直接退出函数
                    }
                    
                    // 软错误（可重试），记录信息，循环将继续
                    if (data.retry) {
                        console.warn(`Attempt ${attempt} failed: ${data.message}`);
                        lastError = `模型连续返回文本，最后一次信息: "${data.message}"`;
                        continue; // 继续下一次循环
                    }

                    // 未知响应格式
                    throw new Error('收到了未知的服务器响应');

                } catch (error) {
                    // 捕获 fetch 错误或硬错误
                    console.error(`Attempt ${attempt} failed with error:`, error);
                    lastError = error.message;
                    // 如果是网络或严重错误，可能不需要继续重试
                    if (attempt >= maxRetries) {
                        throw new Error(lastError);
                    }
                }
            }

            // 如果循环结束还没有成功返回，则说明所有重试都失败了
            throw new Error(`尝试 ${maxRetries} 次后仍无法生成图片。`);

        } catch (error) {
            // 最终的错误处理
            updateResultStatus(`生成失败: ${error.message}`);
        } finally {
            // 无论成功失败，最终都解除加载状态
            setLoading(false);
        }
    });
    // --- 核心修改区域结束 ---

    function setLoading(isLoading) {
        generateBtn.disabled = isLoading;
        btnText.textContent = isLoading ? '正在生成...' : '生成';
        spinner.classList.toggle('hidden', !isLoading);
    }

    function fileToBase64(file) {
        return new Promise((resolve, reject) => {
            const reader = new FileReader();
            reader.onload = () => resolve(reader.result);
            reader.onerror = reject;
            reader.readAsDataURL(file);
        });
    }
    
    // 新增：用于在结果区域显示状态文本
    function updateResultStatus(text) {
        resultContainer.innerHTML = `<p>${text}</p>`;
    }

    function displayResult(imageUrl) {
        resultContainer.innerHTML = '';
        const img = document.createElement('img');
        img.src = imageUrl;
        img.alt = '生成的图片';
        resultContainer.appendChild(img);
    }
});

// --- END OF FILE script.js ---
