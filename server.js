const express = require('express');
const bodyParser = require('body-parser');
const path = require('path');

const invoiceRoutes = require('./routes/invoiceRoutes');

const app = express();

// View engine
app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'views'));

// Middleware
app.use(express.json());
app.use(bodyParser.urlencoded({ extended: true }));
app.use(express.static('public'));

// Routes
app.use('/', invoiceRoutes);

// Start server
app.listen(3000, () => {
    console.log('Server running on http://localhost:3000');
});