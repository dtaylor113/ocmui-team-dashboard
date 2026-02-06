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
                                'customfield_12313941', // Common Red Hat JIRA Target Date
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
        const jql = `parent = ${parentKey} OR "Epic Link" = ${parentKey} OR "Parent Link" = ${parentKey}`;
        const encodedJql = encodeURIComponent(jql);

        const apiPath = `/rest/api/2/search?jql=${encodedJql}&maxResults=100&fields=key,summary,assignee,status,issuetype`;

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
                        const issues = (searchResult.issues || []).map((issue) => ({
                            key: issue.key,
                            summary: issue.fields?.summary || 'No summary',
                            assignee: issue.fields?.assignee?.displayName || 'Unassigned',
                            status: issue.fields?.status?.name || 'Unknown',
                            type: issue.fields?.issuetype?.name || 'Task'
                        }));
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
