const express = require('express');
const { Pool } = require('pg');
const bodyParser = require('body-parser');
const cors = require('cors');
const helmet = require('helmet');
const { body, validationResult } = require('express-validator');
require('dotenv').config();

const app = express();
app.use(cors());
app.use(bodyParser.json());
app.use(helmet());

// PostgreSQL connection pool using environment variables
const pool = new Pool({
    user: process.env.DB_USER,
    host: process.env.DB_HOST,
    database: process.env.DB_NAME,
    password: process.env.DB_PASSWORD,
    port: process.env.DB_PORT,
});

// Create database and tables if they do not exist
async function createDatabaseAndTables() {
    try {
        const result = await pool.query(`
            SELECT EXISTS (
                SELECT FROM information_schema.tables 
                WHERE table_schema = 'public' 
                AND table_name = 'posts'
            );
        `);
        const postsTableExists = result.rows[0].exists;

        if (!postsTableExists) {
            console.log('Creating Posts table...');
            await pool.query(`
                CREATE TABLE Posts (
                    id SERIAL PRIMARY KEY,
                    teacher_id INTEGER NOT NULL,
                    title VARCHAR(255) NOT NULL,
                    content TEXT NOT NULL,
                    timestamp TIMESTAMP DEFAULT CURRENT_TIMESTAMP
                );
            `);
        }

        const commentsResult = await pool.query(`
            SELECT EXISTS (
                SELECT FROM information_schema.tables 
                WHERE table_schema = 'public' 
                AND table_name = 'comments'
            );
        `);
        const commentsTableExists = commentsResult.rows[0].exists;

        if (!commentsTableExists) {
            console.log('Creating Comments table...');
            await pool.query(`
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

createDatabaseAndTables();

// Create Post (Teacher only)
app.post('/api/posts', [
    body('title').notEmpty().withMessage('Title is required'),
    body('content').notEmpty().withMessage('Content is required')
], async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
        return res.status(400).json({ errors: errors.array() });
    }

    const { title, content } = req.body;
    const teacherId = req.user.id; // Replace with actual teacher ID from Auth0

    try {
        const result = await pool.query(
            'INSERT INTO Posts (teacher_id, title, content, timestamp) VALUES ($1, $2, $3, NOW()) RETURNING id',
            [teacherId, title, content]
        );
        res.status(201).json({ postId: result.rows[0].id });
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: 'Database posts error' });
    }
});

// Create Comment with Sentiment Analysis (Student only)
const analyzeSentiment = (text) => {
    if (text.includes('good') || text.includes('great')) return 'positive';
    if (text.includes('bad') || text.includes('terrible')) return 'negative';
    return 'neutral';
};

app.post('/api/posts/:post_id/comments', [
    body('content').notEmpty().withMessage('Content is required')
], async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
        return res.status(400).json({ errors: errors.array() });
    }

    const { content } = req.body;
    const studentId = req.user.id; // Replace with actual student ID from Auth0
    const postId = parseInt(req.params.post_id, 10);

    if (isNaN(postId)) {
        return res.status(400).json({ error: 'Invalid post ID' });
    }

    const sentiment = analyzeSentiment(content);

    try {
        await pool.query('INSERT INTO Comments (post_id, student_id, content, timestamp, sentiment) VALUES ($1, $2, $3, NOW(), $4)', [postId, studentId, content, sentiment]);
        res.status(201).json({ message: 'Comment added with sentiment analysis.' });
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: 'Database post comment error' });
    }
});

// Fetch All Posts
app.get('/api/posts', async (req, res) => {
    try {
        const result = await pool.query('SELECT * FROM Posts');
        res.status(200).json(result.rows);
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: 'Database error' });
    }
});

// Fetch a specific post by ID
app.get('/api/posts/:post_id', async (req, res) => {
    const postId = req.params.post_id;

    try {
        const result = await pool.query('SELECT * FROM Posts WHERE id = $1', [postId]);
        if (result.rows.length > 0) {
            res.status(200).json(result.rows[0]);
        } else {
            res.status(404).json({ error: 'Post not found' });
        }
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: 'Database error' });
    }
});

// Fetch Comments for a Specific Post
app.get('/api/posts/:post_id/comments', async (req, res) => {
    const postId = req.params.post_id;

    try {
        const result = await pool.query('SELECT * FROM Comments WHERE post_id = $1', [postId]);
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
