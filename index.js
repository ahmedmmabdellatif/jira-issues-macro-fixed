const express = require('express');
const bodyParser = require('body-parser');
const compression = require('compression');
const cookieParser = require('cookie-parser');
const errorHandler = require('errorhandler');
const morgan = require('morgan');
const path = require('path');
const fs = require('fs');
const axios = require('axios');
const jwt = require('atlassian-jwt');
const config = require('./config');

// Initialize Express app
const app = express();

// Configure middleware
app.use(compression());
app.use(cookieParser());
app.use(bodyParser.json());
app.use(bodyParser.urlencoded({ extended: false }));
app.use(morgan('dev'));
app.use(express.static(path.join(__dirname, 'public')));

// Store for installed tenants
const tenants = {};

// JWT authentication middleware
const authenticate = async (req, res, next) => {
  try {
    // Skip authentication for the descriptor and static resources
    if (req.path === '/' || req.path === '/atlassian-connect.json' || req.path.startsWith('/images/') || 
        req.path === '/installed' || req.path === '/uninstalled' || req.path === '/lifecycle') {
      console.log(`Skipping authentication for path: ${req.path}`);
      return next();
    }

    const token = req.query.jwt || req.body.jwt || req.headers.authorization;
    if (!token) {
      console.log('No JWT token found');
      return res.status(401).send('Authentication required');
    }

    // Verify the JWT token
    const decoded = jwt.decode(token, '', true);
    const clientKey = decoded.iss;
    
    if (!tenants[clientKey]) {
      console.log(`Tenant ${clientKey} not found`);
      return res.status(401).send('Tenant not found');
    }

    const secret = tenants[clientKey].sharedSecret;
    jwt.verify(token, secret, { algorithms: ['HS256'] });
    
    // Add tenant info to request
    req.tenant = tenants[clientKey];
    next();
  } catch (err) {
    console.error('JWT verification error:', err);
    res.status(401).send('Invalid JWT');
  }
};

// Routes
app.get('/', (req, res) => {
  res.send('Jira Issues Confluence Macro is running!');
});

// Serve the descriptor
app.get('/atlassian-connect.json', (req, res) => {
  console.log('Serving descriptor file');
  const descriptor = JSON.parse(fs.readFileSync('./atlassian-connect.json', 'utf8'));
  res.json(descriptor);
});

// Installation lifecycle - handle both GET and POST requests
app.get('/installed', (req, res) => {
  console.log('GET request to /installed endpoint');
  res.status(200).send('Installed endpoint is ready to receive installation data via POST');
});

app.post('/installed', (req, res) => {
  console.log('POST request to /installed endpoint with body:', JSON.stringify(req.body));
  try {
    const clientKey = req.body.clientKey;
    const sharedSecret = req.body.sharedSecret;
    const baseUrl = req.body.baseUrl;
    
    if (!clientKey || !sharedSecret) {
      console.error('Missing required installation data');
      return res.status(400).send('Missing required installation data');
    }
    
    tenants[clientKey] = {
      clientKey,
      sharedSecret,
      baseUrl
    };
    
    console.log(`Tenant installed: ${clientKey} at ${baseUrl}`);
    // Return 204 No Content as per Atlassian documentation
    return res.status(204).send();
  } catch (error) {
    console.error('Error processing installation:', error);
    return res.status(500).send('Error processing installation');
  }
});

app.get('/uninstalled', (req, res) => {
  console.log('GET request to /uninstalled endpoint');
  res.status(200).send('Uninstalled endpoint is ready to receive uninstallation data via POST');
});

app.post('/uninstalled', (req, res) => {
  console.log('POST request to /uninstalled endpoint with body:', JSON.stringify(req.body));
  try {
    const clientKey = req.body.clientKey;
    
    if (!clientKey) {
      console.error('Missing required uninstallation data');
      return res.status(400).send('Missing required uninstallation data');
    }
    
    delete tenants[clientKey];
    console.log(`Tenant uninstalled: ${clientKey}`);
    // Return 204 No Content as per Atlassian documentation
    return res.status(204).send();
  } catch (error) {
    console.error('Error processing uninstallation:', error);
    return res.status(500).send('Error processing uninstallation');
  }
});

// Add lifecycle endpoint to handle both GET and POST
app.get('/lifecycle', (req, res) => {
  console.log('GET request to /lifecycle endpoint');
  res.status(200).send('Lifecycle endpoint is ready to receive lifecycle events via POST');
});

app.post('/lifecycle', (req, res) => {
  console.log('POST request to /lifecycle endpoint with body:', JSON.stringify(req.body));
  try {
    const event = req.body;
    
    // Handle different lifecycle events
    switch (event.eventType) {
      case 'installed':
        console.log('App installed in Confluence');
        break;
      case 'uninstalled':
        console.log('App uninstalled from Confluence');
        break;
      case 'enabled':
        console.log('App enabled in Confluence');
        break;
      case 'disabled':
        console.log('App disabled in Confluence');
        break;
    }
    
    return res.status(200).send('Lifecycle event processed');
  } catch (error) {
    console.error('Error processing lifecycle event:', error);
    return res.status(500).send('Error processing lifecycle event');
  }
});

