import { execSync } from 'child_process';
import * as fs from 'fs';
import * as path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const projectRoot = path.join(__dirname, '..');
const distPath = path.join(projectRoot, 'dist');

interface BuildConfig {
  sentryOrg: string;
  sentryProject: string;
  environment: string;
  version: string;
}

async function buildWithSentry(config: Partial<BuildConfig> = {}): Promise<void> {
  const fullConfig: BuildConfig = {
    sentryOrg: config.sentryOrg || 'nawthtech',
    sentryProject: config.sentryProject || 'nawthtech-worker',
    environment: config.environment || process.env.NODE_ENV || 'production',
    version: config.version || getVersion(),
  };

  console.log(`🚀 Building Nawthtech Worker with Sentry (${fullConfig.environment})...`);
  
  try {
    // Step 1: TypeScript compilation with source maps
    console.log('📦 Compiling TypeScript...');
    execSync('npx tsc --project tsconfig.sentry.json', {
      cwd: projectRoot,
      stdio: 'inherit',
    });
    
    // Step 2: Wrangler build
    console.log('🔨 Running Wrangler build...');
    execSync('npx wrangler deploy --dry-run', {
      cwd: projectRoot,
      stdio: 'inherit',
    });
    
    // Step 3: Upload source maps to Sentry
    if (process.env.SENTRY_AUTH_TOKEN) {
      console.log('📤 Uploading source maps to Sentry...');
      await uploadSourceMaps(fullConfig);
    } else {
      console.log('⚠️  SENTRY_AUTH_TOKEN not set, skipping source maps upload');
    }
    
    console.log(`✅ Build completed for version: ${fullConfig.version}`);
    
  } catch (error) {
    console.error('❌ Build failed:', error);
    process.exit(1);
  }
}

async function uploadSourceMaps(config: BuildConfig): Promise<void> {
  const sentryCli = require.resolve('@sentry/cli/bin/sentry-cli');
  
  // Create release
  execSync(
    `${sentryCli} releases new ${config.version}`,
    { cwd: projectRoot, stdio: 'inherit' }
  );
  
  // Set commits
  execSync(
    `${sentryCli} releases set-commits ${config.version} --auto`,
    { cwd: projectRoot, stdio: 'inherit' }
  );
  
  // Upload source maps
  if (fs.existsSync(distPath)) {
    execSync(
      `${sentryCli} releases files ${config.version} upload-sourcemaps ${distPath} \
        --url-prefix "~/dist/" \
        --rewrite \
        --org ${config.sentryOrg} \
        --project ${config.sentryProject}`,
      { cwd: projectRoot, stdio: 'inherit' }
    );
  }
  
  // Finalize release
  execSync(
    `${sentryCli} releases finalize ${config.version}`,
    { cwd: projectRoot, stdio: 'inherit' }
  );
  
  // Associate deployment
  execSync(
    `${sentryCli} releases deploys ${config.version} new -e ${config.environment}`,
    { cwd: projectRoot, stdio: 'inherit' }
  );
}

function getVersion(): string {
  try {
    const commitHash = execSync('git rev-parse --short HEAD').toString().trim();
    const packageJson = JSON.parse(
      fs.readFileSync(path.join(projectRoot, 'package.json'), 'utf-8')
    );
    return `${packageJson.version}+${commitHash}`;
  } catch {
    return `nawthtech-worker@${Date.now()}`;
  }
}

// Run build if script is executed directly
if (import.meta.url === `file://${process.argv[1]}`) {
  const env = process.env.NODE_ENV || 'production';
  const version = process.env.VERSION || getVersion();
  
  buildWithSentry({
    environment: env,
    version: version,
  });
}

export { buildWithSentry };