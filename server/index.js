import express from 'express';
import path from 'path';
import https from 'https';
import fs from 'fs';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const app = express();
const PORT = process.env.PORT || 3017;

// ============================================================================
// BASIC AUTH PROTECTION (optional - enabled when DASHBOARD_PASSWORD is set)
// ============================================================================

const DASHBOARD_PASSWORD = process.env.DASHBOARD_PASSWORD;
const DASHBOARD_USERNAME = process.env.DASHBOARD_USERNAME || 'ocmui'; // Default username

if (DASHBOARD_PASSWORD) {
  console.log('🔐 Basic Auth protection ENABLED');
  
  // HTTP Basic Auth middleware
  app.use((req, res, next) => {
    // Allow health checks without auth
    if (req.path === '/health' || req.path === '/ready') {
      return next();
    }
    
    const authHeader = req.headers.authorization;
    
    if (!authHeader || !authHeader.startsWith('Basic ')) {
      res.setHeader('WWW-Authenticate', 'Basic realm="OCMUI Team Dashboard"');
      return res.status(401).send('Authentication required');
    }
    
    // Decode base64 credentials
    const base64Credentials = authHeader.split(' ')[1];
    const credentials = Buffer.from(base64Credentials, 'base64').toString('utf8');
    const [username, password] = credentials.split(':');
    
    if (username === DASHBOARD_USERNAME && password === DASHBOARD_PASSWORD) {
      return next();
    }
    
    res.setHeader('WWW-Authenticate', 'Basic realm="OCMUI Team Dashboard"');
    return res.status(401).send('Invalid credentials');
  });
} else {
  console.log('⚠️  Basic Auth protection DISABLED (no DASHBOARD_PASSWORD set)');
}

// Health check endpoints (no auth required)
app.get('/health', (req, res) => res.send('OK'));
app.get('/ready', (req, res) => res.send('OK'));

// ============================================================================
// TEAM ROSTER PERSISTENCE (Phase 4)
// ============================================================================

// Data directory for persistent storage (PVC mount in OpenShift, local dir otherwise)
const DATA_DIR = process.env.DATA_DIR || path.join(__dirname, '../data');
const MEMBERS_FILE = path.join(DATA_DIR, 'members.json');
const SEED_FILE = path.join(__dirname, '../public/timeboard/members.json');

// Ensure data directory exists
const ensureDataDir = () => {
  if (!fs.existsSync(DATA_DIR)) {
    fs.mkdirSync(DATA_DIR, { recursive: true });
    console.log(`📁 Created data directory: ${DATA_DIR}`);
  }
};

// Load members from persistent storage (or seed from public/timeboard/members.json)
const loadMembersFromDisk = () => {
  ensureDataDir();
  
  // If persistent file exists, use it
  if (fs.existsSync(MEMBERS_FILE)) {
    try {
      const data = fs.readFileSync(MEMBERS_FILE, 'utf8');
      const members = JSON.parse(data);
      console.log(`👥 Loaded ${members.length} team members from ${MEMBERS_FILE}`);
      return members;
    } catch (err) {
      console.error(`❌ Failed to load members from ${MEMBERS_FILE}:`, err.message);
    }
  }
  
  // Otherwise, seed from public/timeboard/members.json
  if (fs.existsSync(SEED_FILE)) {
    try {
      const data = fs.readFileSync(SEED_FILE, 'utf8');
      const members = JSON.parse(data);
      // Save to persistent storage
      saveMembersToDisk(members);
      console.log(`🌱 Seeded ${members.length} team members from ${SEED_FILE}`);
      return members;
    } catch (err) {
      console.error(`❌ Failed to seed members from ${SEED_FILE}:`, err.message);
    }
  }
  
  console.log('⚠️ No members data found, starting with empty roster');
  return [];
};

// Save members to persistent storage
const saveMembersToDisk = (members) => {
  ensureDataDir();
  try {
    fs.writeFileSync(MEMBERS_FILE, JSON.stringify(members, null, 2), 'utf8');
    console.log(`💾 Saved ${members.length} team members to ${MEMBERS_FILE}`);
    return true;
  } catch (err) {
    console.error(`❌ Failed to save members to ${MEMBERS_FILE}:`, err.message);
    return false;
  }
};

// In-memory cache of members (loaded on startup)
let membersCache = loadMembersFromDisk();

// Middleware
app.use(express.json());
// Serve React app static files
app.use(express.static(path.join(__dirname, '../dist')));

