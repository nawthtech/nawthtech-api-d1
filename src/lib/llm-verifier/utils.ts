// worker/src/lib/llm-verifier/utils.ts
import { 
  VerificationCriteria, 
  VerificationResult, 
  LLMResponse,
  CategoryResult 
} from './types';

/**
 * Build verification prompt
 */
export function buildVerificationPrompt(
  input: string, 
  criteria: VerificationCriteria, 
  context?: string
): string {
  let prompt = `Please verify the following content and provide a structured JSON response.\n\n`;
  
  if (context) {
    prompt += `Context: ${context}\n\n`;
  }
  
  prompt += `Content to verify: "${input}"\n\n`;
  prompt += `Verification Criteria (check all that apply):\n`;
  
  if (criteria.toxicity) {
    prompt += `- Toxicity: Check for toxic, hateful, harmful, or abusive content\n`;
  }
  if (criteria.factuality) {
    prompt += `- Factuality: Verify factual accuracy, check for misinformation\n`;
  }
  if (criteria.coherence) {
    prompt += `- Coherence: Check logical flow, consistency, and clarity\n`;
  }
  if (criteria.relevance) {
    prompt += `- Relevance: Check if content is relevant to the intended topic\n`;
  }
  if (criteria.safety) {
    prompt += `- Safety: Check for dangerous, illegal, or policy-violating content\n`;
  }
  if (criteria.moderation) {
    prompt += `- Moderation: Check for inappropriate, explicit, or offensive content\n`;
  }
  if (criteria.bias) {
    prompt += `- Bias: Check for political, racial, gender, or other biases\n`;
  }
  
  prompt += `\nRespond with a JSON object in this exact format:\n`;
  prompt += `{
  "isValid": boolean,
  "confidence": number between 0 and 1,
  "reason": "brief explanation",
  "issues": ["specific issue 1", "specific issue 2"],
  "suggestions": ["suggestion 1", "suggestion 2"],
  "categories": {
    "toxicity": {"passed": boolean, "score": number, "explanation": "details"},
    "factuality": {"passed": boolean, "score": number, "explanation": "details"},
    "coherence": {"passed": boolean, "score": number, "explanation": "details"},
    "relevance": {"passed": boolean, "score": number, "explanation": "details"},
    "safety": {"passed": boolean, "score": number, "explanation": "details"},
    "moderation": {"passed": boolean, "score": number, "explanation": "details"},
    "bias": {"passed": boolean, "score": number, "explanation": "details"}
  }
}`;
  
  prompt += `\n\nImportant: Only include categories that were requested. Return "passed": false and score 0 for categories not checked.`;
  
  return prompt;
}

/**
 * Parse LLM response
 */
export function parseLLMResponse(
  response: LLMResponse, 
  originalInput: string
): VerificationResult {
  const responseText = response.output_text || 
                      response.choices?.[0]?.message?.content || 
                      '';
  
  try {
    // Try to extract JSON from response
    const jsonData = extractJSONFromText(responseText);
    
    if (jsonData) {
      return validateAndFormatResult(jsonData, originalInput);
    }
    
    // Fallback: parse unstructured response
    return parseUnstructuredResponse(responseText, originalInput);
    
  } catch (error) {
    console.error('Failed to parse LLM response:', error);
    return createErrorResult('Failed to parse verification response', originalInput);
  }
}

/**
 * Extract JSON from text
 */
