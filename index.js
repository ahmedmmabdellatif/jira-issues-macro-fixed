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
  const descriptor = JSON.parse(fs.readFileSync('./atlassian-connect.json', 'utf8'));
  descriptor.baseUrl = config.baseUrl;
  res.json(descriptor);
});

// Installation lifecycle - handle both GET and POST requests
app.get('/installed', (req, res) => {
  res.status(200).send('Installed endpoint is ready to receive installation data via POST');
});

app.post('/installed', (req, res) => {
  const clientKey = req.body.clientKey;
  const sharedSecret = req.body.sharedSecret;
  const baseUrl = req.body.baseUrl;
  
  tenants[clientKey] = {
    clientKey,
    sharedSecret,
    baseUrl
  };
  
  console.log(`Tenant installed: ${clientKey} at ${baseUrl}`);
  res.sendStatus(204);
});

app.get('/uninstalled', (req, res) => {
  res.status(200).send('Uninstalled endpoint is ready to receive uninstallation data via POST');
});

app.post('/uninstalled', (req, res) => {
  const clientKey = req.body.clientKey;
  delete tenants[clientKey];
  console.log(`Tenant uninstalled: ${clientKey}`);
  res.sendStatus(204);
});

// Add lifecycle endpoint to handle both GET and POST
app.get('/lifecycle', (req, res) => {
  res.status(200).send('Lifecycle endpoint is ready to receive lifecycle events via POST');
});