// CORS middleware for API routes
app.use('/api', (req, res, next) => {
    res.header('Access-Control-Allow-Origin', '*');
    res.header('Access-Control-Allow-Headers', 'Origin, X-Requested-With, Content-Type, Accept, Authorization');
    res.header('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
    if (req.method === 'OPTIONS') {
        res.sendStatus(200);
    } else {
        next();
    }
});

// ============================================================================
// TEAM ROSTER API ENDPOINTS
// ============================================================================

// GET /api/team/members - Get all team members
app.get('/api/team/members', (req, res) => {
  res.json({
    success: true,
    members: membersCache,
    source: fs.existsSync(MEMBERS_FILE) ? 'persistent' : 'memory'
  });
});

// POST /api/team/members - Add a new member
app.post('/api/team/members', (req, res) => {
  const { name, role, tz, github, jira } = req.body;
  
  if (!name || !role || !tz) {
    return res.status(400).json({ error: 'name, role, and tz are required' });
  }
  
  // Check for duplicate name
  if (membersCache.some(m => m.name === name)) {
    return res.status(409).json({ error: `Member "${name}" already exists` });
  }
  
  const newMember = {
    name: name.trim(),
    role: role.trim(),
    tz: tz.trim(),
    ...(github && { github: github.trim() }),
    ...(jira && { jira: jira.trim() })
  };
  
  membersCache.unshift(newMember); // Add to beginning
  
  if (saveMembersToDisk(membersCache)) {
    res.status(201).json({ success: true, member: newMember });
  } else {
    res.status(500).json({ error: 'Failed to persist member' });
  }
});

// PUT /api/team/members/:name - Update a member by name
app.put('/api/team/members/:name', (req, res) => {
  const memberName = decodeURIComponent(req.params.name);
  const { name, role, tz, github, jira } = req.body;
  
  const index = membersCache.findIndex(m => m.name === memberName);
  if (index === -1) {
    return res.status(404).json({ error: `Member "${memberName}" not found` });
  }
  
  // If renaming, check for duplicate
  if (name && name !== memberName && membersCache.some(m => m.name === name)) {
    return res.status(409).json({ error: `Member "${name}" already exists` });
  }
  
  const updatedMember = {
    name: (name || memberName).trim(),
    role: (role || membersCache[index].role).trim(),
    tz: (tz || membersCache[index].tz).trim(),
    ...(github !== undefined ? (github ? { github: github.trim() } : {}) : (membersCache[index].github ? { github: membersCache[index].github } : {})),
    ...(jira !== undefined ? (jira ? { jira: jira.trim() } : {}) : (membersCache[index].jira ? { jira: membersCache[index].jira } : {}))
  };
  
  membersCache[index] = updatedMember;
  
  if (saveMembersToDisk(membersCache)) {
    res.json({ success: true, member: updatedMember });
  } else {
    res.status(500).json({ error: 'Failed to persist member update' });
  }
});

// DELETE /api/team/members/:name - Delete a member by name
app.delete('/api/team/members/:name', (req, res) => {
  const memberName = decodeURIComponent(req.params.name);
  
  const index = membersCache.findIndex(m => m.name === memberName);
  if (index === -1) {
    return res.status(404).json({ error: `Member "${memberName}" not found` });
  }
  
  const deleted = membersCache.splice(index, 1)[0];
  
  if (saveMembersToDisk(membersCache)) {
    res.json({ success: true, deleted: deleted });
  } else {
    res.status(500).json({ error: 'Failed to persist member deletion' });
  }
});

// POST /api/team/members/reload - Reload from seed file (admin action)
app.post('/api/team/members/reload', (req, res) => {
  if (!fs.existsSync(SEED_FILE)) {
    return res.status(404).json({ error: 'Seed file not found' });
  }
  
  try {
    const data = fs.readFileSync(SEED_FILE, 'utf8');
    const members = JSON.parse(data);
    membersCache = members;
    
    if (saveMembersToDisk(membersCache)) {
      res.json({ success: true, members: membersCache, message: `Reloaded ${members.length} members from seed` });
    } else {
      res.status(500).json({ error: 'Failed to persist reloaded members' });
    }
  } catch (err) {
    res.status(500).json({ error: 'Failed to reload seed file', details: err.message });
  }
});

// ============================================================================
// JIRA API ENDPOINTS
// ============================================================================

// Server-side JIRA token (loaded from environment variable)
const JIRA_TOKEN = process.env.JIRA_TOKEN;

// JIRA ticket fetch endpoint
// Uses server-side token (user token no longer required)
app.post('/api/jira-ticket', async (req, res) => {
    const { jiraId, token: userToken } = req.body;
    const token = JIRA_TOKEN || userToken; // Prefer server token, fallback to user token
    
    if (!jiraId) {
        return res.status(400).json({ error: 'JIRA ID is required' });
    }
    
    if (!token) {
        return res.status(503).json({ error: 'JIRA token not configured on server' });
    }
    
    try {
        const options = {
            hostname: 'issues.redhat.com',
            // Include names expansion so we can dynamically discover custom field IDs for Epic/Feature Link
            path: `/rest/api/2/issue/${jiraId}?expand=changelog,comment,attachment,names`,
            method: 'GET',
            headers: {
                'Authorization': `Bearer ${token}`,
                'Accept': 'application/json',
                'Content-Type': 'application/json',
                'User-Agent': 'OCMUI-Team-Dashboard'
            }
        };
        
        const jiraRequest = https.request(options, (jiraRes) => {
            let data = '';
            
            jiraRes.on('data', (chunk) => {
                data += chunk;
            });
            
            jiraRes.on('end', () => {
                if (jiraRes.statusCode === 200) {
                    try {
                        const ticketData = JSON.parse(data);
                        
                        // Parse comments
                        const comments = [];
                        if (ticketData.fields.comment && ticketData.fields.comment.comments) {
                            ticketData.fields.comment.comments.forEach(comment => {
                                comments.push({
                                    id: comment.id,
                                    author: comment.author ? comment.author.displayName : 'Unknown',
                                    body: comment.body || '',
                                    created: comment.created,
                                    updated: comment.updated || comment.updatedDate || comment.created
                                });
                            });
                        }
                        
                        // Parse attachments to get proper JIRA image URLs
                        const attachments = {};
                        if (ticketData.fields.attachment && Array.isArray(ticketData.fields.attachment)) {
                            ticketData.fields.attachment.forEach(attachment => {
                                // Map filename to proper JIRA URL
                                if (attachment.filename && attachment.content) {
                                    attachments[attachment.filename] = {
                                        url: attachment.content,
                                        thumbnail: attachment.thumbnail || attachment.content,
                                        filename: attachment.filename,
                                        mimeType: attachment.mimeType,
                                        size: attachment.size
                                    };
                                    console.log(`📎 Found attachment: ${attachment.filename} -> ${attachment.content}`);
                                }
                            });
                        }

                        // Derive parent, epic, and feature links (best-effort heuristics)
                        const fields = ticketData.fields || {};
                        const names = ticketData.names || {};

                        // Parent link (subtasks) and dynamic "Parent Link" custom field (for Epics/others)
                        let parentKey = null;
                        try {
                            // Standard parent for subtasks
                            if (fields.parent && (fields.parent.key || fields.parent.id)) {
                                parentKey = fields.parent.key || null;
                            }
                            // Dynamic custom field labeled "Parent Link"
                            if (!parentKey && names) {
                                const parentFieldIds = Object.keys(names).filter((fid) => String(names[fid] || '').toLowerCase().includes('parent link'));
                                for (const fid of parentFieldIds) {
                                    const val = fields[fid];
                                    if (typeof val === 'string' && /[A-Z]+-\d+/.test(val)) {
                                        parentKey = val;
                                        break;
                                    } else if (val && typeof val === 'object' && val.key) {
                                        parentKey = val.key;
                                        break;
                                    }
                                }
                            }
                        } catch {}

                        // Epic link: attempt dynamic discovery via names mapping, then common candidates
                        let epicKey = null;
                        try {
                            const epicFieldCandidates = [
                                'customfield_10008', // common Epic Link on many Jira Cloud instances
                                'customfield_10014',
                                'customfield_12310243', // common Epic Link on Jira Server/DC
                                'customfield_10100',
                                'epic' // occasionally provided as object
                            ];
                            // Add any field IDs whose name equals/contains "Epic Link"
                            Object.keys(names).forEach((fieldId) => {
                                const label = String(names[fieldId] || '').toLowerCase();
                                if (label.includes('epic link') && !epicFieldCandidates.includes(fieldId)) {
                                    epicFieldCandidates.unshift(fieldId);
                                }
                            });
                            for (const candidate of epicFieldCandidates) {
                                if (fields[candidate]) {
                                    const value = fields[candidate];
                                    if (typeof value === 'string' && /[A-Z]+-\d+/.test(value)) {
                                        epicKey = value;
                                        break;
                                    } else if (value && typeof value === 'object' && value.key) {
                                        epicKey = value.key;
                                        break;
                                    }
                                }
                            }
                        } catch {}

                        // Feature link: attempt dynamic discovery via names mapping, then common candidates, then issue links
                        let featureKey = null;
                        try {
                            const featureFieldCandidates = [
                                'customfield_12310244', // possible Feature Link custom field
                                'customfield_10009',
                                'customfield_10010',
                                'feature' // occasionally provided as object
                            ];
                            Object.keys(names).forEach((fieldId) => {
                                const label = String(names[fieldId] || '').toLowerCase();
                                if (label.includes('feature link') && !featureFieldCandidates.includes(fieldId)) {
                                    featureFieldCandidates.unshift(fieldId);
                                }
                            });
                            for (const candidate of featureFieldCandidates) {
                                if (fields[candidate]) {
                                    const value = fields[candidate];
                                    if (typeof value === 'string' && /[A-Z]+-\d+/.test(value)) {
                                        featureKey = value;
                                        break;
                                    } else if (value && typeof value === 'object' && value.key) {
                                        featureKey = value.key;
                                        break;
                                    }
                                }
                            }
                            // If not in custom fields, scan issue links for outward/inward links to a Feature type
                            if (!featureKey && Array.isArray(ticketData.fields.issuelinks)) {
                                for (const link of ticketData.fields.issuelinks) {
                                    const linkedIssue = link.outwardIssue || link.inwardIssue;
                                    if (linkedIssue && linkedIssue.key && linkedIssue.fields && linkedIssue.fields.issuetype) {
                                        const typeName = (linkedIssue.fields.issuetype.name || '').toLowerCase();
                                        if (typeName.includes('feature')) {
                                            featureKey = linkedIssue.key;
                                            break;
                                        }
                                    }
                                }
                            }
                        } catch {}
                        
                        // Discover Target Due Date (try multiple common field names)
                        let targetDueDate = null;
                        try {
                            const dueDateCandidates = [
                                'duedate', // Standard due date
                                'customfield_12313942', // Red Hat JIRA Target end
                                'customfield_12313940', // Alternative Target Date
                                'customfield_12310243', // Another common target date field
                                'customfield_12311940',
                                'customfield_12311941'
                            ];
                            
                            // First pass: prioritize "Target end" and similar fields
                            Object.keys(names).forEach((fieldId) => {
                                const label = String(names[fieldId] || '').toLowerCase();
                                if (label.includes('target end') || 
                                    label.includes('target date') || 
                                    label.includes('target start') || 
                                    label.includes('due date')) {
                                    if (!dueDateCandidates.includes(fieldId)) {
                                        // Put Target end at the front
                                        if (label.includes('target end')) {
                                            dueDateCandidates.unshift(fieldId);
                                        } else {
                                            dueDateCandidates.push(fieldId);
                                        }
                                    }
                                }
                            });
                            
                            // Log all available fields for debugging (first ticket only or when key matches debug pattern)
                            if (ticketData.key.includes('STRAT') || ticketData.key.includes('EPIC')) {
                                console.log(`🔍 Checking fields for ${ticketData.key} (${ticketData.fields.issuetype.name}):`);
                                console.log('  Available date-like fields:', Object.keys(names).filter(f => {
                                    const label = String(names[f] || '').toLowerCase();
                                    return label.includes('target') || label.includes('date') || label.includes('due');
                                }).map(f => `${f}=${names[f]}, value=${fields[f]}`));
                            }
                            
                            for (const candidate of dueDateCandidates) {
                                if (fields[candidate]) {
                                    const value = fields[candidate];
                                    // Accept date strings in format YYYY-MM-DD or ISO format
                                    if (typeof value === 'string' && value.match(/^\d{4}-\d{2}-\d{2}/)) {
                                        targetDueDate = value;
                                        console.log(`✅ Found target date for ${ticketData.key}: ${targetDueDate} (field: ${candidate}, label: "${names[candidate] || 'unknown'}")`);
                                        break;
                                    }
                                }
                            }
                            
                            if (!targetDueDate && (ticketData.fields.issuetype.name === 'Epic' || ticketData.fields.issuetype.name === 'Feature' || ticketData.fields.issuetype.name === 'Outcome')) {
                                console.log(`⚠️ No target date found for ${ticketData.key} (${ticketData.fields.issuetype.name})`);
                            }
                        } catch (e) {
                            console.warn(`⚠️ Error discovering target date for ${ticketData.key}:`, e.message);
                        }
                        
                        // Get last updater from changelog (most recent history item)
                        // JIRA returns histories in chronological order (oldest first), so we need the last one
                        let lastUpdatedBy = null;
                        if (ticketData.changelog?.histories?.length > 0) {
                            const lastHistory = ticketData.changelog.histories[ticketData.changelog.histories.length - 1];
                            lastUpdatedBy = lastHistory.author?.displayName || null;
                        }
                        
                        res.json({
                            success: true,
                            ticket: {
                                key: ticketData.key,
                                summary: ticketData.fields.summary,
                                description: ticketData.fields.description || '',
                                status: ticketData.fields.status.name,
                                type: ticketData.fields.issuetype.name,
                                priority: ticketData.fields.priority ? ticketData.fields.priority.name : 'Normal',
                                assignee: ticketData.fields.assignee ? ticketData.fields.assignee.displayName : null,
                                reporter: ticketData.fields.reporter ? ticketData.fields.reporter.displayName : 'Unknown',
                                created: ticketData.fields.created,
                                updated: ticketData.fields.updated,
                                lastUpdatedBy: lastUpdatedBy,
                                duedate: targetDueDate,
                                comments: comments,
                                attachments: attachments, // Include attachment URL mapping
                                parentKey: parentKey,
                                epicKey: epicKey,
                                featureKey: featureKey
                            }
                        });
                    } catch (parseError) {
                        res.status(500).json({ 
                            error: 'Failed to parse JIRA response',
                            details: parseError.message 
                        });
                    }
                } else if (jiraRes.statusCode === 404) {
                    res.status(404).json({ 
                        error: `JIRA ticket ${jiraId} not found`
                    });
                } else {
                    res.status(jiraRes.statusCode).json({ 
                        error: `JIRA API error: ${jiraRes.statusCode}`,
                        details: data 
                    });
                }
            });
        });
        
        jiraRequest.on('error', (error) => {
            console.error('JIRA request error:', error);
            res.status(500).json({ 
                error: 'Network error connecting to JIRA',
                details: error.message 
            });
        });
        
        jiraRequest.end();
        
    } catch (error) {
        console.error('JIRA ticket fetch error:', error);
        res.status(500).json({ 
            error: 'Internal server error',
            details: error.message 
        });
    }
});

// JIRA API proxy endpoint
// JIRA status endpoint - check if server-side token is configured
app.get('/api/jira/status', async (req, res) => {
    if (!JIRA_TOKEN) {
        return res.status(503).json({ 
            configured: false, 
            error: 'JIRA token not configured on server' 
        });
    }
    
    try {
        const options = {
            hostname: 'issues.redhat.com',
            path: '/rest/api/2/myself',
            method: 'GET',
            headers: {
                'Authorization': `Bearer ${JIRA_TOKEN}`,
                'Accept': 'application/json',
                'Content-Type': 'application/json',
                'User-Agent': 'OCMUI-Team-Dashboard'
            }
        };
        
        const jiraRequest = https.request(options, (jiraRes) => {
            let data = '';
            jiraRes.on('data', (chunk) => { data += chunk; });
            jiraRes.on('end', () => {
                if (jiraRes.statusCode === 200) {
                    try {
                        const userData = JSON.parse(data);
                        res.json({ 
                            configured: true, 
                            user: userData.displayName || userData.name,
                            email: userData.emailAddress,
                            message: 'JIRA service account is active'
                        });
                    } catch (e) {
                        res.status(500).json({ configured: false, error: 'Failed to parse JIRA response' });
                    }
                } else {
                    res.status(jiraRes.statusCode).json({ configured: false, error: 'JIRA token validation failed' });
                }
            });
        });
        
        jiraRequest.on('error', (error) => {
            res.status(500).json({ configured: false, error: error.message });
        });
        
        jiraRequest.end();
    } catch (error) {
        res.status(500).json({ configured: false, error: error.message });
    }
});

// JIRA API test endpoint (for user-provided tokens, kept for backward compatibility)
app.post('/api/test-jira', async (req, res) => {
    const { token: userToken } = req.body;
    const token = userToken || JIRA_TOKEN; // Use provided token or fall back to server token
    
    if (!token) {
        return res.status(400).json({ error: 'Token is required and server has no default configured' });
    }
    
    try {
        // Use node's https module to make the request
        const options = {
            hostname: 'issues.redhat.com',
            path: '/rest/api/2/myself',
            method: 'GET',
            headers: {
                'Authorization': `Bearer ${token}`,
                'Accept': 'application/json',
                'Content-Type': 'application/json',
                'User-Agent': 'OCMUI-Team-Dashboard'
            }
        };
        
        const jiraRequest = https.request(options, (jiraRes) => {
            let data = '';
            
            jiraRes.on('data', (chunk) => {
                data += chunk;
            });
            
            jiraRes.on('end', () => {
                if (jiraRes.statusCode === 200) {
                    try {
                        const userData = JSON.parse(data);
                        res.json({
                            success: true,
                            user: {
                                displayName: userData.displayName || userData.name,
                                emailAddress: userData.emailAddress
                            }
                        });
                    } catch (parseError) {
                        res.status(500).json({ 
                            error: 'Failed to parse JIRA response',
                            details: parseError.message 
                        });
                    }
                } else {
                    res.status(jiraRes.statusCode).json({ 
                        error: `JIRA API error: ${jiraRes.statusCode}`,
                        details: data 
                    });
                }
            });
        });
        
        jiraRequest.on('error', (error) => {
            console.error('JIRA request error:', error);
            res.status(500).json({ 
                error: 'Network error connecting to JIRA',
                details: error.message 
            });
        });
        
        jiraRequest.end();
        
    } catch (error) {
        console.error('JIRA test error:', error);
        res.status(500).json({ 
            error: 'Internal server error',
            details: error.message 
        });
    }
});

// JIRA sprint tickets endpoint
// JIRA sprint tickets endpoint
// Uses server-side token (user token no longer required)
app.post('/api/jira-sprint-tickets', async (req, res) => {
    const { jiraUsername, token: userToken } = req.body;
    const token = JIRA_TOKEN || userToken; // Prefer server token
    
    if (!jiraUsername) {
        return res.status(400).json({ error: 'JIRA username is required' });
    }
    
    if (!token) {
        return res.status(503).json({ error: 'JIRA token not configured on server' });
    }
    
    try {
        // Construct JQL query for tickets assigned to user in open sprints
        const jqlQuery = `assignee = "${jiraUsername}" AND Sprint in openSprints()`;
        const encodedJql = encodeURIComponent(jqlQuery);
        
        // Request up to 100 tickets, sorted by priority and updated date
        const apiPath = `/rest/api/2/search?jql=${encodedJql}&maxResults=100&fields=key,summary,description,status,priority,assignee,reporter,created,updated,issuetype,sprint&expand=changelog`;
        
        const options = {
            hostname: 'issues.redhat.com',
            path: apiPath,
            method: 'GET',
            headers: {
                'Authorization': `Bearer ${token}`,
                'Accept': 'application/json',
                'Content-Type': 'application/json',
                'User-Agent': 'OCMUI-Team-Dashboard'
            }
        };
        
        console.log(`🎯 Fetching sprint JIRAs for ${jiraUsername} with JQL: ${jqlQuery}`);
        
        const jiraRequest = https.request(options, (jiraRes) => {
            let data = '';
            
            jiraRes.on('data', (chunk) => {
                data += chunk;
            });
            
            jiraRes.on('end', () => {
                if (jiraRes.statusCode === 200) {
                    try {
                        const searchResult = JSON.parse(data);
                        
                        // Transform JIRA tickets to simplified format
                        // Collect sprint names to determine the most common active sprint
                        const sprintNames = new Set();
                        let activeSprintName = null;
                        
                        const tickets = searchResult.issues.map(issue => {
                            // Extract sprint information from the fields
                            let sprintName = 'No Sprint';
                            let sprintObj = null;
                            
                            if (issue.fields.sprint && Array.isArray(issue.fields.sprint)) {
                                // Get the most recent/active sprint
                                const activeSprint = issue.fields.sprint.find(sprint => 
                                    sprint && sprint.state === 'active'
                                ) || issue.fields.sprint[issue.fields.sprint.length - 1];
                                
                                if (activeSprint && activeSprint.name) {
                                    sprintName = activeSprint.name;
                                    sprintObj = activeSprint;
                                    sprintNames.add(sprintName);
                                    if (activeSprint.state === 'active') {
                                        activeSprintName = sprintName;
                                    }
                                }
                            } else if (issue.fields.customfield_12310940) {
                                // Alternative sprint field (customfield_12310940 is common for sprint)
                                const sprintField = issue.fields.customfield_12310940;
                                if (Array.isArray(sprintField) && sprintField.length > 0) {
                                    const sprintInfo = sprintField[sprintField.length - 1];
                                    if (typeof sprintInfo === 'string' && sprintInfo.includes('name=')) {
                                        const nameMatch = sprintInfo.match(/name=([^,\]]+)/);
                                        if (nameMatch) {
                                            sprintName = nameMatch[1];
                                            sprintNames.add(sprintName);
                                            // Check if this is an active sprint
                                            if (sprintInfo.includes('state=active') || sprintInfo.includes('state=ACTIVE')) {
                                                activeSprintName = sprintName;
                                            }
                                        }
                                    }
                                }
                            }
                            
                            return {
                                key: issue.key,
                                summary: issue.fields.summary || 'No summary',
                                description: issue.fields.description || '',
                                status: issue.fields.status ? issue.fields.status.name : 'Unknown',
                                priority: issue.fields.priority ? issue.fields.priority.name : 'Medium',
                                assignee: issue.fields.assignee ? issue.fields.assignee.displayName : 'Unassigned',
                                reporter: issue.fields.reporter ? issue.fields.reporter.displayName : 'Unknown',
                                type: issue.fields.issuetype ? issue.fields.issuetype.name : 'Task',
                                created: issue.fields.created,
                                updated: issue.fields.updated,
                                sprint: sprintName
                            };
                        });
                        
                        // Determine the best sprint name to use in the UI
                        const currentSprintName = activeSprintName || (sprintNames.size > 0 ? Array.from(sprintNames)[0] : null);
                        
                        console.log(`✅ Found ${tickets.length} sprint JIRAs for ${jiraUsername}`);
                        if (currentSprintName) {
                            console.log(`🎯 Active sprint: ${currentSprintName}`);
                        }
                        
                        res.json({
                            success: true,
                            tickets: tickets,
                            total: searchResult.total,
                            jqlQuery: jqlQuery,
                            sprintName: currentSprintName,
                            allSprintNames: Array.from(sprintNames)
                        });
                        
                    } catch (parseError) {
                        console.error('Failed to parse JIRA search response:', parseError);
                        res.status(500).json({ 
                            error: 'Failed to parse JIRA response',
                            details: parseError.message 
                        });
                    }
                } else if (jiraRes.statusCode === 400) {
                    // Bad request - likely invalid JQL or user not found
                    res.status(400).json({ 
                        error: `Invalid request - check that JIRA username '${jiraUsername}' is correct`,
                        details: data,
                        jqlQuery: jqlQuery
                    });
                } else if (jiraRes.statusCode === 401) {
                    res.status(401).json({ 
                        error: 'JIRA authentication failed - check your token',
                        details: data 
                    });
                } else if (jiraRes.statusCode === 403) {
                    res.status(403).json({ 
                        error: 'JIRA access denied - insufficient permissions',
                        details: data 
                    });
                } else {
                    console.error(`JIRA API error ${jiraRes.statusCode}:`, data);
                    res.status(jiraRes.statusCode).json({ 
                        error: `JIRA API error: ${jiraRes.statusCode}`,
                        details: data,
                        jqlQuery: jqlQuery
                    });
                }
            });
        });
        
        jiraRequest.on('error', (error) => {
            console.error('JIRA sprint tickets request error:', error);
            res.status(500).json({ 
                error: 'Network error connecting to JIRA',
                details: error.message,
                jqlQuery: jqlQuery
            });
        });
        
        jiraRequest.end();
        
    } catch (error) {
        console.error('JIRA sprint tickets fetch error:', error);
        res.status(500).json({ 
            error: 'Internal server error',
            details: error.message 
        });
    }
});


