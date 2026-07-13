// Disable Vercel Deployment Protection via Vercel API
// This script checks the project settings and tries to patch the protection settings

async function run() {
  // Get the token from vercel.json / .vercel
  const fs = require('fs');
  const path = require('path');
  
  // Try to read vercel token from .vercel directory
  let token = null;
  const vercelDir = path.join(process.cwd(), '.vercel');
  
  // Try reading from environment
  if (process.env.VERCEL_TOKEN) {
    token = process.env.VERCEL_TOKEN;
    console.log('Token found in VERCEL_TOKEN env');
  }
  
  if (!token) {
    // Read from vercel global config
    const globalVercelConfig = path.join(process.env.APPDATA || process.env.HOME, '.local/share/vercel', 'auth.json');
    const globalVercelConfig2 = path.join(process.env.LOCALAPPDATA || '', 'vercel', 'auth.json');
    
    for (const p of [globalVercelConfig, globalVercelConfig2]) {
      if (fs.existsSync(p)) {
        try {
          const data = JSON.parse(fs.readFileSync(p, 'utf8'));
          token = data.token;
          console.log(`Token found in: ${p}`);
          break;
        } catch {}
      }
    }
  }

  if (!token) {
    // Look in project .vercel directory
    const projectJson = path.join(vercelDir, 'project.json');
    if (fs.existsSync(projectJson)) {
      console.log('Project.json:', fs.readFileSync(projectJson, 'utf8'));
    }
    
    // Try reading token from global npm config location
    const userProfile = process.env.USERPROFILE || process.env.HOME;
    const paths = [
      path.join(userProfile, '.local', 'share', 'com.vercel.cli', 'auth.json'),
      path.join(userProfile, 'AppData', 'Roaming', 'vercel', 'auth.json'),
      path.join(userProfile, 'AppData', 'Local', 'vercel', 'auth.json'),
    ];
    
    for (const p of paths) {
      if (fs.existsSync(p)) {
        console.log(`Found vercel auth at: ${p}`);
        try {
          const data = JSON.parse(fs.readFileSync(p, 'utf8'));
          console.log('Auth data keys:', Object.keys(data));
          token = data.token;
        } catch (e) {
          console.error(`Error reading ${p}:`, e.message);
        }
        break;
      }
    }
  }
  
  if (!token) {
    console.log('Could not find Vercel token automatically');
    console.log('Please provide it as VERCEL_TOKEN env var');
    return;
  }
  
  console.log('Token found, length:', token.length);
  
  // Get project info
  const teamSlug = 'oicecelles-projects';
  const projectName = 'wacrm';
  
  console.log('\n=== Fetching project info ===');
  const res = await fetch(`https://api.vercel.com/v9/projects/${projectName}?teamSlug=${teamSlug}`, {
    headers: {
      'Authorization': `Bearer ${token}`,
      'Content-Type': 'application/json',
    }
  });
  
  const data = await res.json();
  console.log(`Status: ${res.status}`);
  console.log('Project name:', data.name);
  console.log('Protection bypass (secret):', data.passwordProtection?.deploymentType || 'none');
  console.log('Vercel auth:', data.ssoProtection?.deploymentType || 'none');
  console.log('Deployment protection:', JSON.stringify(data.deploymentProtection, null, 2));
  console.log('Full protection settings:', JSON.stringify({
    passwordProtection: data.passwordProtection,
    ssoProtection: data.ssoProtection,
    protection: data.protection,
    vercelAuthentication: data.vercelAuthentication,
  }, null, 2));
}

run().catch(console.error);
