/**
 * Gemini AI service
 */

import type { Env } from '../../types/database';

interface GeminiRequest {
  prompt: string;
  model?: string;
  max_tokens?: number;
  temperature?: number;
}

interface GeminiResponse {
  text: string;
  tokens: number;
}

export async function callGemini(
  request: GeminiRequest,
  env: Env
): Promise<GeminiResponse> {
  if (!env.GEMINI_API_KEY) {
    throw new Error('Gemini API key not configured');
  }
  
  const model = request.model || 'gemini-2.0-flash';
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${env.GEMINI_API_KEY}`;
  
  const response = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      contents: [
        {
          parts: [
            {
              text: request.prompt,
            },
          ],
        },
      ],
      generationConfig: {
        temperature: request.temperature || 0.7,
        maxOutputTokens: request.max_tokens || 1000,
        topP: 0.8,
        topK: 40,
      },
      safetySettings: [
        {
          category: 'HARM_CATEGORY_HARASSMENT',
          threshold: 'BLOCK_MEDIUM_AND_ABOVE',
        },
        {
          category: 'HARM_CATEGORY_HATE_SPEECH',
          threshold: 'BLOCK_MEDIUM_AND_ABOVE',
        },
        {
          category: 'HARM_CATEGORY_SEXUALLY_EXPLICIT',
          threshold: 'BLOCK_MEDIUM_AND_ABOVE',
        },
        {
          category: 'HARM_CATEGORY_DANGEROUS_CONTENT',
          threshold: 'BLOCK_MEDIUM_AND_ABOVE',
        },
      ],
    }),
  });
  
  if (!response.ok) {
    const error = await response.text();
    throw new Error(`Gemini API error: ${response.status} ${error}`);
  }
  
  const data = await response.json();
  
  if (!data.candidates?.[0]?.content?.parts?.[0]?.text) {
    throw new Error('No response from Gemini');
  }
  
  const text = data.candidates[0].content.parts[0].text;
  const tokens = data.usageMetadata?.totalTokenCount || 
    Math.ceil(text.length / 4); // Rough estimate
  
  return {
    text,
    tokens,
  };
}