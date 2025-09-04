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

    // --- 文件拖放和选择的逻辑 (未修改) ---
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

    // ############ START OF MODIFIED SECTION ############

    // --- 核心修改：生成按钮的点击事件 ---
    generateBtn.addEventListener('click', async () => {
        // [修改 1] 只验证 API Key 和提示词
        if (apiKeySection.style.display !== 'none' && !apiKeyInput.value.trim()) {
            alert('请输入 OpenRouter API 密钥');
            return;
        }
        // [关键修改] 移除了对 selectedFiles.length === 0 的检查
        if (!promptInput.value.trim()) {
            alert('请输入提示词');
            return;
        }

        setLoading(true);
        let lastError = '未知错误';

        try {
            // 准备请求数据，images 数组在没有选择文件时会是一个空数组 []
            const base64Images = await Promise.all(selectedFiles.map(file => fileToBase64(file)));
            const requestBody = {
                prompt: promptInput.value,
                images: base64Images,
                apikey: apiKeyInput.value
            };

            const maxRetries = 3;
            for (let attempt = 1; attempt <= maxRetries; attempt++) {
                try {
                    if (attempt > 1) {
                        updateResultStatus(`模型未返回图片，正在重试... (第 ${attempt}/${maxRetries} 次)`);
                        await new Promise(resolve => setTimeout(resolve, 1000));
                    } else {
                        updateResultStatus('正在请求模型...');
                    }

                    const response = await fetch('/generate', {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify(requestBody)
                    });
                    
                    if (!response.ok) {
                        const errorText = await response.text();
                        throw new Error(`服务器错误: ${response.status} - ${errorText}`);
                    }
                    const data = await response.json();

                    // 后端返回明确错误，直接抛出，终止重试
                    if (data.error) {
                        throw new Error(data.error);
                    }

                    // [成功条件] 只有返回 imageUrl 才算成功
                    if (data.imageUrl) {
                        displayResult(data.imageUrl);
                        return; // 成功后直接退出函数
                    }
                    
                    // [重试条件] 任何其他情况（包括收到文本）都视为需要重试
                    lastError = data.text ? `模型返回了文本: "${data.text}"` : '模型返回了未知格式的数据';
                    // continue 会自动进入下一次循环

                } catch (error) {
                    // 捕获 fetch 错误或上面抛出的硬错误
                    console.error(`尝试 ${attempt} 失败:`, error);
                    lastError = error.message;
                    // 如果错误严重，或者已经是最后一次尝试，则循环将在下次检查时终止
                }
            }

            // 如果循环结束还没有成功返回，则说明所有重试都失败了
            throw new Error(`尝试 ${maxRetries} 次后仍无法生成图片。最后错误: ${lastError}`);

        } catch (error) {
            // 最终的错误处理
            updateResultStatus(`生成失败: ${error.message}`);
        } finally {
            // 无论成功失败，最终都解除加载状态
            setLoading(false);
        }
    });
    
    // ############ END OF MODIFIED SECTION ############

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
    
    function updateResultStatus(text) {
        resultContainer.innerHTML = `<p class="status-text">${text}</p>`;
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