app.post('/lifecycle', (req, res) => {
  const event = req.body;
  console.log('Lifecycle event received:', event);
  
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
  
  res.status(200).send('Lifecycle event processed');
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
          
          // Initialize when the page loads
          document.addEventListener('DOMContentLoaded', function() {
            showTab('basic');
            
            // Initialize AP if available
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
        <h2>Jira Issues Macro</h2>
        
        <div class="tabs">
          <button id="basic-button" class="tab-button" onclick="showTab('basic')">Basic</button>
          <button id="advanced-button" class="tab-button" onclick="showTab('advanced')">Advanced</button>
        </div>
        
        <div id="basic" class="tab">
          <div class="form-group">
            <label for="project">Project</label>
            <select id="project">
              <option value="TEST">TEST</option>
              <option value="DEMO">DEMO</option>
            </select>
          </div>
          
          <div class="form-group">
            <label for="issueType">Issue Type</label>
            <select id="issueType">
              <option value="">Any</option>
              <option value="Bug">Bug</option>
              <option value="Task">Task</option>
              <option value="Story">Story</option>
            </select>
          </div>
          
          <div class="form-group">
            <label for="status">Status</label>
            <select id="status">
              <option value="">Any</option>
              <option value="To Do">To Do</option>
              <option value="In Progress">In Progress</option>
              <option value="Done">Done</option>
            </select>
          </div>
          
          <button onclick="
            const project = document.getElementById('project').value;
            const issueType = document.getElementById('issueType').value;
            const status = document.getElementById('status').value;
            
            let jql = 'project = ' + project;
            if (issueType) jql += ' AND issuetype = \"' + issueType + '\"';
            if (status) jql += ' AND status = \"' + status + '\"';
            
            document.getElementById('jql').value = jql;
            showTab('advanced');
          ">Generate JQL</button>
        </div>
        
        <div id="advanced" class="tab">
          <div class="form-group">
            <label for="jql">JQL Query</label>
            <input type="text" id="jql" placeholder="e.g., project = TEST AND status = 'In Progress'" value="project = TEST">
          </div>
          
          <div class="form-group">
            <label for="maxResults">Maximum Results</label>
            <input type="number" id="maxResults" min="1" max="100" value="20">
          </div>
          
          <div class="form-group">
            <label for="columns">Columns</label>
            <input type="text" id="columns" value="type,key,summary,assignee,priority,status,updated">
          </div>
          
          <button onclick="saveAndClose()">Save</button>
          
          <div class="examples">
            <h3>Example Queries</h3>
            <div class="example" onclick="useExample('project = TEST')">All issues in TEST project</div>
            <div class="example" onclick="useExample('project = TEST AND status = \\'In Progress\\'')">In-progress issues in TEST project</div>
            <div class="example" onclick="useExample('project = TEST AND assignee = currentUser()')">My issues in TEST project</div>
          </div>
        </div>
      </body>
    </html>
  `);
});

// Macro rendering endpoint
app.get('/macro', async (req, res) => {
  try {
    // Get parameters from the request
    const jql = req.query.jql || 'project = TEST';
    const maxResults = parseInt(req.query.maxResults || '10', 10);
    const columns = (req.query.columns || 'type,key,summary,status').split(',');
    
    // Get Jira base URL from the request
    const baseUrl = req.query.baseUrl || 'https://your-jira-instance.atlassian.net';
    
    // Mock data for testing
    const issues = [
      {
        key: 'TEST-1',
        fields: {
          issuetype: {
            iconUrl: 'https://your-jira-instance.atlassian.net/images/icons/issuetypes/story.svg',
            name: 'Story'
          },
          summary: 'Implement Jira Issues macro',
          assignee: {
            displayName: 'John Doe'
          },
          priority: {
            iconUrl: 'https://your-jira-instance.atlassian.net/images/icons/priorities/medium.svg',
            name: 'Medium'
          },
          status: {
            name: 'In Progress'
          },
          updated: '2023-04-01T12:00:00.000Z'
        }
      },
      {
        key: 'TEST-2',
        fields: {
          issuetype: {
            iconUrl: 'https://your-jira-instance.atlassian.net/images/icons/issuetypes/bug.svg',
            name: 'Bug'
          },
          summary: 'Fix styling issues in the macro',
          assignee: {
            displayName: 'Jane Smith'
          },
          priority: {
            iconUrl: 'https://your-jira-instance.atlassian.net/images/icons/priorities/high.svg',
            name: 'High'
          },
          status: {
            name: 'To Do'
          },
          updated: '2023-04-02T14:30:00.000Z'
        }
      },
      {
        key: 'TEST-3',
        fields: {
          issuetype: {
            iconUrl: 'https://your-jira-instance.atlassian.net/images/icons/issuetypes/task.svg',
            name: 'Task'
          },
          summary: 'Deploy macro to production',
          assignee: null,
          priority: {
            iconUrl: 'https://your-jira-instance.atlassian.net/images/icons/priorities/low.svg',
            name: 'Low'
          },
          status: {
            name: 'Done'
          },
          updated: '2023-04-03T09:15:00.000Z'
        }
      }
    ];
    
    const totalIssues = issues.length;
    
    // Generate HTML for the macro
    let html = `
      <!DOCTYPE html>
      <html>
        <head>
          <meta charset="utf-8">
          <style>
            body {
              font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Oxygen, Ubuntu, "Fira Sans", "Droid Sans", "Helvetica Neue", sans-serif;
              font-size: 14px;
              color: #172B4D;
              margin: 0;
              padding: 0;
            }
            .jira-issues-table {
              width: 100%;
              border-collapse: collapse;
              border: 1px solid #DFE1E6;
            }
            .jira-issues-table th {
              background-color: #F4F5F7;
              text-align: left;
              padding: 8px;
              border-bottom: 2px solid #DFE1E6;
              font-weight: 600;
            }
            .jira-issues-table td {
              padding: 8px;
              border-bottom: 1px solid #DFE1E6;
              vertical-align: top;
            }
            .jira-issues-table tr:hover {
              background-color: #F4F5F7;
            }
            .jira-key {
              color: #0052CC;
              text-decoration: none;
              font-weight: 500;
            }
            .jira-key:hover {
              text-decoration: underline;
            }
            .jira-summary {
              max-width: 300px;
              word-wrap: break-word;
            }
            .jira-status {
              display: inline-block;
              padding: 2px 4px;
              border-radius: 3px;
              font-size: 12px;
            }
            .jira-status-todo {
              background-color: #DEEBFF;
              color: #0747A6;
            }
            .jira-status-inprogress {
              background-color: #E6FCFF;
              color: #006644;
            }
            .jira-status-done {
              background-color: #E3FCEF;
              color: #006644;
            }
            .jira-footer {
              margin-top: 10px;
              font-size: 12px;
              color: #6B778C;
              display: flex;
              justify-content: space-between;
            }
            .jira-type-icon, .jira-priority-icon {
              width: 16px;
              height: 16px;
              vertical-align: middle;
            }
          </style>
        </head>
        <body>
          <table class="jira-issues-table">
            <thead>
              <tr>
    `;
    
    // Add table headers based on columns
    columns.forEach(column => {
      const columnName = column.charAt(0).toUpperCase() + column.slice(1);
      html += `<th>${columnName}</th>`;
    });
    
    html += `
              </tr>
            </thead>
            <tbody>
    `;
    
    // Add table rows for each issue
    issues.forEach(issue => {
      html += '<tr>';
      
      columns.forEach(column => {
        switch (column) {
          case 'type':
            const typeIcon = issue.fields.issuetype.iconUrl;
            const typeName = issue.fields.issuetype.name;
            html += `<td><img src="${typeIcon}" class="jira-type-icon" alt="${typeName}" title="${typeName}" /></td>`;
            break;
            
          case 'key':
            const issueKey = issue.key;
            const issueUrl = `${baseUrl}/browse/${issueKey}`;
            html += `<td><a href="${issueUrl}" class="jira-key" target="_blank">${issueKey}</a></td>`;
            break;
            
          case 'summary':
            const summary = issue.fields.summary;
            html += `<td class="jira-summary">${summary}</td>`;
            break;
            
          case 'assignee':
            const assignee = issue.fields.assignee ? issue.fields.assignee.displayName : 'Unassigned';
            html += `<td>${assignee}</td>`;
            break;
            
          case 'priority':
            const priorityIcon = issue.fields.priority ? issue.fields.priority.iconUrl : '';
            const priorityName = issue.fields.priority ? issue.fields.priority.name : 'None';
            html += `<td><img src="${priorityIcon}" class="jira-priority-icon" alt="${priorityName}" title="${priorityName}" /></td>`;
            break;
            
          case 'status':
            const status = issue.fields.status.name;
            let statusClass = 'jira-status-todo';
            if (status.toLowerCase().includes('progress')) {
              statusClass = 'jira-status-inprogress';
            } else if (status.toLowerCase().includes('done') || status.toLowerCase().includes('closed')) {
              statusClass = 'jira-status-done';
            }
            html += `<td><span class="jira-status ${statusClass}">${status}</span></td>`;
            break;
            
          case 'updated':
            const updated = new Date(issue.fields.updated).toLocaleString();
            html += `<td>${updated}</td>`;
            break;
            
          default:
            html += '<td>-</td>';
        }
      });
      
      html += '</tr>';
    });
    
    html += `
            </tbody>
          </table>
          <div class="jira-footer">
            <div>Showing ${issues.length} of ${totalIssues} issues</div>
            <div>Synced just now</div>
          </div>
        </body>
      </html>
    `;
    
    res.send(html);
  } catch (err) {
    console.error('Error rendering macro:', err);
    res.status(500).send(`
      <html>
        <head>
          <style>
            .error-container {
              border: 1px solid #FF5630;
              background-color: #FFEBE6;
              padding: 10px;
              border-radius: 3px;
              font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Oxygen, Ubuntu, "Fira Sans", "Droid Sans", "Helvetica Neue", sans-serif;
            }
            .error-title {
              color: #DE350B;
              font-weight: bold;
              margin-bottom: 5px;
            }
            .error-message {
              color: #172B4D;
            }
          </style>
        </head>
        <body>
          <div class="error-container">
            <div class="error-title">Error loading Jira issues</div>
            <div class="error-message">${err.message || 'An error occurred while fetching issues from Jira.'}</div>
          </div>
        </body>
      </html>
    `);
  }
});

// Error handling
if (process.env.NODE_ENV === 'development') {
  app.use(errorHandler());
}

// Start the server
const port = process.env.PORT || 3000;
app.listen(port, '0.0.0.0', () => {
  console.log(`Jira Issues Confluence Macro app listening on port ${port}`);
});

module.exports = app;
