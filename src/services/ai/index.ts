/**
 * AI service aggregator
 */

import type { Env } from '../../types/database';
import { callGemini } from './gemini';
import { callOpenAI } from './openai';

export interface AIRequest {
  prompt: string;
  provider: 'gemini' | 'openai' | 'huggingface';
  model?: string;
  max_tokens?: number;
  temperature?: number;
}

export interface AIResponse {
  text: string;
  tokens: number;
  provider: string;
  model: string;
}

export async function callAI(
  request: AIRequest,
  env: Env
): Promise<AIResponse> {
  try {
    let response: { text: string; tokens: number };
    let model = request.model;
    
    switch (request.provider) {
      case 'gemini':
        if (!model) model = 'gemini-2.0-flash';
        response = await callGemini({
          prompt: request.prompt,
          model,
          max_tokens: request.max_tokens,
          temperature: request.temperature,
        }, env);
        break;
      
      case 'openai':
        if (!model) model = 'gpt-3.5-turbo';
        response = await callOpenAI({
          prompt: request.prompt,
          model,
          max_tokens: request.max_tokens,
          temperature: request.temperature,
        }, env);
        break;
      
      case 'huggingface':
        throw new Error('HuggingFace not implemented yet');
      
      default:
        throw new Error(`Unsupported provider: ${request.provider}`);
    }
    
    return {
      ...response,
      provider: request.provider,
      model: model!,
    };
  } catch (error) {
    console.error(`AI call failed for ${request.provider}:`, error);
    
    // Fallback to another provider if available
    if (request.provider === 'gemini' && env.OPENAI_API_KEY) {
      console.log('Falling back to OpenAI...');
      return callAI({
        ...request,
        provider: 'openai',
      }, env);
    }
    
    throw error;
  }
}

export function estimateTokens(text: string): number {
  // Rough estimation: 1 token ≈ 4 characters for English
  return Math.ceil(text.length / 4);
}

export function calculateCost(
  provider: string,
  inputTokens: number,
  outputTokens: number
): number {
  // Free tier pricing (approximate)
  const pricing: Record<string, { input: number; output: number }> = {
    gemini: { input: 0, output: 0 }, // Free tier
    openai: { input: 0.0015 / 1000, output: 0.002 / 1000 }, // gpt-3.5-turbo
  };
  
  const rates = pricing[provider] || { input: 0, output: 0 };
  return (inputTokens * rates.input) + (outputTokens * rates.output);
}