// Configuration page
app.get('/config', authenticate, (req, res) => {
  res.send(`
    <html>
      <head>
        <title>Jira Issues Macro Configuration</title>
        <style>
          body { font-family: Arial, sans-serif; margin: 20px; }
          h1 { color: #0052CC; }
          .config-section { margin-bottom: 20px; }
        </style>
      </head>
      <body>
        <h1>Jira Issues Macro Configuration</h1>
        <div class="config-section">
          <p>The Jira Issues Macro is configured and ready to use.</p>
          <p>You can add the macro to your Confluence pages to display Jira issues.</p>
        </div>
      </body>
    </html>
  `);
});

// Documentation page
app.get('/documentation', authenticate, (req, res) => {
  res.send(`
    <html>
      <head>
        <title>Jira Issues Macro Documentation</title>
        <style>
          body { font-family: Arial, sans-serif; margin: 20px; }
          h1, h2 { color: #0052CC; }
          .doc-section { margin-bottom: 20px; }
          code { background-color: #f4f5f7; padding: 2px 4px; border-radius: 3px; }
        </style>
      </head>
      <body>
        <h1>Jira Issues Macro Documentation</h1>
        
        <div class="doc-section">
          <h2>Overview</h2>
          <p>The Jira Issues Macro allows you to display Jira issues in your Confluence pages.</p>
        </div>
        
        <div class="doc-section">
          <h2>Parameters</h2>
          <ul>
            <li><strong>JQL Query</strong>: JQL Query to filter issues (e.g., project = TEST)</li>
            <li><strong>Maximum Results</strong>: Maximum number of issues to display (default: 20)</li>
            <li><strong>Columns</strong>: Columns to display (default: type,key,summary,assignee,priority,status,updated)</li>
          </ul>
        </div>
        
        <div class="doc-section">
          <h2>Examples</h2>
          <p>Basic JQL query: <code>project = TEST</code></p>
          <p>Advanced JQL query: <code>project = TEST AND status = "In Progress" AND assignee = currentUser()</code></p>
        </div>
      </body>
    </html>
  `);
});

// Macro editor
app.get('/macro-editor', authenticate, (req, res) => {
  res.send(`
    <html>
      <head>
        <title>Jira Issues Macro Editor</title>
        <style>
          body { font-family: Arial, sans-serif; margin: 0; padding: 20px; }
          h2 { color: #0052CC; margin-top: 0; }
          .tab { display: none; }
          .tab.active { display: block; }
          .tabs { display: flex; border-bottom: 1px solid #ddd; margin-bottom: 20px; }
          .tab-button { padding: 10px 15px; cursor: pointer; background: #f4f5f7; border: none; margin-right: 5px; }
          .tab-button.active { background: #0052CC; color: white; }
          .form-group { margin-bottom: 15px; }
          label { display: block; margin-bottom: 5px; font-weight: bold; }
          input, select { width: 100%; padding: 8px; box-sizing: border-box; }
          button { background: #0052CC; color: white; border: none; padding: 10px 15px; cursor: pointer; }
          .examples { margin-top: 20px; }
          .example { cursor: pointer; color: #0052CC; margin-bottom: 5px; }
        </style>
        <script src="https://connect-cdn.atl-paas.net/all.js"></script>
        <script>
          function showTab(tabName) {
            // Hide all tabs
            const tabs = document.getElementsByClassName('tab');
            for (let i = 0; i < tabs.length; i++) {
              tabs[i].classList.remove('active');
            }
            
            // Deactivate all buttons
            const buttons = document.getElementsByClassName('tab-button');
            for (let i = 0; i < buttons.length; i++) {
              buttons[i].classList.remove('active');
            }
            
            // Show the selected tab
            document.getElementById(tabName).classList.add('active');
            document.getElementById(tabName + '-button').classList.add('active');
          }
          
          function useExample(example) {
            document.getElementById('jql').value = example;
            showTab('advanced');
          }
          
          function saveAndClose() {
            const jql = document.getElementById('jql').value;
            const maxResults = document.getElementById('maxResults').value;
            const columns = document.getElementById('columns').value;
            
            // Create the macro parameters
            const params = {
              jql: jql,
              maxResults: maxResults,
              columns: columns
            };
            
            // Send the parameters back to Confluence
            if (window.AP) {
              window.AP.require(['confluence'], function(confluence) {
                confluence.saveMacro(params);
                confluence.closeMacroEditor();
              });
            }
          }
          
          // Initialize the editor
          document.addEventListener('DOMContentLoaded', function() {
            showTab('advanced');
            
            // Load existing parameters if available
            if (window.AP) {
              window.AP.require(['confluence'], function(confluence) {
                confluence.getMacroData(function(data) {
                  if (data) {
                    if (data.jql) document.getElementById('jql').value = data.jql;
                    if (data.maxResults) document.getElementById('maxResults').value = data.maxResults;
                    if (data.columns) document.getElementById('columns').value = data.columns;
                  }
                });
              });
            }
          });
        </script>
      </head>
      <body>
        <div class="tabs">
          <button id="advanced-button" class="tab-button" onclick="showTab('advanced')">Advanced</button>
          <button id="examples-button" class="tab-button" onclick="showTab('examples')">Examples</button>
        </div>
        
        <div id="advanced" class="tab">
          <h2>Configure Jira Issues</h2>
          
          <div class="form-group">
            <label for="jql">JQL Query</label>
            <input type="text" id="jql" placeholder="e.g., project = TEST" />
          </div>
          
          <div class="form-group">
            <label for="maxResults">Maximum Results</label>
            <input type="number" id="maxResults" value="20" min="1" max="100" />
          </div>
          
          <div class="form-group">
            <label for="columns">Columns</label>
            <input type="text" id="columns" value="type,key,summary,assignee,priority,status,updated" />
          </div>
          
          <button onclick="saveAndClose()">Save</button>
        </div>
        
        <div id="examples" class="tab">
          <h2>Example JQL Queries</h2>
          
          <div class="examples">
            <div class="example" onclick="useExample('project = TEST')">All issues in project TEST</div>
            <div class="example" onclick="useExample('project = TEST AND status = \\'In Progress\\'')">In Progress issues in project TEST</div>
            <div class="example" onclick="useExample('project = TEST AND assignee = currentUser()')">My issues in project TEST</div>
            <div class="example" onclick="useExample('project = TEST AND created >= -7d')">Issues created in the last week in project TEST</div>
            <div class="example" onclick="useExample('project = TEST AND priority = High')">High priority issues in project TEST</div>
          </div>
        </div>
      </body>
    </html>
  `);
});

