import { API_BASE_URL, API_PATHS } from './constants'

interface ConvertResponse {
  success: boolean
  ass?: string
  convertedCount?: number
  fontSize?: number
  error?: string
}

export async function convertAssLatexViaApi(
  rawAss: string,
  options: { fontSize: number, signal?: AbortSignal },
) {
  const { fontSize, signal } = options
  const endpoint = `${API_BASE_URL}${API_PATHS.ASS_CONVERT}`
  if (!endpoint) {
    return { ass: rawAss, convertedCount: 0 }
  }

  try {
    const response = await fetch(endpoint, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        ass: rawAss,
        fontSize,
      }),
      signal,
    })

    if (!response.ok) {
      return { ass: rawAss, convertedCount: 0 }
    }

    const data = (await response.json()) as ConvertResponse
    if (!data.success || !data.ass) {
      return { ass: rawAss, convertedCount: 0 }
    }

    return {
      ass: data.ass,
      convertedCount: data.convertedCount ?? 0,
    }
  }
  catch (error) {
    if ((error as Error).name === 'AbortError') {
      throw error
    }
    return { ass: rawAss, convertedCount: 0 }
  }
}
