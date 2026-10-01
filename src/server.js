const express = require('express');
const authRoutes = require('./routes/auth');

const app = express();

// lets us read JSON request bodies
app.use(express.json());

app.use('/auth', authRoutes);

// if the request body is not valid JSON, answer with a clean 400
app.use((err, req, res, next) => {
  if (err.type === 'entity.parse.failed') {
    return res.status(400).json({ message: 'Request body must be valid JSON' });
  }
  console.error(err);
  res.status(500).json({ message: 'Something went wrong' });
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});