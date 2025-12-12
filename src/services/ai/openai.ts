/**
 * OpenAI service
 */

import type { Env } from '../../types/database';

interface OpenAIRequest {
  prompt: string;
  model?: string;
  max_tokens?: number;
  temperature?: number;
}

interface OpenAIResponse {
  text: string;
  tokens: number;
}

export async function callOpenAI(
  request: OpenAIRequest,
  env: Env
): Promise<OpenAIResponse> {
  if (!env.OPENAI_API_KEY) {
    throw new Error('OpenAI API key not configured');
  }
  
  const model = request.model || 'gpt-3.5-turbo';
  const url = 'https://api.openai.com/v1/chat/completions';
  
  const response = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${env.OPENAI_API_KEY}`,
    },
    body: JSON.stringify({
      model,
      messages: [
        {
          role: 'user',
          content: request.prompt,
        },
      ],
      max_tokens: request.max_tokens || 1000,
      temperature: request.temperature || 0.7,
      top_p: 0.9,
      frequency_penalty: 0,
      presence_penalty: 0,
    }),
  });
  
  if (!response.ok) {
    const error = await response.text();
    throw new Error(`OpenAI API error: ${response.status} ${error}`);
  }
  
  const data = await response.json();
  
  if (!data.choices?.[0]?.message?.content) {
    throw new Error('No response from OpenAI');
  }
  
  return {
    text: data.choices[0].message.content,
    tokens: data.usage?.total_tokens || Math.ceil(request.prompt.length / 4) + 100,
  };
}