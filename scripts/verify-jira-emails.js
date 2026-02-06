#!/usr/bin/env node
/**
 * Verify JIRA email addresses in the team roster
 * 
 * Usage: JIRA_TOKEN=xxx node scripts/verify-jira-emails.js
 */

import https from 'https';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const JIRA_TOKEN = process.env.JIRA_TOKEN;
const MEMBERS_FILE = path.join(__dirname, '../data/members.json');

if (!JIRA_TOKEN) {
  console.error('❌ JIRA_TOKEN environment variable is required');
  console.error('   Usage: JIRA_TOKEN=xxx node scripts/verify-jira-emails.js');
  process.exit(1);
}

// Load members
const members = JSON.parse(fs.readFileSync(MEMBERS_FILE, 'utf8'));

// Sleep helper to avoid rate limiting
const sleep = (ms) => new Promise(resolve => setTimeout(resolve, ms));

// Function to check if a JIRA user exists using the user picker endpoint
function checkJiraUser(email) {
  return new Promise((resolve) => {
    // Use user picker which is more reliable for email lookups
    const options = {
      hostname: 'issues.redhat.com',
      path: `/rest/api/2/user/picker?query=${encodeURIComponent(email)}&maxResults=10`,
      method: 'GET',
      headers: {
        'Authorization': `Bearer ${JIRA_TOKEN}`,
        'Accept': 'application/json',
        'Content-Type': 'application/json',
        'User-Agent': 'OCMUI-Team-Dashboard'
      }
    };

    const req = https.request(options, (res) => {
      let data = '';
      res.on('data', chunk => { data += chunk; });
      res.on('end', () => {
        try {
          const result = JSON.parse(data);
          const users = result.users || [];
          
          if (users.length > 0) {
            // Look for exact email match first
            const exactMatch = users.find(u => 
              u.name?.toLowerCase() === email.toLowerCase() ||
              u.key?.toLowerCase() === email.toLowerCase()
            );
            
            if (exactMatch) {
              resolve({ 
                valid: true, 
                displayName: exactMatch.displayName,
                key: exactMatch.key
              });
            } else {
              // Check if first result is a close match
              const first = users[0];
              resolve({ 
                valid: false, 
                suggestion: first.name || first.key,
                displayName: first.displayName,
                allMatches: users.map(u => u.name || u.key).slice(0, 3)
              });
            }
          } else {
            resolve({ valid: false });
          }
        } catch (e) {
          resolve({ valid: false, error: e.message });
        }
      });
    });

    req.on('error', (e) => {
      resolve({ valid: false, error: e.message });
    });

    req.end();
  });
}

// Main
async function main() {
  console.log('🔍 Verifying JIRA emails in data/members.json...\n');
  console.log('   (Adding 500ms delay between requests to avoid rate limiting)\n');
  
  const results = [];
  
  for (const member of members) {
    if (!member.jira) {
      results.push({ name: member.name, status: '⚪', message: 'No JIRA email set' });
      console.log(`   ${member.name}: ⚪ No JIRA email set`);
      continue;
    }
    
    process.stdout.write(`   ${member.name} (${member.jira})... `);
    const result = await checkJiraUser(member.jira);
    
    if (result.valid) {
      console.log(`✅ ${result.displayName}`);
      results.push({ name: member.name, email: member.jira, status: '✅', message: `Valid: ${result.displayName}` });
    } else if (result.suggestion) {
      console.log(`⚠️  Partial match - suggestions: ${result.allMatches?.join(', ')}`);
      results.push({ 
        name: member.name, 
        email: member.jira,
        status: '⚠️', 
        message: `Suggestions: ${result.allMatches?.join(', ')}`,
        currentEmail: member.jira,
        suggestions: result.allMatches
      });
    } else if (result.error) {
      console.log(`❓ Error: ${result.error}`);
      results.push({ name: member.name, email: member.jira, status: '❓', message: result.error });
    } else {
      console.log(`❌ Not found`);
      results.push({ name: member.name, email: member.jira, status: '❌', message: 'User not found in JIRA' });
    }
    
    // Add delay to avoid rate limiting
    await sleep(500);
  }
  
  // Summary
  console.log('\n' + '━'.repeat(60));
  console.log('📊 Summary:\n');
  
  const valid = results.filter(r => r.status === '✅').length;
  const warnings = results.filter(r => r.status === '⚠️').length;
  const invalid = results.filter(r => r.status === '❌').length;
  const errors = results.filter(r => r.status === '❓').length;
  const noEmail = results.filter(r => r.status === '⚪').length;
  
  console.log(`   ✅ Valid:    ${valid}`);
  console.log(`   ⚠️  Partial:  ${warnings}`);
  console.log(`   ❌ Invalid:  ${invalid}`);
  console.log(`   ❓ Errors:   ${errors}`);
  console.log(`   ⚪ No email: ${noEmail}`);
  
  // Show issues
  const issues = results.filter(r => r.status !== '✅' && r.status !== '⚪');
  if (issues.length > 0) {
    console.log('\n📝 Issues to resolve:\n');
    issues.forEach(s => {
      console.log(`   ${s.name}: ${s.email}`);
      console.log(`     → ${s.message}`);
    });
  }
  
  console.log('');
}

main().catch(console.error);