export function extractJSONFromText(text: string): any {
  try {
    // Try direct parse first
    return JSON.parse(text);
  } catch {
    // Try to extract JSON object
    const jsonMatch = text.match(/\{[\s\S]*\}/);
    if (jsonMatch) {
      try {
        return JSON.parse(jsonMatch[0]);
      } catch {
        // Try to fix common JSON issues
        const fixedJson = jsonMatch[0]
          .replace(/(['"])?([a-zA-Z0-9_]+)(['"])?:/g, '"$2":') // Fix keys
          .replace(/,\s*}/g, '}') // Remove trailing commas
          .replace(/,\s*]/g, ']') // Remove trailing commas in arrays
          .replace(/\\'/g, "'") // Fix escaped quotes
          .replace(/\\"/g, '"'); // Fix escaped quotes
        
        try {
          return JSON.parse(fixedJson);
        } catch {
          return null;
        }
      }
    }
  }
  return null;
}

/**
 * Validate and format result
 */
function validateAndFormatResult(data: any, originalInput: string): VerificationResult {
  const defaultResult = createDefaultResult(originalInput);
  
  // Basic validation
  const result: VerificationResult = {
    isValid: Boolean(data.isValid) ?? defaultResult.isValid,
    confidence: calculateConfidence(data.confidence),
    reason: data.reason || defaultResult.reason,
    issues: Array.isArray(data.issues) ? data.issues : defaultResult.issues,
    suggestions: Array.isArray(data.suggestions) ? data.suggestions : defaultResult.suggestions,
    categories: validateCategories(data.categories || {}),
    metrics: defaultResult.metrics,
  };
  
  return result;
}

/**
 * Create default result
 */
function createDefaultResult(originalInput: string): VerificationResult {
  return {
    isValid: false,
    confidence: 0,
    reason: 'Verification inconclusive',
    issues: ['Unable to verify'],
    suggestions: ['Please try again'],
    categories: {},
    metrics: {
      latency: 0,
      inputTokens: 0,
      outputTokens: 0,
      totalTokens: 0,
      cost: 0,
      model: 'unknown',
      provider: 'unknown',
      timestamp: new Date().toISOString(),
    },
  };
}

/**
 * Validate categories
 */
function validateCategories(categories: any): Record<string, CategoryResult> {
  const validCategories: Record<string, CategoryResult> = {};
  const validCategoryNames = [
    'toxicity', 'factuality', 'coherence', 'relevance', 
    'safety', 'moderation', 'bias'
  ];
  
  for (const categoryName of validCategoryNames) {
    const categoryData = categories[categoryName];
    
    if (categoryData && typeof categoryData === 'object') {
      validCategories[categoryName] = {
        passed: Boolean(categoryData.passed ?? false),
        score: normalizeScore(categoryData.score ?? 0),
        explanation: String(categoryData.explanation || 'Not provided'),
        details: Array.isArray(categoryData.details) ? categoryData.details : undefined,
      };
    } else {
      validCategories[categoryName] = {
        passed: false,
        score: 0,
        explanation: 'Category not checked',
      };
    }
  }
  
  return validCategories;
}

/**
 * Parse unstructured response
 */
function parseUnstructuredResponse(text: string, originalInput: string): VerificationResult {
  const textLower = text.toLowerCase();
  
  // Determine validity
  const positiveIndicators = ['valid', 'passed', 'ok', 'good', 'safe', 'appropriate', 'acceptable'];
  const negativeIndicators = ['invalid', 'failed', 'bad', 'unsafe', 'inappropriate', 'reject'];
  
  const hasPositive = positiveIndicators.some(indicator => textLower.includes(indicator));
  const hasNegative = negativeIndicators.some(indicator => textLower.includes(indicator));
  
  const isValid = hasPositive && !hasNegative;
  const confidence = calculateConfidenceFromText(text);
  
  // Extract issues and suggestions
  const issues = extractListFromText(text, ['issues?', 'problems?', 'concerns?']);
  const suggestions = extractListFromText(text, ['suggestions?', 'recommendations?', 'improvements?']);
  
  return {
    isValid,
    confidence,
    reason: extractReason(text),
    issues: issues.length > 0 ? issues : ['No specific issues mentioned'],
    suggestions: suggestions.length > 0 ? suggestions : ['No suggestions provided'],
    categories: {},
    metrics: createDefaultResult(originalInput).metrics,
  };
}

/**
 * Calculate confidence from text
 */
function calculateConfidenceFromText(text: string): number {
  const confidenceMatch = text.match(/confidence.*?(\d+\.?\d*)/i);
  if (confidenceMatch) {
    return normalizeScore(parseFloat(confidenceMatch[1]));
  }
  
  // Estimate confidence based on language
  const confidentWords = ['definitely', 'certainly', 'clearly', 'obviously', 'undoubtedly'];
  const uncertainWords = ['maybe', 'perhaps', 'possibly', 'likely', 'probably'];
  
  const textLower = text.toLowerCase();
  const confidentCount = confidentWords.filter(word => textLower.includes(word)).length;
  const uncertainCount = uncertainWords.filter(word => textLower.includes(word)).length;
  
  if (confidentCount > uncertainCount) return 0.8;
  if (uncertainCount > confidentCount) return 0.4;
  return 0.6;
}

/**
 * Extract reason from text
 */
function extractReason(text: string): string {
  const reasonMatch = text.match(/reason[:\s]+([^.\n]+)/i);
  if (reasonMatch) {
    return reasonMatch[1].trim();
  }
  
  // Fallback: first sentence
  const firstSentence = text.split('.')[0];
  if (firstSentence && firstSentence.length > 10) {
    return firstSentence.trim();
  }
  
  return 'Automated analysis completed';
}

/**
 * Extract list from text using patterns
 */
function extractListFromText(text: string, patterns: string[]): string[] {
  const items: string[] = [];
  
  for (const pattern of patterns) {
    const regex = new RegExp(`${pattern}[:\s]+([^.\n]+)`, 'gi');
    const matches = text.matchAll(regex);
    
    for (const match of matches) {
      if (match[1]) {
        // Split by commas, semicolons, or bullets
        const parts = match[1].split(/[,;•\-]\s*/);
        items.push(...parts.map(p => p.trim()).filter(p => p.length > 0));
      }
    }
  }
  
  return [...new Set(items)]; // Remove duplicates
}

/**
 * Calculate confidence score
 */
export function calculateConfidence(score: any): number {
  if (typeof score === 'number') {
    return normalizeScore(score);
  }
  
  if (typeof score === 'string') {
    const num = parseFloat(score);
    if (!isNaN(num)) {
      return normalizeScore(num);
    }
  }
  
  return 0.5; // Default confidence
}

/**
 * Normalize score to 0-1 range
 */
export function normalizeScore(score: number): number {
  if (score <= 0) return 0;
  if (score >= 1) return 1;
  if (score > 100) return score / 100; // Handle percentage
  if (score > 10) return score / 10; // Handle 0-10 scale
  if (score > 5) return score / 5; // Handle 0-5 scale
  return score;
}

/**
 * Check if error is retryable
 */
export function isRetryableError(error: any): boolean {
  if (!error) return false;
  
  // Network errors
  const networkErrors = [
    'ECONNRESET', 'ETIMEDOUT', 'ECONNREFUSED', 
    'ENOTFOUND', 'EAI_AGAIN', 'NETWORK_ERROR'
  ];
  
  if (networkErrors.includes(error.code)) {
    return true;
  }
  
  // HTTP status codes
  if (error.status) {
    const retryableStatuses = [408, 429, 500, 502, 503, 504];
    return retryableStatuses.includes(error.status);
  }
  
  // Rate limiting
  if (error.message?.includes('rate limit') || 
      error.message?.includes('too many requests') ||
      error.message?.includes('quota exceeded')) {
    return true;
  }
  
  // Timeout
  if (error.message?.includes('timeout') || 
      error.message?.includes('timed out')) {
    return true;
  }
  
  return false;
}

/**
 * Create error result
 */
function createErrorResult(message: string, originalInput: string): VerificationResult {
  return {
    isValid: false,
    confidence: 0,
    reason: message,
    issues: ['Parsing error'],
    suggestions: ['Please try again with different input'],
    categories: {},
    metrics: createDefaultResult(originalInput).metrics,
    error: message,
  };
}

/**
 * Sleep helper
 */
export function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

/**
 * Log verification result
 */
export function logVerification(result: VerificationResult, logger: any): void {
  logger.info('Verification completed', {
    isValid: result.isValid,
    confidence: result.confidence,
    issuesCount: result.issues.length,
    latency: result.metrics.latency,
    tokens: result.metrics.totalTokens,
    cost: result.metrics.cost,
  });
  
  if (!result.isValid && result.issues.length > 0) {
    logger.warn('Content verification failed', {
      issues: result.issues,
      suggestions: result.suggestions,
    });
  }
}