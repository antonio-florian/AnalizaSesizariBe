const express = require('express');
const { Client } = require('pg');
const bodyParser = require('body-parser');
const cors = require('cors');
require('dotenv').config();

const app = express();
app.use(cors());
app.use(bodyParser.json());

// PostgreSQL connection using the provided credentials
const client = new Client({
    user: 'postgres',
    host: 'localhost',  // assuming the database is running locally
    database: 'mydb',
    password: '123qwe',
    port: 5432,
});

// Connect to the PostgreSQL database
client.connect()
    .then(async () => {
        console.log('Connected to PostgreSQL database');

        // Create database and tables if they do not exist
        await createDatabaseAndTables();
    })
    .catch(err => console.error('Connection error', err.stack));

// Function to create database and tables
async function createDatabaseAndTables() {
    try {
        // Check if the Posts table exists
        const result = await client.query(`
            SELECT EXISTS (
                SELECT FROM information_schema.tables 
                WHERE table_schema = 'public' 
                AND table_name = 'posts'
            );
        `);

        const postsTableExists = result.rows[0].exists;

        if (!postsTableExists) {
            console.log('Creating Posts table...');
            await client.query(`
                CREATE TABLE Posts (
                    id SERIAL PRIMARY KEY,
                    teacher_id INTEGER NOT NULL,
                    title VARCHAR(255) NOT NULL,
                    content TEXT NOT NULL,
                    timestamp TIMESTAMP DEFAULT CURRENT_TIMESTAMP
                );
            `);
        }

        // Check if the Comments table exists
        const commentsResult = await client.query(`
            SELECT EXISTS (
                SELECT FROM information_schema.tables 
                WHERE table_schema = 'public' 
                AND table_name = 'comments'
            );
        `);

        const commentsTableExists = commentsResult.rows[0].exists;

        if (!commentsTableExists) {
            console.log('Creating Comments table...');
            await client.query(`
                CREATE TABLE Comments (
                    id SERIAL PRIMARY KEY,
                    post_id INTEGER REFERENCES Posts(id) ON DELETE CASCADE,
                    student_id INTEGER NOT NULL,
                    content TEXT NOT NULL,
                    timestamp TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                    sentiment VARCHAR(50) NOT NULL
                );
            `);
        }

        console.log('Database setup complete.');

    } catch (err) {
        console.error('Error creating tables:', err.stack);
    }
}

// Create Post (Teacher only)
app.post('/api/posts', async (req, res) => {
    const { title, content } = req.body;
    const teacherId = 1; // Hardcoded for now, replace with real teacher ID from Auth0 later
    try {
        const result = await client.query(
            'INSERT INTO Posts (teacher_id, title, content, timestamp) VALUES ($1, $2, $3, NOW()) RETURNING id',
            [teacherId, title, content]
        );
        res.status(201).json({ postId: result.rows[0].id });
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: 'Database error' });
    }
});

// Create Comment with Sentiment Analysis (Student only)
const analyzeSentiment = (text) => {
    if (text.includes('good') || text.includes('great')) return 'positive';
    if (text.includes('bad') || text.includes('terrible')) return 'negative';
    return 'neutral';
};

app.post('/api/posts/:post_id/comments', async (req, res) => {
    const { content } = req.body;
    const studentId = 2; // Hardcoded for now, replace with real student ID from Auth0 later
    const postId = req.params.post_id;

    const sentiment = analyzeSentiment(content);
    try {
        await client.query(
            'INSERT INTO Comments (post_id, student_id, content, timestamp, sentiment) VALUES ($1, $2, $3, NOW(), $4)',
            [postId, studentId, content, sentiment]
        );
        res.status(201).json({ message: 'Comment added with sentiment analysis.' });
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: 'Database error' });
    }
});

// Fetch All Posts
app.get('/api/posts', async (req, res) => {
    try {
        const result = await client.query('SELECT * FROM Posts');
        res.status(200).json(result.rows);
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: 'Database error' });
    }
});

// Fetch Comments for a Specific Post
app.get('/api/posts/:post_id/comments', async (req, res) => {
    const postId = req.params.post_id;
    try {
        const result = await client.query('SELECT * FROM Comments WHERE post_id = $1', [postId]);
        res.status(200).json(result.rows);
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: 'Database error' });
    }
});

// Root route
app.get('/', (req, res) => {
    res.send('Welcome to the Teacher-Student App API!');
});

// Start the server
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
    console.log(`Server is running on port ${PORT}`);
});
