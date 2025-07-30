// SERVER-SIDE JAVASCRIPT FOR PIXUP APP (Node.js with Express)

const express = require('express');
const bodyParser = require('body-parser');
const cors = require('cors'); // For handling Cross-Origin Resource Sharing
const fs = require('fs').promises; // For asynchronous file operations
const path = require('path'); // For resolving file paths
const { v4: uuidv4 } = require('uuid'); // For generating unique IDs
const bcrypt = require('bcrypt'); // For password hashing

const app = express();
const PORT = 3000;
const POSTS_FILE = path.join(__dirname, 'posts.json'); // File to store posts data
const USERS_FILE = path.join(__dirname, 'users.json'); // File to store user credentials

// Middleware
app.use(cors()); // Allow requests from your HTML file (e.g., if served from a different origin)
app.use(bodyParser.json({ limit: '50mb' })); // Support JSON-encoded bodies, increase limit for base64 media
app.use(bodyParser.urlencoded({ limit: '50mb', extended: true })); // Support URL-encoded bodies

// Serve static files (your HTML, CSS, JS) from the current directory
// Assuming your HTML file is named 'index.html' and is in the same directory as this server.js
app.use(express.static(__dirname));

// --- File Reading/Writing Helpers ---

// Function to read posts data
async function readPosts() {
    try {
        const data = await fs.readFile(POSTS_FILE, 'utf8');
        return JSON.parse(data);
    } catch (error) {
        if (error.code === 'ENOENT') {
            // File not found, return an empty array (first run)
            return [];
        }
        console.error('Error reading posts file:', error);
        return [];
    }
}

// Function to write posts data
async function writePosts(posts) {
    try {
        await fs.writeFile(POSTS_FILE, JSON.stringify(posts, null, 2), 'utf8');
    } catch (error) {
        console.error('Error writing posts file:', error);
    }
}

// Function to read users data
async function readUsers() {
    try {
        const data = await fs.readFile(USERS_FILE, 'utf8');
        return JSON.parse(data);
    } catch (error) {
        if (error.code === 'ENOENT') {
            // File not found, return an empty array
            return [];
        }
        console.error('Error reading users file:', error);
        return [];
    }
}

// Function to write users data
async function writeUsers(users) {
    try {
        await fs.writeFile(USERS_FILE, JSON.stringify(users, null, 2), 'utf8');
    } catch (error) {
        console.error('Error writing users file:', error);
    }
}

// --- API Endpoints ---

// User Signup
app.post('/api/signup', async (req, res) => {
    const { username, password } = req.body;

    if (!username || username.trim() === '' || !password || password.trim() === '') {
        return res.status(400).json({ message: 'Username and password cannot be empty.' });
    }

    let users = await readUsers();

    // Check if username already exists
    if (users.some(user => user.username === username)) {
        return res.status(409).json({ message: 'Username already exists. Please choose a different one or log in.' });
    }

    try {
        const hashedPassword = await bcrypt.hash(password, 10); // Hash password with salt rounds = 10
        const newUser = {
            id: uuidv4(),
            username,
            passwordHash: hashedPassword
        };
        users.push(newUser);
        await writeUsers(users);
        res.status(201).json({ userId: newUser.id, username: newUser.username, message: 'User registered successfully!' });
    } catch (error) {
        console.error('Error during signup:', error);
        res.status(500).json({ message: 'Server error during registration.' });
    }
});

// User Login
app.post('/api/login', async (req, res) => {
    const { username, password } = req.body;

    if (!username || username.trim() === '' || !password || password.trim() === '') {
        return res.status(400).json({ message: 'Username and password cannot be empty.' });
    }

    const users = await readUsers();
    const user = users.find(u => u.username === username);

    if (!user) {
        return res.status(401).json({ message: 'Invalid username or password.' });
    }

    try {
        const isMatch = await bcrypt.compare(password, user.passwordHash);
        if (isMatch) {
            res.status(200).json({ userId: user.id, username: user.username, message: 'Logged in successfully!' });
        } else {
            res.status(401).json({ message: 'Invalid username or password.' });
        }
    } catch (error) {
        console.error('Error during login:', error);
        res.status(500).json({ message: 'Server error during login.' });
    }
});


// Get all posts
app.get('/api/posts', async (req, res) => {
    const posts = await readPosts();
    res.json(posts);
});