// ============================================================================
// GITHUB API PROXY ENDPOINTS (Phase 3 - Server-Side Tokens)
// ============================================================================

// Server-side GitHub token (loaded from environment variable)
const GITHUB_TOKEN = process.env.GITHUB_TOKEN;

// Helper function to make GitHub API requests
const makeGitHubRequest = (path, method = 'GET') => {
    return new Promise((resolve, reject) => {
        const options = {
            hostname: 'api.github.com',
            path: path,
            method: method,
            headers: {
                'Authorization': `Bearer ${GITHUB_TOKEN}`,
                'Accept': 'application/vnd.github.v3+json',
                'User-Agent': 'OCMUI-Team-Dashboard'
            }
        };
        
        const req = https.request(options, (res) => {
            let data = '';
            res.on('data', chunk => { data += chunk; });
            res.on('end', () => {
                try {
                    const parsed = JSON.parse(data);
                    resolve({ statusCode: res.statusCode, data: parsed, headers: res.headers });
                } catch (e) {
                    resolve({ statusCode: res.statusCode, data: data, headers: res.headers });
                }
            });
        });
        
        req.on('error', reject);
        req.end();
    });
};

// GitHub token test endpoint (verifies server-side token is configured)
app.get('/api/github/status', async (req, res) => {
    if (!GITHUB_TOKEN) {
        return res.status(503).json({ 
            configured: false, 
            error: 'GitHub token not configured on server' 
        });
    }
    
    try {
        const result = await makeGitHubRequest('/user');
        if (result.statusCode === 200) {
            res.json({ 
                configured: true, 
                user: result.data.login,
                message: 'GitHub service account is active'
            });
        } else {
            res.status(result.statusCode).json({ 
                configured: false, 
                error: 'GitHub token validation failed' 
            });
        }
    } catch (error) {
        res.status(500).json({ configured: false, error: error.message });
    }
});

