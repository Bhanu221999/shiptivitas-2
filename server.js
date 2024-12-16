import express from 'express';
import Database from 'better-sqlite3';

const app = express();

app.use(express.json());

app.get('/', (req, res) => {
  return res.status(200).send({'message': 'SHIPTIVITY API. Read documentation to see API docs'});
});

// keeping one connection alive for the rest of the life application for simplicity
const db = new Database('./clients.db');

const closeDb = () => db.close();
process.on('SIGTERM', closeDb);
process.on('SIGINT', closeDb);


const validateId = (id) => {
  if (Number.isNaN(id)) {
    return {
      valid: false,
      messageObj: {
      'message': 'Invalid id provided.',
      'long_message': 'Id can only be integer.',
      },
    };
  }
  const client = db.prepare('select * from clients where id = ? limit 1').get(id);
  if (!client) {
    return {
      valid: false,
      messageObj: {
      'message': 'Invalid id provided.',
      'long_message': 'Cannot find client with that id.',
      },
    };
  }
  return {
    valid: true,
  };
}


const validatePriority = (priority) => {
  if (Number.isNaN(priority)) {
    return {
      valid: false,
      messageObj: {
      'message': 'Invalid priority provided.',
      'long_message': 'Priority can only be positive integer.',
      },
    };
  }
  return {
    valid: true,
  }
}


const reorderClientsInSwimlane = (clients, status, priority, currentClientId) => {
  const clientsWithSameStatus = clients.filter(client => client.status === status);
  clientsWithSameStatus.sort((a, b) => a.priority - b.priority);

  clientsWithSameStatus.forEach((client, index) => {
    if (client.id === currentClientId) {
      client.priority = priority;
    } else if (client.priority >= priority) {
      client.priority++;
    } else {
      client.priority--;
    }
  });

  return clients;
};


app.get('/api/v1/clients', (req, res) => {
  const status = req.query.status;
  if (status) {
    // status be either 'backlog' | 'in-progress' | 'complete'
    if (status !== 'backlog' && status !== 'in-progress' && status !== 'complete') {
      return res.status(400).send({
        'message': 'Invalid status provided.',
        'long_message': 'Status can only be one of the following: [backlog | in-progress | complete].',
      });
    }
    const clients = db.prepare('select * from clients where status = ?').all(status);
    return res.status(200).send(clients);
  }
  const statement = db.prepare('select * from clients');
  const clients = statement.all();
  return res.status(200).send(clients);
});


app.get('/api/v1/clients/:id', (req, res) => {
  const id = parseInt(req.params.id , 10);
  const { valid, messageObj } = validateId(id);
  if (!valid) {
    res.status(400).send(messageObj);
  }
  return res.status(200).send(db.prepare('select * from clients where id = ?').get(id));
});


app.put('/api/v1/clients/:id', (req, res) => {
  const id = parseInt(req.params.id , 10);
  const { valid, messageObj } = validateId(id);
  if (!valid) {
    res.status(400).send(messageObj);
  }

  let { status, priority } = req.body;
  let clients = db.prepare('select * from clients').all();
  const client = clients.find(client => client.id === id);

  if (status) {
    // Status be either 'backlog' | 'in-progress' | 'complete'.
    if (status !== 'backlog' && status !== 'in-progress' && status !== 'complete') {
      return res.status(400).send({
        'message': 'Invalid status provided.',
        'long_message': 'Status can only be one of the following: [backlog | in-progress | complete].',
      });
    }
  }

  const newStatus = status;
  const oldStatus = client.status;
  const oldPriority = client.priority;

  if (oldStatus === newStatus && priority && oldPriority !== priority) {
    clients = reorderClientsInSwimlane(clients, newStatus, priority, client.id);
  } else if (oldStatus !== newStatus) {
    client.status = newStatus;
    client.priority = priority ? priority - 0.5 : Number.MAX_SAFE_INTEGER;
    clients = reorderClientsInSwimlane(clients, oldStatus, oldPriority, client.id);
    clients = reorderClientsInSwimlane(clients, newStatus, client.priority, client.id);
  }

  // Updating the entire rows of the table.
  const updateStmt = db.prepare('update clients set status = ?, priority = ? where id = ?');
  clients.forEach(client => {
    updateStmt.run(client.status, client.priority, client.id);
  });

  return res.status(200).send(clients);
});

app.listen(3001);
console.log('app running on port ', 3001);
