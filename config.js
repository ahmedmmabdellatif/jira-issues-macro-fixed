module.exports = {
  // Your add-on will use this as the base URL for the Atlassian Connect Express (ACE) framework
  // You can set this to the URL of your deployed application
  baseUrl: process.env.BASE_URL || 'https://jira-issues-fixed.herokuapp.com',
  
  // This is the port your Express server will listen on
  port: process.env.PORT || 3000,
  
  // Use environment variables for credentials
  credentials: {
    username: process.env.USERNAME || 'admin',
    password: process.env.PASSWORD || 'admin'
  },
  
  // Enable JWT authentication for Atlassian Connect
  auth: {
    type: 'jwt'
  },
  
  // Logging configuration
  logging: {
    level: process.env.LOGGING_LEVEL || 'info'
  },
  
  // Whitelist of domains that are allowed to make requests to your add-on
  whitelist: [
    '*.atlassian.net',
    '*.jira.com',
    '*.jira-dev.com'
  ]
};