// Macro rendering endpoint
app.get('/macro', authenticate, async (req, res) => {
  try {
    const jql = req.query.jql || '';
    const maxResults = parseInt(req.query.maxResults || '20', 10);
    const columns = (req.query.columns || 'type,key,summary,assignee,priority,status,updated').split(',');
    
    // Mock data for now - in a real app, this would fetch from Jira API
    const issues = [
      {
        key: 'TEST-1',
        fields: {
          summary: 'Implement Jira Issues Macro',
          assignee: { displayName: 'John Doe' },
          priority: { name: 'High' },
          status: { name: 'In Progress' },
          updated: '2023-01-15T10:30:45.123+0000',
          issuetype: { name: 'Task', iconUrl: 'https://example.com/task-icon.png' }
        }
      },
      {
        key: 'TEST-2',
        fields: {
          summary: 'Fix bugs in Jira Issues Macro',
          assignee: { displayName: 'Jane Smith' },
          priority: { name: 'Medium' },
          status: { name: 'To Do' },
          updated: '2023-01-14T15:20:30.456+0000',
          issuetype: { name: 'Bug', iconUrl: 'https://example.com/bug-icon.png' }
        }
      }
    ];
    
    // Generate HTML for the macro
    let html = `
      <div class="jira-issues-macro">
        <h3>Jira Issues</h3>
        <p>JQL: ${jql}</p>
        <table style="width: 100%; border-collapse: collapse;">
          <thead>
            <tr>
              ${columns.map(col => `<th style="text-align: left; padding: 8px; border-bottom: 2px solid #ddd;">${col.charAt(0).toUpperCase() + col.slice(1)}</th>`).join('')}
            </tr>
          </thead>
          <tbody>
    `;
    
    issues.forEach(issue => {
      html += '<tr>';
      
      columns.forEach(col => {
        let value = '';
        
        switch (col) {
          case 'type':
            value = `<img src="${issue.fields.issuetype.iconUrl}" alt="${issue.fields.issuetype.name}" title="${issue.fields.issuetype.name}" style="width: 16px; height: 16px;" />`;
            break;
          case 'key':
            value = `<a href="https://example.atlassian.net/browse/${issue.key}" target="_blank">${issue.key}</a>`;
            break;
          case 'summary':
            value = issue.fields.summary;
            break;
          case 'assignee':
            value = issue.fields.assignee ? issue.fields.assignee.displayName : 'Unassigned';
            break;
          case 'priority':
            value = issue.fields.priority ? issue.fields.priority.name : 'None';
            break;
          case 'status':
            value = issue.fields.status ? issue.fields.status.name : 'Unknown';
            break;
          case 'updated':
            value = new Date(issue.fields.updated).toLocaleString();
            break;
          default:
            value = 'N/A';
        }
        
        html += `<td style="padding: 8px; border-bottom: 1px solid #ddd;">${value}</td>`;
      });
      
      html += '</tr>';
    });
    
    html += `
          </tbody>
        </table>
      </div>
    `;
    
    res.send(html);
  } catch (error) {
    console.error('Error rendering macro:', error);
    res.status(500).send('Error rendering Jira Issues Macro');
  }
});

// Error handling
app.use(errorHandler());

// Start the server
const port = process.env.PORT || 3000;
app.listen(port, () => {
  console.log(`Jira Issues Confluence Macro is listening on port ${port}`);
});

module.exports = app;