// Create a new post
app.post('/api/posts', async (req, res) => {
    const posts = await readPosts();
    const { userId, username, content, image, video } = req.body;

    // Basic validation for authenticated user
    if (!userId || !username || (!content && !image && !video)) {
        return res.status(400).json({ message: 'Missing required post data or user not authenticated.' });
    }

    // Optional: Server-side check if userId and username match a registered user
    // For this simple app, we trust the client-provided userId/username after login.
    // In a real app, you'd use a session token or JWT here.

    const newPost = {
        id: uuidv4(), // Generate a unique ID for the post
        userId,
        username,
        content: content || '',
        image: image || null,
        video: video || null,
        timestamp: new Date().toISOString(), // ISO 8601 format for easy sorting
        likedBy: [], // Array of userIds who liked
        dislikedBy: [], // Array of userIds who disliked
        comments: [] // Array of comment objects
    };
    posts.push(newPost);
    await writePosts(posts);
    res.status(201).json(newPost);
});

// Delete a post
app.delete('/api/posts/:id', async (req, res) => {
    const postId = req.params.id;
    const { userId } = req.body; // Expect userId for validation
    let posts = await readPosts();

    const initialLength = posts.length;
    // Only delete if the post ID matches and the requesting userId is the owner
    posts = posts.filter(p => !(p.id === postId && p.userId === userId));

    if (posts.length < initialLength) {
        await writePosts(posts);
        res.status(200).json({ message: 'Post deleted successfully.' });
    } else {
        res.status(403).json({ message: 'Post not found or you are not authorized to delete this post.' });
    }
});

// Clear all posts by the current user
app.post('/api/posts/clear_mine', async (req, res) => {
    const { userId } = req.body;
    let posts = await readPosts();

    const initialLength = posts.length;
    posts = posts.filter(p => p.userId !== userId); // Filter out posts by the specified user ID

    if (posts.length < initialLength) {
        await writePosts(posts);
        res.status(200).json({ message: 'Your posts cleared successfully.' });
    } else {
        res.status(404).json({ message: 'No posts found for this user.' });
    }
});

// Toggle like on a post
app.post('/api/posts/:id/like', async (req, res) => {
    const postId = req.params.id;
    const { userId } = req.body;
    const posts = await readPosts();

    const postIndex = posts.findIndex(p => p.id === postId);
    if (postIndex === -1) {
        return res.status(404).json({ message: 'Post not found.' });
    }

    const post = posts[postIndex];
    if (!post.likedBy) post.likedBy = [];
    if (!post.dislikedBy) post.dislikedBy = [];

    // Check if already disliked
    if (post.dislikedBy.includes(userId)) {
        return res.status(400).json({ message: 'Remove your dislike first.' });
    }

    // Toggle like
    if (post.likedBy.includes(userId)) {
        post.likedBy = post.likedBy.filter(id => id !== userId); // Unlike
    } else {
        post.likedBy.push(userId); // Like
    }
    await writePosts(posts);
    res.status(200).json({ message: 'Like status updated.' });
});

// Toggle dislike on a post
app.post('/api/posts/:id/dislike', async (req, res) => {
    const postId = req.params.id;
    const { userId } = req.body;
    const posts = await readPosts();

    const postIndex = posts.findIndex(p => p.id === postId);
    if (postIndex === -1) {
        return res.status(404).json({ message: 'Post not found.' });
    }

    const post = posts[postIndex];
    if (!post.likedBy) post.likedBy = [];
    if (!post.dislikedBy) post.dislikedBy = [];

    // Check if already liked
    if (post.likedBy.includes(userId)) {
        return res.status(400).json({ message: 'Please remove your like first.' });
    }

    // Toggle dislike
    if (post.dislikedBy.includes(userId)) {
        post.dislikedBy = post.dislikedBy.filter(id => id !== userId); // Undislike
    } else {
        post.dislikedBy.push(userId); // Dislike
    }
    await writePosts(posts);
    res.status(200).json({ message: 'Dislike status updated.' });
});

// Add a comment to a post
app.post('/api/posts/:id/comment', async (req, res) => {
    const postId = req.params.id;
    const { userId, username, text } = req.body;
    const posts = await readPosts();

    const postIndex = posts.findIndex(p => p.id === postId);
    if (postIndex === -1) {
        return res.status(404).json({ message: 'Post not found.' });
    }
    if (!userId || !username || !text) {
        return res.status(400).json({ message: 'Missing comment data or user not authenticated.' });
    }

    const post = posts[postIndex];
    if (!post.comments) post.comments = [];

    const newComment = {
        id: uuidv4(), // Unique ID for comment
        userId,
        user: username,
        text,
        timestamp: new Date().toISOString()
    };
    post.comments.push(newComment);
    await writePosts(posts);
    res.status(201).json({ message: 'Comment added successfully.' });
});


// Start the server
app.listen(PORT, () => {
    console.log(`PixUp Node.js server running at http://localhost:${PORT}`);
    console.log(`Open your browser to http://localhost:${PORT}/index.html`);
});
