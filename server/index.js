import express from 'express';
import path from 'path';
import https from 'https';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const app = express();
const PORT = 3017;

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

// JIRA ticket fetch endpoint
app.post('/api/jira-ticket', async (req, res) => {
    const { jiraId, token } = req.body;
    
    if (!jiraId || !token) {
        return res.status(400).json({ error: 'JIRA ID and token are required' });
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
app.post('/api/test-jira', async (req, res) => {
    const { token } = req.body;
    
    if (!token) {
        return res.status(400).json({ error: 'Token is required' });
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
app.post('/api/jira-sprint-tickets', async (req, res) => {
    const { jiraUsername, token } = req.body;
    
    if (!jiraUsername || !token) {
        return res.status(400).json({ error: 'JIRA username and token are required' });
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
