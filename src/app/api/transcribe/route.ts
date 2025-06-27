import {NextRequest, NextResponse} from 'next/server';
import {SERVER_PREFIX, TRANSCRIBE_API_URL} from "@/constants";

export async function POST(req: NextRequest): Promise<NextResponse> {
  try {
    await fetch(SERVER_PREFIX)
    // 获取form data
    const formData = await req.formData();
    
    // 直接转发form data到外部API，并添加查询参数
    const response = await fetch(TRANSCRIBE_API_URL, {
      method: 'POST',
      body: formData,
    });

    if (!response.ok) {
      console.error(`[转录API] 外部服务返回错误: ${response.status}`);
      return NextResponse.json({
        success: false,
        error: '转录服务暂时不可用'
      }, { status: response.status });
    }

    // 获取响应数据
    const data = await response.json() as { srt_content: string };
    console.log('[转录API] 转录完成');

    return NextResponse.json(data);
  } catch (error) {
    console.error('[转录API] 处理失败:', error);
    return NextResponse.json(
      {
        success: false,
        error: '处理请求时发生错误'
      },
      { status: 500 }
    );
  }
}