// GitHub search endpoint - searches PRs by query
// Query params: q (search query), sort, order, per_page, page
app.get('/api/github/search/issues', async (req, res) => {
    if (!GITHUB_TOKEN) {
        return res.status(503).json({ error: 'GitHub token not configured on server' });
    }
    
    const { q, sort = 'updated', order = 'desc', per_page = 20, page = 1 } = req.query;
    
    if (!q) {
        return res.status(400).json({ error: 'Search query (q) is required' });
    }
    
    try {
        const path = `/search/issues?q=${encodeURIComponent(q)}&sort=${sort}&order=${order}&per_page=${per_page}&page=${page}`;
        const result = await makeGitHubRequest(path);
        
        if (result.statusCode === 200) {
            res.json(result.data);
        } else {
            res.status(result.statusCode).json(result.data);
        }
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// GitHub PR details endpoint
// GET /api/github/repos/:owner/:repo/pulls/:pull_number
app.get('/api/github/repos/:owner/:repo/pulls/:pull_number', async (req, res) => {
    if (!GITHUB_TOKEN) {
        return res.status(503).json({ error: 'GitHub token not configured on server' });
    }
    
    const { owner, repo, pull_number } = req.params;
    
    try {
        const path = `/repos/${owner}/${repo}/pulls/${pull_number}`;
        const result = await makeGitHubRequest(path);
        res.status(result.statusCode).json(result.data);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// GitHub PR reviews endpoint
app.get('/api/github/repos/:owner/:repo/pulls/:pull_number/reviews', async (req, res) => {
    if (!GITHUB_TOKEN) {
        return res.status(503).json({ error: 'GitHub token not configured on server' });
    }
    
    const { owner, repo, pull_number } = req.params;
    const { per_page = 100, page = 1 } = req.query;
    
    try {
        const path = `/repos/${owner}/${repo}/pulls/${pull_number}/reviews?per_page=${per_page}&page=${page}`;
        const result = await makeGitHubRequest(path);
        res.status(result.statusCode).json(result.data);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// GitHub PR requested reviewers endpoint
app.get('/api/github/repos/:owner/:repo/pulls/:pull_number/requested_reviewers', async (req, res) => {
    if (!GITHUB_TOKEN) {
        return res.status(503).json({ error: 'GitHub token not configured on server' });
    }
    
    const { owner, repo, pull_number } = req.params;
    
    try {
        const path = `/repos/${owner}/${repo}/pulls/${pull_number}/requested_reviewers`;
        const result = await makeGitHubRequest(path);
        res.status(result.statusCode).json(result.data);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// GitHub issue comments endpoint
app.get('/api/github/repos/:owner/:repo/issues/:issue_number/comments', async (req, res) => {
    if (!GITHUB_TOKEN) {
        return res.status(503).json({ error: 'GitHub token not configured on server' });
    }
    
    const { owner, repo, issue_number } = req.params;
    const { per_page = 100, page = 1 } = req.query;
    
    try {
        const path = `/repos/${owner}/${repo}/issues/${issue_number}/comments?per_page=${per_page}&page=${page}`;
        const result = await makeGitHubRequest(path);
        res.status(result.statusCode).json(result.data);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// GitHub PR commits endpoint (for CI status checks)
app.get('/api/github/repos/:owner/:repo/pulls/:pull_number/commits', async (req, res) => {
    if (!GITHUB_TOKEN) {
        return res.status(503).json({ error: 'GitHub token not configured on server' });
    }
    
    const { owner, repo, pull_number } = req.params;
    
    try {
        const path = `/repos/${owner}/${repo}/pulls/${pull_number}/commits`;
        const result = await makeGitHubRequest(path);
        res.status(result.statusCode).json(result.data);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// GitHub commit status endpoint
app.get('/api/github/repos/:owner/:repo/commits/:ref/status', async (req, res) => {
    if (!GITHUB_TOKEN) {
        return res.status(503).json({ error: 'GitHub token not configured on server' });
    }
    
    const { owner, repo, ref } = req.params;
    
    try {
        const path = `/repos/${owner}/${repo}/commits/${ref}/status`;
        const result = await makeGitHubRequest(path);
        res.status(result.statusCode).json(result.data);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// GitHub check runs endpoint
app.get('/api/github/repos/:owner/:repo/commits/:ref/check-runs', async (req, res) => {
    if (!GITHUB_TOKEN) {
        return res.status(503).json({ error: 'GitHub token not configured on server' });
    }
    
    const { owner, repo, ref } = req.params;
    
    try {
        const path = `/repos/${owner}/${repo}/commits/${ref}/check-runs`;
        const result = await makeGitHubRequest(path);
        res.status(result.statusCode).json(result.data);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// GitHub PR comments endpoint (inline review comments)
app.get('/api/github/repos/:owner/:repo/pulls/:pull_number/comments', async (req, res) => {
    if (!GITHUB_TOKEN) {
        return res.status(503).json({ error: 'GitHub token not configured on server' });
    }
    
    const { owner, repo, pull_number } = req.params;
    const { per_page = 100, page = 1 } = req.query;
    
    try {
        const path = `/repos/${owner}/${repo}/pulls/${pull_number}/comments?per_page=${per_page}&page=${page}`;
        const result = await makeGitHubRequest(path);
        res.status(result.statusCode).json(result.data);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// ============================================================================
// REVIEWER WORKLOAD ENDPOINT (for Reviewers tab)
// ============================================================================

// GET /api/github/reviewer-workload - Get review workload for all team members
// Returns: { success, members: [{ name, github, pending, changesRequested, commented, approved }] }
app.get('/api/github/reviewer-workload', async (req, res) => {
    if (!GITHUB_TOKEN) {
        return res.status(503).json({ error: 'GitHub token not configured on server' });
    }

    try {
        // Get team members with GitHub usernames from the in-memory cache
        const teamMembers = membersCache.filter(m => m.github);
        
        if (teamMembers.length === 0) {
            return res.json({
                success: true,
                members: [],
                message: 'No team members with GitHub usernames configured'
            });
        }

        console.log(`📊 Fetching reviewer workload for ${teamMembers.length} team members...`);

        // For each team member, search for open PRs where they are requested as reviewer or have reviewed
        const workloadPromises = teamMembers.map(async (member) => {
            const githubUsername = member.github;
            
            try {
                // Search for PRs where this user is involved (as reviewer, not author)
                // Scoped to uhc-portal repo only
                const searchQuery = `is:pr is:open repo:RedHatInsights/uhc-portal review-requested:${githubUsername}`;
                const pendingResult = await makeGitHubRequest(
                    `/search/issues?q=${encodeURIComponent(searchQuery)}&per_page=100`
                );
                
                // Search for PRs where user has already reviewed (to get their review states)
                // Scoped to uhc-portal repo only
                const reviewedQuery = `is:pr is:open repo:RedHatInsights/uhc-portal reviewed-by:${githubUsername}`;
                const reviewedResult = await makeGitHubRequest(
                    `/search/issues?q=${encodeURIComponent(reviewedQuery)}&per_page=100`
                );
                
                // Count pending (review requested but not yet acted)
                const pendingCount = pendingResult.statusCode === 200 
                    ? (pendingResult.data.total_count || 0)
                    : 0;

                // For reviewed PRs, we need to fetch review details to categorize
                let approvedCount = 0;
                let changesRequestedCount = 0;
                let commentedCount = 0;

                if (reviewedResult.statusCode === 200 && reviewedResult.data.items) {
                    // Process each reviewed PR to determine the user's review state
                    // Limit to first 30 PRs for performance
                    const reviewedPRs = reviewedResult.data.items.slice(0, 30);
                    
                    for (const pr of reviewedPRs) {
                        try {
                            // Extract owner/repo from PR URL
                            const repoMatch = pr.repository_url?.match(/repos\/([^/]+)\/([^/]+)$/);
                            if (!repoMatch) continue;
                            
                            const [, owner, repo] = repoMatch;
                            
                            // Fetch reviews for this PR
                            const reviewsResult = await makeGitHubRequest(
                                `/repos/${owner}/${repo}/pulls/${pr.number}/reviews?per_page=100`
                            );
                            
                            if (reviewsResult.statusCode === 200 && Array.isArray(reviewsResult.data)) {
                                // Find this user's most recent non-pending review
                                const userReviews = reviewsResult.data
                                    .filter(r => r.user?.login === githubUsername && r.state !== 'PENDING')
                                    .sort((a, b) => new Date(b.submitted_at) - new Date(a.submitted_at));
                                
                                if (userReviews.length > 0) {
                                    const latestReview = userReviews[0];
                                    switch (latestReview.state) {
                                        case 'APPROVED':
                                            approvedCount++;
                                            break;
                                        case 'CHANGES_REQUESTED':
                                            changesRequestedCount++;
                                            break;
                                        case 'COMMENTED':
                                        case 'DISMISSED':
                                            commentedCount++;
                                            break;
                                    }
                                }
                            }
                        } catch (prError) {
                            // Skip this PR on error, continue with others
                            console.warn(`⚠️ Error fetching reviews for PR #${pr.number}: ${prError.message}`);
                        }
                    }
                }

                return {
                    name: member.name,
                    github: githubUsername,
                    pending: pendingCount,
                    changesRequested: changesRequestedCount,
                    commented: commentedCount,
                    approved: approvedCount,
                    total: pendingCount + changesRequestedCount + commentedCount + approvedCount
                };
                
            } catch (memberError) {
                console.error(`❌ Error fetching workload for ${member.name} (@${githubUsername}):`, memberError.message);
                return {
                    name: member.name,
                    github: githubUsername,
                    pending: 0,
                    changesRequested: 0,
                    commented: 0,
                    approved: 0,
                    total: 0,
                    error: memberError.message
                };
            }
        });

        // Execute all queries in parallel (with some rate limiting built into GitHub API)
        const results = await Promise.all(workloadPromises);
        
        // Sort by pending reviews ascending (least pending first = most available for new reviews)
        // Secondary sort by total ascending for tie-breaking
        results.sort((a, b) => {
            if (a.pending !== b.pending) {
                return a.pending - b.pending; // Least pending first
            }
            return a.total - b.total; // Then by least total
        });

        console.log(`✅ Reviewer workload fetched for ${results.length} members`);

        res.json({
            success: true,
            members: results,
            timestamp: new Date().toISOString()
        });

    } catch (error) {
        console.error('❌ Reviewer workload fetch error:', error);
        res.status(500).json({ error: 'Failed to fetch reviewer workload', details: error.message });
    }
});

// ============================================================================
// JIRA API ENDPOINTS (continued)
// ============================================================================

// Fetch child issues for an Epic or Feature
// Request body: { parentKey: string, token: string }
// Returns: { success, total, issues: [{ key, summary, assignee, status, type }] }
// Fetch child issues for an Epic or Feature
// Uses server-side token (user token no longer required)
app.post('/api/jira-child-issues', async (req, res) => {
    const { parentKey, token: userToken } = req.body;
    const token = JIRA_TOKEN || userToken; // Prefer server token
    
    if (!parentKey) {
        return res.status(400).json({ error: 'parentKey is required' });
    }
    
    if (!token) {
        return res.status(503).json({ error: 'JIRA token not configured on server' });
    }

    try {
        // JQL: find issues where parent = KEY (subtasks), "Epic Link" = KEY (epic children), or "Parent Link" = KEY (feature/initiative)
        // Sort by most recently updated
        const jql = `(parent = ${parentKey} OR "Epic Link" = ${parentKey} OR "Parent Link" = ${parentKey}) ORDER BY updated DESC`;
        const encodedJql = encodeURIComponent(jql);

        const apiPath = `/rest/api/2/search?jql=${encodedJql}&maxResults=100&fields=key,summary,assignee,status,issuetype,updated&expand=changelog`;

        const options = {
            hostname: 'issues.redhat.com',
            path: apiPath,
            method: 'GET',
            headers: {
                'Authorization': `Bearer ${token}`,
                'Accept': 'application/json',
                'Content-Type': 'application/json',
                'User-Agent': 'OCMUI-Team-Dashboard'
            }
        };

        const jiraRequest = https.request(options, (jiraRes) => {
            let data = '';
            jiraRes.on('data', (chunk) => { data += chunk; });
            jiraRes.on('end', () => {
                if (jiraRes.statusCode === 200) {
                    try {
                        const searchResult = JSON.parse(data);
                        const issues = (searchResult.issues || []).map((issue) => {
                            // Get last updater from changelog (most recent history item)
                            let lastUpdatedBy = null;
                            const changelog = issue.changelog;
                            if (changelog?.histories?.length > 0) {
                                const lastHistory = changelog.histories[changelog.histories.length - 1]; // Most recent (JIRA returns oldest first)
                                lastUpdatedBy = lastHistory.author?.displayName || null;
                            }
                            
                            return {
                                key: issue.key,
                                summary: issue.fields?.summary || 'No summary',
                                assignee: issue.fields?.assignee?.displayName || 'Unassigned',
                                status: issue.fields?.status?.name || 'Unknown',
                                type: issue.fields?.issuetype?.name || 'Task',
                                updated: issue.fields?.updated || null,
                                lastUpdatedBy: lastUpdatedBy
                            };
                        });
                        res.json({ success: true, total: searchResult.total || issues.length, issues });
                    } catch (e) {
                        res.status(500).json({ error: 'Failed to parse JIRA response', details: e.message });
                    }
                } else {
                    res.status(jiraRes.statusCode).json({ error: `JIRA API error: ${jiraRes.statusCode}`, details: data });
                }
            });
        });

        jiraRequest.on('error', (error) => {
            console.error('JIRA child issues request error:', error);
            res.status(500).json({ error: 'Network error connecting to JIRA', details: error.message });
        });

        jiraRequest.end();
    } catch (error) {
        console.error('JIRA child issues fetch error:', error);
        res.status(500).json({ error: 'Internal server error', details: error.message });
    }
});

// Update JIRA issue field endpoint
// Request body: { issueKey: string, fieldId: string, value: string }
app.post('/api/jira-update-field', async (req, res) => {
    const { issueKey, fieldId, value } = req.body;
    const token = JIRA_TOKEN;
    
    if (!issueKey || !fieldId) {
        return res.status(400).json({ error: 'issueKey and fieldId are required' });
    }
    
    if (!token) {
        return res.status(503).json({ error: 'JIRA token not configured on server' });
    }

    try {
        const updateData = JSON.stringify({
            fields: {
                [fieldId]: value || null
            }
        });

        const options = {
            hostname: 'issues.redhat.com',
            path: `/rest/api/2/issue/${issueKey}`,
            method: 'PUT',
            headers: {
                'Authorization': `Bearer ${token}`,
                'Accept': 'application/json',
                'Content-Type': 'application/json',
                'User-Agent': 'OCMUI-Team-Dashboard'
            }
        };

        console.log(`📝 Updating ${issueKey} field ${fieldId}`);

        const jiraRequest = https.request(options, (jiraRes) => {
            let data = '';
            jiraRes.on('data', (chunk) => { data += chunk; });
            jiraRes.on('end', () => {
                if (jiraRes.statusCode === 204 || jiraRes.statusCode === 200) {
                    console.log(`✅ Successfully updated ${issueKey}`);
                    res.json({ success: true, issueKey, fieldId });
                } else {
                    console.error(`❌ Failed to update ${issueKey}: ${jiraRes.statusCode}`, data);
                    res.status(jiraRes.statusCode).json({ 
                        error: `JIRA API error: ${jiraRes.statusCode}`, 
                        details: data 
                    });
                }
            });
        });

        jiraRequest.on('error', (error) => {
            console.error('JIRA update request error:', error);
            res.status(500).json({ error: 'Network error connecting to JIRA', details: error.message });
        });

        jiraRequest.write(updateData);
        jiraRequest.end();
    } catch (error) {
        console.error('JIRA update error:', error);
        res.status(500).json({ error: 'Internal server error', details: error.message });
    }
});

// JIRA Epics endpoint
// Fetches Epics with different filters: active (ui-active-item label), all, blocked
// Request body: { filter: 'active' | 'all' | 'blocked' }
// Returns: { success, epics: [...], total, filter, jqlQuery }
app.post('/api/jira-epics', async (req, res) => {
    const { filter = 'active' } = req.body;
    const token = JIRA_TOKEN;
    
    if (!token) {
        return res.status(503).json({ error: 'JIRA token not configured on server' });
    }

    try {
        // Build JQL based on filter
        // All queries scoped to OCMUI project
        let jql;
        switch (filter) {
            case 'all':
                // All OCMUI unblocked epics (without ui-active-item label requirement)
                // Exclude closed epics older than 3 months
                jql = `project = OCMUI AND issuetype = Epic AND Blocked = "False" AND (status != Closed OR resolved >= -90d) ORDER BY "Target end" ASC`;
                break;
            case 'blocked':
                // Blocked OCMUI epics with ui-active-item label
                jql = `project = OCMUI AND labels in ('ui-active-item') AND issuetype = Epic AND Blocked = "True" ORDER BY "Target end" ASC`;
                break;
            case 'planning':
                // Planning OCMUI epics (ui-active-item label, unblocked, status = New/Refinement/Backlog/To Do)
                jql = `project = OCMUI AND labels in ('ui-active-item') AND issuetype = Epic AND Blocked = "False" AND status in (New, Refinement, Backlog, "To Do") ORDER BY "Target end" ASC`;
                break;
            case 'in-progress':
            default:
                // In-Progress OCMUI epics (ui-active-item label, unblocked, status = In Progress/Code Review)
                jql = `project = OCMUI AND labels in ('ui-active-item') AND issuetype = Epic AND Blocked = "False" AND status in ("In Progress", "Code Review", Review) ORDER BY "Target end" ASC`;
                break;
        }

        const encodedJql = encodeURIComponent(jql);
        
        // Request fields including custom fields:
        // - customfield_12319289: Marketing Impact Notes
        // - customfield_12316544: Blocked Reason
        // - customfield_12313942: Target end
        // - customfield_12313140: Parent Link
        // - customfield_12318341: Feature Link
        const fields = [
            'key', 'summary', 'status', 'priority', 'assignee',
            'updated',              // Last updated timestamp
            'customfield_12313942', // Target end
            'customfield_12319289', // Marketing Impact Notes
            'customfield_12316544', // Blocked Reason
            'customfield_12313140', // Parent Link
            'customfield_12318341', // Feature Link
            'parent',               // Standard parent (subtasks)
            'issuelinks'            // Issue links
        ].join(',');

        const apiPath = `/rest/api/2/search?jql=${encodedJql}&maxResults=200&fields=${fields}&expand=names,changelog`;

        const options = {
            hostname: 'issues.redhat.com',
            path: apiPath,
            method: 'GET',
            headers: {
                'Authorization': `Bearer ${token}`,
                'Accept': 'application/json',
                'Content-Type': 'application/json',
                'User-Agent': 'OCMUI-Team-Dashboard'
            }
        };

        console.log(`🟪 Fetching epics with filter: ${filter}, JQL: ${jql}`);

        const jiraRequest = https.request(options, (jiraRes) => {
            let data = '';
            jiraRes.on('data', (chunk) => { data += chunk; });
            jiraRes.on('end', () => {
                if (jiraRes.statusCode === 200) {
                    try {
                        const searchResult = JSON.parse(data);
                        const names = searchResult.names || {};
                        
                        // Log field names for debugging
                        const targetEndFields = Object.keys(names).filter(k => 
                            String(names[k] || '').toLowerCase().includes('target')
                        );
                        const parentLinkFields = Object.keys(names).filter(k => 
                            String(names[k] || '').toLowerCase().includes('parent link')
                        );
                        console.log(`🟪 Found ${searchResult.issues?.length || 0} epics`);
                        console.log(`   Target-related fields: ${JSON.stringify(targetEndFields.map(k => `${k}=${names[k]}`))}`);
                        console.log(`   Parent link fields: ${JSON.stringify(parentLinkFields.map(k => `${k}=${names[k]}`))}`);
                        
                        
                        const epics = (searchResult.issues || []).map((issue) => {
                            const fields = issue.fields || {};
                            
                            // Extract target end - try multiple field candidates
                            let targetEnd = null;
                            const targetEndCandidates = ['customfield_12313942', ...targetEndFields];
                            for (const fieldId of targetEndCandidates) {
                                if (fields[fieldId] && typeof fields[fieldId] === 'string' && fields[fieldId].match(/^\d{4}-\d{2}-\d{2}/)) {
                                    targetEnd = fields[fieldId];
                                    break;
                                }
                            }
                            
                            // Extract parent key and feature key from custom fields
                            let parentKey = null;
                            let featureKey = null;
                            
                            // 1. Parent Link field (customfield_12313140) - can be string or object
                            const parentLinkVal = fields.customfield_12313140;
                            if (parentLinkVal) {
                                if (typeof parentLinkVal === 'string' && /[A-Z]+-\d+/.test(parentLinkVal)) {
                                    parentKey = parentLinkVal;
                                } else if (parentLinkVal.key) {
                                    parentKey = parentLinkVal.key;
                                }
                            }
                            
                            // 2. Feature Link field (customfield_12318341) - can be string or object
                            const featureLinkVal = fields.customfield_12318341;
                            if (featureLinkVal) {
                                if (typeof featureLinkVal === 'string' && /[A-Z]+-\d+/.test(featureLinkVal)) {
                                    featureKey = featureLinkVal;
                                } else if (featureLinkVal.key) {
                                    featureKey = featureLinkVal.key;
                                }
                            }
                            
                            // 3. Standard parent field (for subtasks)
                            if (!parentKey && fields.parent?.key) {
                                parentKey = fields.parent.key;
                            }
                            
                            // 4. Dynamic parent link fields (discovered via names)
                            if (!parentKey) {
                                for (const fieldId of parentLinkFields) {
                                    const val = fields[fieldId];
                                    if (typeof val === 'string' && /[A-Z]+-\d+/.test(val)) {
                                        parentKey = val;
                                        break;
                                    } else if (val && typeof val === 'object' && val.key) {
                                        parentKey = val.key;
                                        break;
                                    }
                                }
                            }
                            
                            // Get last updater from changelog (most recent history item)
                            let lastUpdatedBy = null;
                            const changelog = issue.changelog;
                            if (changelog?.histories?.length > 0) {
                                const lastHistory = changelog.histories[changelog.histories.length - 1]; // Most recent (JIRA returns oldest first)
                                lastUpdatedBy = lastHistory.author?.displayName || null;
                            }
                            
                            return {
                                key: issue.key,
                                summary: fields.summary || 'No summary',
                                status: fields.status?.name || 'Unknown',
                                priority: fields.priority?.name || 'Normal',
                                assignee: fields.assignee?.displayName || 'Unassigned',
                                targetEnd: targetEnd,
                                updated: fields.updated || null,
                                lastUpdatedBy: lastUpdatedBy,
                                marketingImpactNotes: fields.customfield_12319289 || null,
                                blockedReason: fields.customfield_12316544 || null,
                                parentKey: parentKey,
                                featureKey: featureKey
                            };
                        });
                        
                        res.json({
                            success: true,
                            epics,
                            total: searchResult.total || epics.length,
                            filter,
                            jqlQuery: jql
                        });
                    } catch (e) {
                        console.error('Failed to parse JIRA epics response:', e);
                        res.status(500).json({ error: 'Failed to parse JIRA response', details: e.message });
                    }
                } else {
                    console.error(`JIRA epics API error ${jiraRes.statusCode}:`, data);
                    res.status(jiraRes.statusCode).json({ error: `JIRA API error: ${jiraRes.statusCode}`, details: data });
                }
            });
        });

        jiraRequest.on('error', (error) => {
            console.error('JIRA epics request error:', error);
            res.status(500).json({ error: 'Network error connecting to JIRA', details: error.message });
        });

        jiraRequest.end();
    } catch (error) {
        console.error('JIRA epics fetch error:', error);
        res.status(500).json({ error: 'Internal server error', details: error.message });
    }
});


// ============================================================================
// UNLEASH FEATURE FLAGS API ENDPOINTS
// ============================================================================

// Server-side Unleash tokens (loaded from environment variables)
const UNLEASH_STAGING_URL = process.env.UNLEASH_STAGING_URL || 'https://ocm-stage.unleash.devshift.net';
const UNLEASH_PROD_URL = process.env.UNLEASH_PROD_URL || 'https://ocm.unleash.devshift.net';
const UNLEASH_STAGING_TOKEN = process.env.UNLEASH_STAGING_TOKEN;
const UNLEASH_PROD_TOKEN = process.env.UNLEASH_PROD_TOKEN;
const UNLEASH_PROJECT = process.env.UNLEASH_PROJECT || 'default';

// URL for the featureConstants.ts file that defines which flags are used in the OCMUI codebase
const FEATURE_CONSTANTS_URL = process.env.FEATURE_CONSTANTS_URL || 
    'https://raw.githubusercontent.com/RedHatInsights/uhc-portal/main/src/queries/featureGates/featureConstants.ts';

// Cache for the feature constants (refresh every 5 minutes)
let featureConstantsCache = { flags: null, lastFetch: 0 };
const FEATURE_CONSTANTS_CACHE_TTL = 5 * 60 * 1000; // 5 minutes

// Fetch and parse the featureConstants.ts file to get list of flags used in codebase
const fetchFeatureConstants = async () => {
    const now = Date.now();
    if (featureConstantsCache.flags && (now - featureConstantsCache.lastFetch) < FEATURE_CONSTANTS_CACHE_TTL) {
        return featureConstantsCache.flags;
    }
    
    return new Promise((resolve, reject) => {
        const url = new URL(FEATURE_CONSTANTS_URL);
        const options = {
            hostname: url.hostname,
            path: url.pathname,
            method: 'GET',
            headers: {
                'Accept': 'text/plain',
                'User-Agent': 'OCMUI-Team-Dashboard'
            }
        };
        
        const req = https.request(options, (res) => {
            let data = '';
            res.on('data', chunk => { data += chunk; });
            res.on('end', () => {
                if (res.statusCode !== 200) {
                    console.error(`Failed to fetch featureConstants.ts: ${res.statusCode}`);
                    resolve(featureConstantsCache.flags || []); // Return cached or empty
                    return;
                }
                
                // Parse the TypeScript file to extract feature flag names
                // Look for patterns like: export const X = 'flag-name';
                const flagRegex = /export\s+const\s+\w+\s*=\s*['"]([^'"]+)['"]/g;
                const flags = [];
                let match;
                while ((match = flagRegex.exec(data)) !== null) {
                    flags.push(match[1]);
                }
                
                console.log(`📋 Loaded ${flags.length} feature flags from featureConstants.ts`);
                featureConstantsCache = { flags, lastFetch: now };
                resolve(flags);
            });
        });
        
        req.on('error', (err) => {
            console.error('Error fetching featureConstants.ts:', err.message);
            resolve(featureConstantsCache.flags || []); // Return cached or empty
        });
        req.end();
    });
};

// Helper function to make Unleash API requests
const makeUnleashRequest = (baseUrl, token, endpoint) => {
    return new Promise((resolve, reject) => {
        const url = new URL(`/api${endpoint}`, baseUrl);
        const options = {
            hostname: url.hostname,
            path: url.pathname + url.search,
            method: 'GET',
            headers: {
                'Authorization': token,
                'Accept': 'application/json',
                'Content-Type': 'application/json'
            }
        };
        
        const req = https.request(options, (res) => {
            let data = '';
            res.on('data', chunk => { data += chunk; });
            res.on('end', () => {
                try {
                    const parsed = JSON.parse(data);
                    resolve({ statusCode: res.statusCode, data: parsed });
                } catch (e) {
                    resolve({ statusCode: res.statusCode, data: data, error: e.message });
                }
            });
        });
        
        req.on('error', reject);
        req.end();
    });
};

// Parse strategy to get human-readable info
const parseStrategy = (strategy) => {
    const result = {
        name: strategy.name,
        constraints: strategy.constraints || [],
        parameters: strategy.parameters || {},
    };

    // Check for org-based constraints
    const orgConstraint = result.constraints.find(
        c => c.contextName === 'orgId' || 
             c.contextName === 'organizationId' ||
             c.contextName === 'org_id'
    );

    if (orgConstraint) {
        result.orgIds = orgConstraint.values || [];
    }

    if (result.parameters.orgIds) {
        result.orgIds = result.parameters.orgIds.split(',').map(s => s.trim());
    }

    return result;
};

// Format strategy for display
const formatStrategySimple = (strategies) => {
    if (!strategies || strategies.length === 0) return 'All';
    
    for (const s of strategies) {
        const parsed = parseStrategy(s);
        const name = parsed.name?.toLowerCase() || '';
        
        if (name === 'perorg' || name.includes('perorg')) {
            const orgCount = parsed.orgIds?.length || 0;
            return orgCount > 0 ? `${orgCount} orgs` : 'perOrg';
        }
        
        if (name === 'excludeperorg' || name === 'excludebyorg' || name.includes('exclude')) {
            const orgCount = parsed.orgIds?.length || 0;
            return orgCount > 0 ? `excl ${orgCount} orgs` : 'exclude';
        }
        
        if (name === 'flexiblerollout' || name.includes('rollout')) {
            const rollout = parsed.parameters?.rollout;
            if (rollout === '100' || rollout === 100) return 'All';
            if (rollout) return `${rollout}%`;
            return 'All';
        }
        
        if (name === 'default') return 'All';
        
        return `?${parsed.name}`;
    }
    
    return 'All';
};

// Format user email to username
const formatUser = (email) => {
    if (!email) return 'unknown';
    const match = email.match(/^([^@]+)/);
    return match ? match[1] : email;
};

// Unleash status endpoint - check if tokens are configured
app.get('/api/unleash/status', async (req, res) => {
    // Also fetch the current list of codebase flags to show in status
    const codebaseFlags = await fetchFeatureConstants();
    res.json({
        configured: !!(UNLEASH_STAGING_TOKEN && UNLEASH_PROD_TOKEN),
        staging: {
            configured: !!UNLEASH_STAGING_TOKEN,
            url: UNLEASH_STAGING_URL
        },
        production: {
            configured: !!UNLEASH_PROD_TOKEN,
            url: UNLEASH_PROD_URL
        },
        project: UNLEASH_PROJECT,
        featureConstantsUrl: FEATURE_CONSTANTS_URL,
        codebaseFlagsCount: codebaseFlags.length
    });
});

// Get all feature flags comparison between staging and production
app.get('/api/unleash/flags', async (req, res) => {
    if (!UNLEASH_STAGING_TOKEN || !UNLEASH_PROD_TOKEN) {
        return res.status(503).json({ 
            error: 'Unleash tokens not configured on server',
            configured: {
                staging: !!UNLEASH_STAGING_TOKEN,
                production: !!UNLEASH_PROD_TOKEN
            }
        });
    }
    
    const { showAll = 'false' } = req.query;
    
    try {
        console.log('🔄 Fetching feature flags from staging and production...');
        
        // Fetch the list of flags used in the OCMUI codebase AND features from both environments
        const [codebaseFlags, stagingResult, prodResult] = await Promise.all([
            fetchFeatureConstants(),
            makeUnleashRequest(UNLEASH_STAGING_URL, UNLEASH_STAGING_TOKEN, `/admin/projects/${UNLEASH_PROJECT}/features`),
            makeUnleashRequest(UNLEASH_PROD_URL, UNLEASH_PROD_TOKEN, `/admin/projects/${UNLEASH_PROJECT}/features`)
        ]);
        
        if (stagingResult.statusCode !== 200) {
            return res.status(stagingResult.statusCode).json({ 
                error: 'Failed to fetch staging features', 
                details: stagingResult.data 
            });
        }
        
        if (prodResult.statusCode !== 200) {
            return res.status(prodResult.statusCode).json({ 
                error: 'Failed to fetch production features', 
                details: prodResult.data 
            });
        }
        
        const stagingFeatures = (stagingResult.data.features || []).filter(f => !f.archived);
        const prodFeatures = (prodResult.data.features || []).filter(f => !f.archived);
        
        // Create maps
        const stagingMap = new Map(stagingFeatures.map(f => [f.name, f]));
        const prodMap = new Map(prodFeatures.map(f => [f.name, f]));
        
        // Combine all flag names from Unleash
        const allUnleashNames = new Set([...stagingMap.keys(), ...prodMap.keys()]);
        
        // Filter by ocmui- prefix (matching compare-envs.js behavior)
        // Also include any non-prefixed flags that ARE in the codebase
        const FLAG_PREFIX = 'ocmui-';
        const codebaseFlagsSet = new Set(codebaseFlags);
        
        let filteredNames;
        if (showAll === 'true') {
            filteredNames = [...allUnleashNames];
            console.log(`📊 Showing ALL ${filteredNames.length} flags (showAll=true)`);
        } else {
            // Include flags that start with ocmui- OR are in the codebase (like compare-envs.js does)
            filteredNames = [...allUnleashNames].filter(name => 
                name.startsWith(FLAG_PREFIX) || codebaseFlagsSet.has(name)
            );
            console.log(`📊 Filtered to ${filteredNames.length} flags with '${FLAG_PREFIX}' prefix or in codebase`);
        }
        
        // Build comparison data - fetch full details for each flag
        const flagsData = [];
        
        for (const name of filteredNames) {
            const stagingFeature = stagingMap.get(name);
            const prodFeature = prodMap.get(name);
            
            // Get full feature details to get environment status and strategies
            let stagingStatus = null;
            let prodStatus = null;
            let prodModifiedInfo = null;
            
            if (stagingFeature) {
                try {
                    const fullFeature = await makeUnleashRequest(
                        UNLEASH_STAGING_URL, 
                        UNLEASH_STAGING_TOKEN, 
                        `/admin/projects/${UNLEASH_PROJECT}/features/${name}`
                    );
                    if (fullFeature.statusCode === 200) {
                        const env = fullFeature.data.environments?.find(e => e.name === 'default') || fullFeature.data.environments?.[0];
                        stagingStatus = {
                            enabled: env?.enabled ?? false,
                            strategies: env?.strategies || []
                        };
                    }
                } catch (e) {
                    console.error(`Error fetching staging details for ${name}:`, e.message);
                }
            }
            
            if (prodFeature) {
                try {
                    const fullFeature = await makeUnleashRequest(
                        UNLEASH_PROD_URL, 
                        UNLEASH_PROD_TOKEN, 
                        `/admin/projects/${UNLEASH_PROJECT}/features/${name}`
                    );
                    if (fullFeature.statusCode === 200) {
                        const env = fullFeature.data.environments?.find(e => e.name === 'default') || fullFeature.data.environments?.[0];
                        prodStatus = {
                            enabled: env?.enabled ?? false,
                            strategies: env?.strategies || []
                        };
                    }
                    
                    // Get events for last modified info
                    const eventsResult = await makeUnleashRequest(
                        UNLEASH_PROD_URL,
                        UNLEASH_PROD_TOKEN,
                        `/admin/events/${encodeURIComponent(name)}`
                    );
                    
                    if (eventsResult.statusCode === 200 && eventsResult.data.events) {
                        const events = eventsResult.data.events.filter(e => e.featureName === name);
                        events.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
                        
                        const meaningfulTypes = [
                            'feature-environment-enabled',
                            'feature-environment-disabled', 
                            'feature-strategy-add',
                            'feature-strategy-update',
                            'feature-strategy-remove',
                            'feature-created',
                        ];
                        
                        const lastMeaningful = events.find(e => meaningfulTypes.includes(e.type));
                        if (lastMeaningful) {
                            prodModifiedInfo = {
                                date: lastMeaningful.createdAt,
                                user: formatUser(lastMeaningful.createdBy),
                                action: lastMeaningful.type.includes('enabled') ? 'enabled' :
                                        lastMeaningful.type.includes('disabled') ? 'disabled' :
                                        lastMeaningful.type === 'feature-created' ? 'created' : 'updated'
                            };
                        }
                    }
                } catch (e) {
                    console.error(`Error fetching prod details for ${name}:`, e.message);
                }
            } else if (stagingFeature) {
                // For staging-only flags, get events from staging
                try {
                    const eventsResult = await makeUnleashRequest(
                        UNLEASH_STAGING_URL,
                        UNLEASH_STAGING_TOKEN,
                        `/admin/events/${encodeURIComponent(name)}`
                    );
                    
                    if (eventsResult.statusCode === 200 && eventsResult.data.events) {
                        const events = eventsResult.data.events.filter(e => e.featureName === name);
                        events.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
                        
                        const meaningfulTypes = [
                            'feature-environment-enabled',
                            'feature-environment-disabled', 
                            'feature-strategy-add',
                            'feature-strategy-update',
                            'feature-strategy-remove',
                            'feature-created',
                        ];
                        
                        const lastMeaningful = events.find(e => meaningfulTypes.includes(e.type));
                        if (lastMeaningful) {
                            prodModifiedInfo = {
                                date: lastMeaningful.createdAt,
                                user: formatUser(lastMeaningful.createdBy),
                                action: lastMeaningful.type.includes('enabled') ? 'enabled' :
                                        lastMeaningful.type.includes('disabled') ? 'disabled' :
                                        lastMeaningful.type === 'feature-created' ? 'created' : 'updated'
                            };
                        }
                    }
                } catch (e) {
                    // Ignore event fetch errors
                }
            }
            
            const staging = stagingStatus ? (stagingStatus.enabled ? 'ON' : 'OFF') : '-';
            const production = prodStatus ? (prodStatus.enabled ? 'ON' : 'OFF') : '-';
            const mismatch = staging !== '-' && production !== '-' && staging !== production;
            
            const strategy = formatStrategySimple(prodStatus?.strategies || stagingStatus?.strategies);
            
            // Check if this flag is defined in the codebase
            const inCode = codebaseFlagsSet.has(name);
            
            flagsData.push({
                name,
                inCode,
                staging,
                production,
                mismatch,
                strategy,
                stagingOnly: staging !== '-' && production === '-',
                prodOnly: staging === '-' && production !== '-',
                modifiedBy: prodModifiedInfo?.user || null,
                modifiedAt: prodModifiedInfo?.date || null,
                modifiedAction: prodModifiedInfo?.action || null
            });
        }
        
        // Sort: mismatches first, then alphabetically
        flagsData.sort((a, b) => {
            if (a.mismatch !== b.mismatch) return b.mismatch ? 1 : -1;
            return a.name.localeCompare(b.name);
        });
        
        // Summary stats
        const summary = {
            total: flagsData.length,
            prodOn: flagsData.filter(f => f.production === 'ON').length,
            notReleased: flagsData.filter(f => f.mismatch).length,
            stagingOnly: flagsData.filter(f => f.stagingOnly).length,
            prodOnly: flagsData.filter(f => f.prodOnly).length,
            orgRestricted: flagsData.filter(f => f.strategy.includes('org')).length
        };
        
        console.log(`✅ Feature flags comparison complete: ${summary.total} flags, ${summary.notReleased} not released`);
        
        res.json({
            success: true,
            flags: flagsData,
            summary,
            featureConstantsUrl: FEATURE_CONSTANTS_URL,
            codebaseFlagsCount: codebaseFlags.length
        });
        
    } catch (error) {
        console.error('Feature flags fetch error:', error);
        res.status(500).json({ 
            error: 'Internal server error',
            details: error.message 
        });
    }
});

// ============================================================================
// DOC LINKS HEALTH CHECK API ENDPOINTS
// ============================================================================

// URLs for the link definition files from uhc-portal
// This mirrors what getAllExternalLinks() in urlUtils.mjs imports
// Add new files here as they're added to uhc-portal (e.g., docLinks.mjs)
const UHC_PORTAL_BASE_URL = process.env.UHC_PORTAL_BASE_URL || 
    'https://raw.githubusercontent.com/RedHatInsights/uhc-portal/main/src/common';

const DOC_LINKS_SOURCE_FILES = (process.env.DOC_LINKS_SOURCE_FILES || 
    'installLinks.mjs,supportLinks.mjs,docLinks.mjs')
    .split(',')
    .map(f => f.trim())
    .filter(Boolean);

// Cache for doc links check results
let docLinksCache = {
    results: null,
    summary: null,
    lastChecked: null,
    urlList: null,
    urlListFetchedAt: null
};
const DOC_LINKS_CACHE_TTL = 60 * 60 * 1000; // 1 hour cache for results
const DOC_LINKS_URL_LIST_TTL = 24 * 60 * 60 * 1000; // 24 hours for URL list

// Fetch and parse URL list from uhc-portal files
// This mirrors getAllExternalLinks() from urlUtils.mjs - fetches all source files in parallel
const fetchDocLinkUrls = async () => {
    const now = Date.now();
    
    // Return cached URL list if still valid
    if (docLinksCache.urlList && docLinksCache.urlListFetchedAt && 
        (now - docLinksCache.urlListFetchedAt) < DOC_LINKS_URL_LIST_TTL) {
        return docLinksCache.urlList;
    }
    
    console.log(`📋 Fetching doc link URLs from uhc-portal (${DOC_LINKS_SOURCE_FILES.length} source files)...`);
    
    const urls = new Set();
    
    // Helper to fetch and parse a .mjs file for URLs
    const extractUrlsFromFile = async (filename) => {
        const fileUrl = `${UHC_PORTAL_BASE_URL}/${filename}`;
        return new Promise((resolve) => {
            const url = new URL(fileUrl);
            const options = {
                hostname: url.hostname,
                path: url.pathname,
                method: 'GET',
                headers: {
                    'Accept': 'text/plain',
                    'User-Agent': 'OCMUI-Team-Dashboard'
                }
            };
            
            const req = https.request(options, (res) => {
                let data = '';
                res.on('data', chunk => { data += chunk; });
                res.on('end', () => {
                    if (res.statusCode === 404) {
                        // File doesn't exist yet (e.g., docLinks.mjs before PR merges)
                        console.log(`📋 ${filename}: not found (may not exist yet)`);
                        resolve([]);
                        return;
                    }
                    if (res.statusCode !== 200) {
                        console.error(`📋 ${filename}: failed to fetch (${res.statusCode})`);
                        resolve([]);
                        return;
                    }
                    
                    // Step 0: Remove commented-out code to avoid extracting URLs from comments
                    // Remove single-line comments (// ...) but preserve the line structure
                    // Remove multi-line comments (/* ... */)
                    // IMPORTANT: Use \s// pattern to avoid matching // in URLs like `${BASE}//path`
                    // The \s ensures we only match // after whitespace (actual comments)
                    let cleanedData = data
                        .replace(/\/\*[\s\S]*?\*\//g, '')  // Remove /* ... */ comments
                        .replace(/\s\/\/[^'"`]*$/gm, '');  // Remove // comments after whitespace (not in strings)
                    
                    // Step 1: Extract all const declarations (const NAME = 'value' or "value")
                    // This captures base URLs like MIRROR_CLIENTS_STABLE_X86, OCP_DOCS_BASE, etc.
                    // Use original data for constants (they might be in comments for documentation)
                    const constants = {};
                    const constPattern = /const\s+([A-Z_][A-Z0-9_]*)\s*=\s*['"`]([^'"`]+)['"`]/g;
                    let constMatch;
                    while ((constMatch = constPattern.exec(data)) !== null) {
                        constants[constMatch[1]] = constMatch[2];
                    }
                    
                    // Step 2: Find all string values and template literals (from cleaned data)
                    const foundUrls = [];
                    
                    // Pattern for simple string URLs: 'https://...' or "https://..." or `https://...`
                    // Use cleanedData to skip commented-out URLs
                    // Exclude newlines to avoid matching multi-line string declarations incorrectly
                    // Also match backtick strings without interpolation
                    const simpleUrlPattern = /['"`]((https?:\/\/[^'"`\n\r]+))['"`]/g;
                    let match;
                    while ((match = simpleUrlPattern.exec(cleanedData)) !== null) {
                        const url = match[1];
                        if (!url.includes('${')) {
                            foundUrls.push(url);
                        }
                    }
                    
                    // Pattern for template literals: `${CONST}/path` or `${CONST}path`
                    // Captures the full template literal content
                    // Use cleanedData to skip commented-out URLs
                    const templatePattern = /`(\$\{([A-Z_][A-Z0-9_]*)\}[^`]*)`/g;
                    while ((match = templatePattern.exec(cleanedData)) !== null) {
                        let templateValue = match[1];
                        const constName = match[2];
                        
                        // Substitute the constant if we have it
                        if (constants[constName]) {
                            templateValue = templateValue.replace(`\${${constName}}`, constants[constName]);
                        }
                        
                        // Check for any remaining ${...} that we might have missed
                        // Try to resolve them from our constants
                        const remainingVars = templateValue.match(/\$\{([A-Z_][A-Z0-9_]*)\}/g);
                        if (remainingVars) {
                            for (const varMatch of remainingVars) {
                                const varName = varMatch.slice(2, -1); // Remove ${ and }
                                if (constants[varName]) {
                                    templateValue = templateValue.replace(varMatch, constants[varName]);
                                }
                            }
                        }
                        
                        // Only add if it's a complete URL (no unresolved variables)
                        if (templateValue.startsWith('http') && !templateValue.includes('${')) {
                            foundUrls.push(templateValue);
                        }
                    }
                    
                    // Pattern for template literals with object property access: `${object.PROPERTY}/path`
                    // e.g., `${links.OCM_CLI_RELEASES_LATEST}/ocm_linux_amd64.zip`
                    const objectTemplatePattern = /`(\$\{([a-z]+)\.([A-Z_][A-Z0-9_]*)\}[^`]*)`/g;
                    while ((match = objectTemplatePattern.exec(cleanedData)) !== null) {
                        let templateValue = match[1];
                        const objectName = match[2]; // e.g., 'links'
                        const propertyName = match[3]; // e.g., 'OCM_CLI_RELEASES_LATEST'
                        
                        // Look up the property in the 'links' object within the same file
                        // First, try to find it as a direct constant
                        if (constants[propertyName]) {
                            templateValue = templateValue.replace(`\${${objectName}.${propertyName}}`, constants[propertyName]);
                        } else {
                            // Try to find it in the links/supportLinks object definition
                            // Pattern: PROPERTY_NAME: 'value' or PROPERTY_NAME: `template`
                            const linkDefPattern = new RegExp(`${propertyName}:\\s*['"\`]([^'"\`]+)['"\`]`);
                            const linkMatch = data.match(linkDefPattern);
                            if (linkMatch) {
                                let linkValue = linkMatch[1];
                                // If the link value itself uses a constant, resolve it
                                const constRef = linkValue.match(/\$\{([A-Z_][A-Z0-9_]*)\}/);
                                if (constRef && constants[constRef[1]]) {
                                    linkValue = linkValue.replace(constRef[0], constants[constRef[1]]);
                                }
                                templateValue = templateValue.replace(`\${${objectName}.${propertyName}}`, linkValue);
                            }
                        }
                        
                        // Only add if it's a complete URL (no unresolved variables)
                        if (templateValue.startsWith('http') && !templateValue.includes('${')) {
                            foundUrls.push(templateValue);
                        }
                    }
                    
                    // Step 3: Filter out base URLs that are just constants (not actual link targets)
                    // These patterns indicate a base URL used to build other URLs, not a link itself
                    // Note: We DON'T filter /latest$ because some URLs like github.com/.../releases/latest are valid
                    // Note: We DON'T filter /support/$ because SUPPORT_HOME is a valid link target
                    const baseUrlPatterns = [
                        /\/html$/,                    // Docs base ending in /html
                        /\/html\/$/,                  // Docs base ending in /html/
                        /\/latest\/$/,                // Mirror base ending in /latest/ (with trailing slash = base path)
                        /\/en$/,                      // Base path ending in /en
                        /\/en\/$/,                    // Base path ending in /en/
                        /\/articles\/$/,              // access.redhat.com/articles/ (base path only, not link target)
                        /\/solutions\/$/,             // access.redhat.com/solutions/ (base path only, not link target)
                        /\/security\/$/,              // access.redhat.com/security/ (base path only, not link target)
                    ];
                    
                    // Also filter out URLs that exactly match constant values (they're base URLs)
                    const constantValues = new Set(Object.values(constants));
                    
                    const filteredUrls = foundUrls.filter(url => {
                        // Skip if it's an exact constant value (base URL)
                        if (constantValues.has(url)) {
                            return false;
                        }
                        // Skip if it matches a base URL pattern
                        for (const pattern of baseUrlPatterns) {
                            if (pattern.test(url)) {
                                return false;
                            }
                        }
                        // Skip URLs with control characters (malformed captures)
                        if (/[\x00-\x1F]/.test(url)) {
                            return false;
                        }
                        // Skip URLs with trailing spaces or text (malformed captures)
                        if (/\s[A-Z_]+:/.test(url)) {
                            return false;
                        }
                        return true;
                    });
                    
                    console.log(`📋 ${filename}: found ${filteredUrls.length} URLs (filtered from ${foundUrls.length}, ${Object.keys(constants).length} constants)`);
                    resolve(filteredUrls);
                });
            });
            
            req.on('error', (err) => {
                console.error(`📋 ${filename}: error - ${err.message}`);
                resolve([]);
            });
            req.end();
        });
    };
    
    try {
        // Fetch all source files in parallel (mirrors getAllExternalLinks behavior)
        const results = await Promise.all(
            DOC_LINKS_SOURCE_FILES.map(extractUrlsFromFile)
        );
        
        // Combine and deduplicate all URLs
        results.flat().forEach(url => urls.add(url));
        
        const urlList = Array.from(urls).sort();
        console.log(`📋 Total: ${urlList.length} unique URLs from ${DOC_LINKS_SOURCE_FILES.length} source files`);
        
        // Cache the URL list
        docLinksCache.urlList = urlList;
        docLinksCache.urlListFetchedAt = now;
        
        return urlList;
    } catch (err) {
        console.error('Error fetching doc link URLs:', err);
        return docLinksCache.urlList || [];
    }
};

// Check a single URL with HEAD request, fallback to GET on 405
// This matches check-links.mjs behavior: fetchWithFallback()
const checkUrl = async (url) => {
    if (url.startsWith('mailto:')) {
        return { url, status: 'skipped', category: 'skipped' };
    }
    
    // Helper to make HTTP request
    const makeRequest = (targetUrl, method) => {
        return new Promise((resolve) => {
            try {
                const parsedUrl = new URL(targetUrl);
                const isHttps = parsedUrl.protocol === 'https:';
                const httpModule = isHttps ? https : require('http');
                
                const options = {
                    hostname: parsedUrl.hostname,
                    path: parsedUrl.pathname + parsedUrl.search,
                    method: method,
                    timeout: 10000,
                    headers: {
                        'User-Agent': 'OCMUI-Team-Dashboard/1.0 (Link Checker; +https://github.com/RedHatInsights/uhc-portal)'
                    }
                };
                
                const req = httpModule.request(options, (res) => {
                    // For GET requests, consume the response body to properly close connection
                    if (method === 'GET') {
                        res.resume();
                    }
                    resolve({
                        status: res.statusCode,
                        headers: res.headers
                    });
                });
                
                req.on('error', (err) => {
                    resolve({ error: err.message });
                });
                
                req.on('timeout', () => {
                    req.destroy();
                    resolve({ error: 'Request timed out' });
                });
                
                req.end();
            } catch (err) {
                resolve({ error: err.message });
            }
        });
    };
    
    // Try HEAD first
    let response = await makeRequest(url, 'HEAD');
    
    // If HEAD returns 405 (Method Not Allowed), fallback to GET
    // This matches check-links.mjs fetchWithFallback() behavior
    if (response.status === 405) {
        response = await makeRequest(url, 'GET');
    }
    
    // Handle errors
    if (response.error) {
        return {
            url,
            status: 'error',
            category: 'request_error',
            error: response.error
        };
    }
    
    const status = response.status;
    let result = { url, status };
    
    // Categorize result
    if (status >= 200 && status < 300) {
        result.category = 'success';
    } else if (status >= 300 && status < 400) {
        result.category = 'redirect';
        const location = response.headers.location;
        if (location) {
            try {
                result.redirectUrl = new URL(location, url).toString();
            } catch {
                result.redirectUrl = location;
            }
        }
    } else if (status >= 400 && status < 500) {
        result.category = 'client_error';
    } else if (status >= 500) {
        result.category = 'server_error';
    }
    
    return result;
};

// Test redirect destination with timeout
const checkRedirectDestination = async (result, timeoutMs = 8000) => {
    if (result.category !== 'redirect' || !result.redirectUrl) {
        return result;
    }
    
    try {
        // Add a timeout to prevent hanging on slow redirects
        const timeoutPromise = new Promise((_, reject) => {
            setTimeout(() => reject(new Error('Redirect check timed out')), timeoutMs);
        });
        
        const redirectResult = await Promise.race([
            checkUrl(result.redirectUrl),
            timeoutPromise
        ]);
        
        result.redirectStatus = redirectResult.status;
        if (redirectResult.category === 'request_error') {
            result.redirectError = redirectResult.error;
        }
    } catch (err) {
        result.redirectError = err.message;
        result.redirectStatus = 'timeout';
    }
    
    return result;
};

// Run full URL check with optional progress callback
const runDocLinksCheck = async (onProgress = null) => {
    console.log('🔍 Starting doc links health check...');
    const startTime = Date.now();
    
    // Progress callback helper
    const reportProgress = (stage, current, total, message) => {
        if (onProgress) {
            onProgress({ stage, current, total, message });
        }
    };
    
    reportProgress('fetching', 0, 0, 'Fetching URL list from uhc-portal...');
    
    const urls = await fetchDocLinkUrls();
    if (urls.length === 0) {
        throw new Error('No URLs found to check');
    }
    
    console.log(`🔍 Checking ${urls.length} URLs...`);
    reportProgress('checking', 0, urls.length, `Found ${urls.length} URLs to check`);
    
    // Check URLs in batches to avoid overwhelming servers
    const batchSize = 20;
    const results = [];
    
    for (let i = 0; i < urls.length; i += batchSize) {
        const batch = urls.slice(i, i + batchSize);
        const batchResults = await Promise.all(batch.map(checkUrl));
        results.push(...batchResults);
        
        const checked = Math.min(i + batchSize, urls.length);
        const percent = Math.round((checked / urls.length) * 100);
        reportProgress('checking', checked, urls.length, `Checking URLs: ${checked}/${urls.length} (${percent}%)`);
        
        // Small delay between batches
        if (i + batchSize < urls.length) {
            await new Promise(resolve => setTimeout(resolve, 100));
        }
    }
    
    // Check redirect destinations (with timeout to prevent API freeze)
    console.log('🔍 Checking redirect destinations...');
    const redirects = results.filter(r => r.category === 'redirect');
    reportProgress('redirects', 0, redirects.length, `Testing ${redirects.length} redirect destinations...`);
    
    // Process redirects in batches with individual timeouts
    const redirectBatchSize = 10;
    for (let i = 0; i < redirects.length; i += redirectBatchSize) {
        const batch = redirects.slice(i, i + redirectBatchSize);
        await Promise.all(batch.map(r => checkRedirectDestination(r, 8000)));
        
        const checked = Math.min(i + redirectBatchSize, redirects.length);
        const percent = Math.round((checked / redirects.length) * 100);
        reportProgress('redirects', checked, redirects.length, `Testing redirects: ${checked}/${redirects.length} (${percent}%)`);
        
        // Small delay between batches
        if (i + redirectBatchSize < redirects.length) {
            await new Promise(resolve => setTimeout(resolve, 50));
        }
    }
    
    // Calculate summary
    const summary = {
        total: results.length,
        success: results.filter(r => r.category === 'success').length,
        redirects: results.filter(r => r.category === 'redirect').length,
        redirectErrors: results.filter(r => r.category === 'redirect' && r.redirectStatus && (r.redirectStatus < 200 || r.redirectStatus >= 300)).length,
        clientErrors: results.filter(r => r.category === 'client_error').length,
        serverErrors: results.filter(r => r.category === 'server_error').length,
        requestErrors: results.filter(r => r.category === 'request_error').length,
        skipped: results.filter(r => r.category === 'skipped').length
    };
    
    // Sort results: errors first, then redirects, then success
    results.sort((a, b) => {
        const categoryOrder = {
            'client_error': 0,
            'server_error': 1,
            'request_error': 2,
            'redirect': 3,
            'success': 4,
            'skipped': 5
        };
        const orderA = categoryOrder[a.category] ?? 99;
        const orderB = categoryOrder[b.category] ?? 99;
        if (orderA !== orderB) return orderA - orderB;
        return a.url.localeCompare(b.url);
    });
    
    const duration = ((Date.now() - startTime) / 1000).toFixed(1);
    console.log(`✅ Doc links check completed in ${duration}s: ${summary.total} URLs, ${summary.clientErrors + summary.serverErrors + summary.requestErrors} errors`);
    
    return { results, summary };
};

// Doc links status endpoint
app.get('/api/doc-links/status', async (req, res) => {
    const hasCache = !!(docLinksCache.results && docLinksCache.lastChecked);
    const cacheAge = hasCache ? Date.now() - new Date(docLinksCache.lastChecked).getTime() : null;
    
    res.json({
        hasCachedResults: hasCache,
        lastChecked: docLinksCache.lastChecked,
        cacheAgeMs: cacheAge,
        urlCount: docLinksCache.urlList?.length || 0,
        sources: {
            installLinks: DOC_LINKS_INSTALL_URL,
            supportLinks: DOC_LINKS_SUPPORT_URL
        }
    });
});

// Server-Sent Events endpoint for doc links with progress updates
app.get('/api/doc-links/stream', async (req, res) => {
    const forceRefresh = req.query.refresh === 'true';
    const now = Date.now();
    
    // Set SSE headers
    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');
    res.setHeader('X-Accel-Buffering', 'no'); // Disable nginx buffering
    
    // Helper to send SSE events
    const sendEvent = (event, data) => {
        res.write(`event: ${event}\n`);
        res.write(`data: ${JSON.stringify(data)}\n\n`);
    };
    
    // Check cache first (unless forcing refresh)
    if (!forceRefresh && docLinksCache.results && docLinksCache.lastChecked) {
        const cacheAge = now - new Date(docLinksCache.lastChecked).getTime();
        if (cacheAge < DOC_LINKS_CACHE_TTL) {
            console.log(`📦 SSE: Returning cached doc links results (age: ${Math.round(cacheAge/1000)}s)`);
            sendEvent('complete', {
                success: true,
                results: docLinksCache.results,
                summary: docLinksCache.summary,
                lastChecked: docLinksCache.lastChecked,
                source: 'cache'
            });
            res.end();
            return;
        }
    }
    
    try {
        // Progress callback for SSE updates
        const onProgress = (progress) => {
            sendEvent('progress', progress);
        };
        
        const { results, summary } = await runDocLinksCheck(onProgress);
        
        // Update cache
        docLinksCache.results = results;
        docLinksCache.summary = summary;
        docLinksCache.lastChecked = new Date().toISOString();
        
        sendEvent('complete', {
            success: true,
            results,
            summary,
            lastChecked: docLinksCache.lastChecked,
            source: 'fresh'
        });
    } catch (err) {
        console.error('Doc links SSE check error:', err);
        
        if (docLinksCache.results) {
            sendEvent('complete', {
                success: true,
                results: docLinksCache.results,
                summary: docLinksCache.summary,
                lastChecked: docLinksCache.lastChecked,
                source: 'stale_cache',
                warning: `Check failed: ${err.message}. Showing cached results.`
            });
        } else {
            sendEvent('error', {
                success: false,
                error: err.message || 'Failed to check doc links'
            });
        }
    }
    
    res.end();
});

// Main doc links endpoint - returns cached results or runs check
app.get('/api/doc-links', async (req, res) => {
    const forceRefresh = req.query.refresh === 'true';
    const now = Date.now();
    
    // Return cached results if valid and not forcing refresh
    if (!forceRefresh && docLinksCache.results && docLinksCache.lastChecked) {
        const cacheAge = now - new Date(docLinksCache.lastChecked).getTime();
        if (cacheAge < DOC_LINKS_CACHE_TTL) {
            console.log(`📦 Returning cached doc links results (age: ${Math.round(cacheAge/1000)}s)`);
            return res.json({
                success: true,
                results: docLinksCache.results,
                summary: docLinksCache.summary,
                lastChecked: docLinksCache.lastChecked,
                source: 'cache'
            });
        }
    }
    
    try {
        const { results, summary } = await runDocLinksCheck();
        
        // Update cache
        docLinksCache.results = results;
        docLinksCache.summary = summary;
        docLinksCache.lastChecked = new Date().toISOString();
        
        res.json({
            success: true,
            results,
            summary,
            lastChecked: docLinksCache.lastChecked,
            source: 'fresh'
        });
    } catch (err) {
        console.error('Doc links check error:', err);
        
        // If we have stale cache, return it with a warning
        if (docLinksCache.results) {
            return res.json({
                success: true,
                results: docLinksCache.results,
                summary: docLinksCache.summary,
                lastChecked: docLinksCache.lastChecked,
                source: 'stale_cache',
                warning: `Check failed: ${err.message}. Showing cached results.`
            });
        }
        
        res.status(500).json({
            success: false,
            error: err.message || 'Failed to check doc links'
        });
    }
});

// Serve React app for all other routes (SPA routing support)
app.get('*', (req, res) => {
    res.sendFile(path.join(__dirname, '../dist/index.html'));
});

app.listen(PORT, () => {
    console.log(`🚀 OCMUI Team Dashboard server running at http://localhost:${PORT}`);
    console.log(`📊 Dashboard: http://localhost:${PORT}`);
    console.log(`⚙️  Settings: http://localhost:${PORT}/#settings`);
    console.log(`🕐 Timeboard: http://localhost:${PORT}/#timeboard`);
    console.log(`🔧 JIRA API endpoints:`);
    console.log(`   - Test: http://localhost:${PORT}/api/test-jira`);
    console.log(`   - Single ticket: http://localhost:${PORT}/api/jira-ticket`);
    console.log(`   - Sprint tickets: http://localhost:${PORT}/api/jira-sprint-tickets`);
});
