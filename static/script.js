document.addEventListener('DOMContentLoaded', () => {
    const imageUpload = document.getElementById('image-upload');
    const thumbnail = document.getElementById('thumbnail');
    const promptInput = document.getElementById('prompt-input');
    const generateBtn = document.getElementById('generate-btn');
    const resultImageContainer = document.getElementById('result-image-container');

    const apiKeyInput = document.getElementById('api-key-input');

    let uploadedImageBase64 = '';

    imageUpload.addEventListener('change', (event) => {
        const file = event.target.files[0];
        if (file) {
            const reader = new FileReader();
            reader.onload = (e) => {
                thumbnail.src = e.target.result;
                thumbnail.classList.remove('hidden');
                uploadedImageBase64 = e.target.result;
            };
            reader.readAsDataURL(file);
        }
    });

    generateBtn.addEventListener('click', async () => {
        const prompt = promptInput.value;
        const apiKey = apiKeyInput.value;

        if (!prompt) {
            alert('请输入提示词！');
            return;
        }

        resultImageContainer.innerHTML = '<p>正在生成图片，请稍候...</p>';

        try {
            const response = await fetch('/generate', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({
                    prompt: prompt,
                    image: uploadedImageBase64, // The base64 string of the image
                    apikey: apiKey, // Add API Key to the request
                }),
            });

            if (!response.ok) {
                throw new Error(`HTTP error! status: ${response.status}`);
            }

            const data = await response.json();

            if (data.imageUrl) {
                resultImageContainer.innerHTML = `<img src="${data.imageUrl}" alt="生成的图片">`;
            } else {
                resultImageContainer.innerHTML = `<p>生成失败：${data.error || '未知错误'}</p>`;
            }

        } catch (error) {
            console.error('生成图片时出错:', error);
            resultImageContainer.innerHTML = `<p>生成图片时出错: ${error.message}</p>`;
        }
    });
});