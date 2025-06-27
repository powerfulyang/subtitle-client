const testApi = async () => {
  try {
    console.log('开始测试API...');
    
    const response = await fetch('http://localhost:3000/api/transcribe', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        audioData: 'test-audio-data',
        language: 'zh-CN'
      })
    });

    console.log('状态码:', response.status);
    console.log('响应头:', Object.fromEntries(response.headers));
    
    const text = await response.text();
    console.log('响应内容:', text);
    
    if (response.headers.get('content-type')?.includes('application/json')) {
      try {
        const result = JSON.parse(text);
        console.log('解析后的JSON:', JSON.stringify(result, null, 2));
      } catch (e) {
        console.error('JSON解析失败:', e.message);
      }
    }
  } catch (error) {
    console.error('网络请求失败:', error.message);
  }
};

testApi(); 