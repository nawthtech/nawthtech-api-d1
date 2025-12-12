// worker/src/lib/llm-verifier/cli.ts
import { LLMVerifier } from './LLMVerifier';
import { VerificationResult } from './types';

export async function runCLI(args: string[]): Promise<void> {
  const command = args[0];
  
  switch (command) {
    case 'verify':
      await verifyCommand(args.slice(1));
      break;
    
    case 'batch':
      await batchCommand(args.slice(1));
      break;
    
    case 'test':
      await testCommand(args.slice(1));
      break;
    
    case 'help':
    case '--help':
    case '-h':
      printHelp();
      break;
    
    default:
      console.error(`Unknown command: ${command}`);
      printHelp();
      process.exit(1);
  }
}

/**
 * Verify single content
 */
async function verifyCommand(args: string[]): Promise<void> {
  const options = parseOptions(args);
  
  if (!options.input && !options.file) {
    console.error('Error: Input text or file is required');
    console.log('Usage: verify --input "text" [options]');
    process.exit(1);
  }
  
  try {
    // Read input
    let input