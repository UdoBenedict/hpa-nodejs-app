const express = require('express');
const mongoose = require('mongoose');

const app = express();
app.use(express.json());

// Pull the connection string from the environment variable set in our Kubernetes manifest
const mongoUrl = process.env.MONGO_URL || 'mongodb://localhost:27017/mydb';
const port = 3000;

// Connect to MongoDB
mongoose.connect(mongoUrl)
  .then(() => console.log('Successfully connected to MongoDB!'))
  .catch(err => console.error('MongoDB connection error:', err));

// Define a simple Schema and Model
const ItemSchema = new mongoose.Schema({
  name: String,
  createdAt: { type: Date, default: Date.now }
});
const Item = mongoose.model('Item', ItemSchema);

// --- Routes ---

// Health check route
app.get('/', (req, res) => {
  res.send('Node.js API is running and connected to the database!');
});

// Create a new item (Tests writing to the database)
app.post('/items', async (req, res) => {
  try {
    const newItem = new Item({ name: req.body.name || 'Test Item' });
    await newItem.save();
    res.status(201).json({ message: 'Item saved', item: newItem });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Get all items (Tests reading from the database)
app.get('/items', async (req, res) => {
  try {
    const items = await Item.find();
    res.json(items);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.listen(port, () => {
  console.log(`Server listening on port ${port}`);
});