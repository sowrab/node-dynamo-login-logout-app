const express = require('express');
const session = require('express-session');
const bodyParser = require('body-parser');
const AWS = require('aws-sdk');
const { v4: uuidv4 } = require('uuid');

const app = express();
const port = 80;

// Configure AWS DynamoDB
AWS.config.update({
  region: 'us-east-1' // Update to your region
});
const dynamodb = new AWS.DynamoDB();
const docClient = new AWS.DynamoDB.DocumentClient();

// Create table if not exists
const tableName = "UserActivity";

const createTableIfNotExists = async () => {
  const tables = await dynamodb.listTables().promise();
  if (!tables.TableNames.includes(tableName)) {
    const params = {
      TableName: tableName,
      KeySchema: [
        { AttributeName: "username", KeyType: "HASH" },
        { AttributeName: "timestamp", KeyType: "RANGE" }
      ],
      AttributeDefinitions: [
        { AttributeName: "username", AttributeType: "S" },
        { AttributeName: "timestamp", AttributeType: "S" }
      ],
      ProvisionedThroughput: {
        ReadCapacityUnits: 5,
        WriteCapacityUnits: 5
      }
    };
    await dynamodb.createTable(params).promise();
    console.log("Created table:", tableName);
  }
};

// Middleware and config
app.set('view engine', 'ejs');
app.use(bodyParser.urlencoded({ extended: false }));
app.use(session({
  secret: 'secret_key',
  resave: false,
  saveUninitialized: true
}));

// Dummy user data
const users = {
  'admin': 'sowrab05',
  'agent': 'agentsowrab',
  'agent2': 'agentsowrab2'
};

// Helpers
const recordActivity = async (username, eventType) => {
  const timestamp = new Date().toISOString();
  const params = {
    TableName: tableName,
    Item: {
      username,
      timestamp,
      eventType
    }
  };
  await docClient.put(params).promise();
};

const getActivity = async (username) => {
  const params = {
    TableName: tableName,
    KeyConditionExpression: "username = :u",
    ExpressionAttributeValues: {
      ":u": username
    },
    ScanIndexForward: true // Oldest to newest
  };
  const data = await docClient.query(params).promise();
  return data.Items;
};

// Routes

app.get('/', (req, res) => {
  res.redirect('/login');
});

app.get('/login', (req, res) => {
  res.render('login', { error: null });
});

app.post('/login', async (req, res) => {
  const { username, password } = req.body;
  if (users[username] && users[username] === password) {
    req.session.user = { username };
    await recordActivity(username, 'login');
    res.redirect('/dashboard');
  } else {
    res.render('login', { error: 'Invalid credentials' });
  }
});

app.get('/dashboard', (req, res) => {
  if (!req.session.user) return res.redirect('/login');
  res.render('dashboard', { user: req.session.user });
});

app.get('/profile', async (req, res) => {
  if (!req.session.user) return res.redirect('/login');
  const username = req.session.user.username;
  const activity = await getActivity(username);

  // Find the second to last login time (previous login)
  const loginEvents = activity.filter(item => item.eventType === 'login');
  const lastLogin = loginEvents.length >= 2
    ? loginEvents[loginEvents.length - 2].timestamp
    : loginEvents[loginEvents.length - 1]?.timestamp;

  res.render('profile', {
    user: req.session.user,
    activity,
    lastLogin
  });
});

app.get('/logout', async (req, res) => {
  if (req.session.user) {
    await recordActivity(req.session.user.username, 'logout');
  }
  req.session.destroy(() => {
    res.redirect('/login');
  });
});

// Start server
createTableIfNotExists().then(() => {
  app.listen(port, () => {
    console.log(`Server running on http://localhost:${port}`);
  });
});

