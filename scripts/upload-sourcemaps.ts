#!/usr/bin/env node
import { execSync } from 'child_process';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const projectRoot = path.join(__dirname, '..');
const distPath = path.join(projectRoot, 'dist');

// Sentry configuration
const SENTRY_ORG = 'nawthtech';
const SENTRY_PROJECT = 'nawthtech-worker';
const SENTRY_AUTH_TOKEN = process.env.SENTRY_AUTH_TOKEN;

if (!SENTRY_AUTH_TOKEN) {
  console.error('❌ SENTRY_AUTH_TOKEN is not set');
  process.exit(1);
}

async function uploadSourceMaps() {
  console.log('🚀 Uploading source maps to Sentry...');
  
  const version = process.env.GIT_COMMIT_SHA || 
    execSync('git rev-parse --short HEAD').toString().trim();
  
  try {
    // Create a new release
    execSync(`sentry-cli releases new ${version}`, {
      cwd: projectRoot,
      stdio: 'inherit',
    });
    
    // Associate commits with the release
    execSync(`sentry-cli releases set-commits ${version} --auto`, {
      cwd: projectRoot,
      stdio: 'inherit',
    });
    
    // Upload source maps
    if (fs.existsSync(distPath)) {
      execSync(
        `sentry-cli releases files ${version} upload-sourcemaps ${distPath} --url-prefix "~/dist/" --rewrite`,
        { cwd: projectRoot, stdio: 'inherit' }
      );
    }
    
    // Finalize the release
    execSync(`sentry-cli releases finalize ${version}`, {
      cwd: projectRoot,
      stdio: 'inherit',
    });
    
    console.log(`✅ Source maps uploaded for release: ${version}`);
  } catch (error) {
    console.error('❌ Failed to upload source maps:', error.message);
    process.exit(1);
  }
}

// Run the upload
uploadSourceMaps();