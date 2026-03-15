const express = require('express');
const OpenAI = require('openai');
const multer = require('multer');
const fs = require('fs');
const path = require('path');
const session = require('express-session');
const passport = require('passport');
const GoogleStrategy = require('passport-google-oauth20').Strategy;
require('dotenv').config();

const app = express();
const port = 3000;

const upload = multer({ dest: 'uploads/' });
const TICKETS_DIR = path.join(__dirname, 'tickets');

// Ensure tickets directory exists
if (!fs.existsSync(TICKETS_DIR)) {
    fs.mkdirSync(TICKETS_DIR);
}

// Session configuration
app.use(session({
    secret: process.env.SESSION_SECRET || 'your-secret-key-change-in-production',
    resave: false,
    saveUninitialized: false,
    cookie: { secure: false } // Set to true if using HTTPS
}));

app.use(passport.initialize());
app.use(passport.session());

// Passport configuration
passport.use(new GoogleStrategy({
    clientID: process.env.GOOGLE_CLIENT_ID,
    clientSecret: process.env.GOOGLE_CLIENT_SECRET,
    callbackURL: 'http://localhost:3000/auth/google/callback'
}, (accessToken, refreshToken, profile, done) => {
    return done(null, profile);
}));

passport.serializeUser((user, done) => {
    done(null, user);
});

passport.deserializeUser((user, done) => {
    done(null, user);
});

// Middleware to check authentication
function ensureAuthenticated(req, res, next) {
    if (req.isAuthenticated()) {
        return next();
    }
    res.status(401).json({ error: 'Not authenticated' });
}

// Get user ID from request
function getUserId(req) {
    return req.user.id || req.user.emails?.[0]?.value || 'unknown';
}

// Load tickets for a specific user
function loadUserTickets(userId) {
    try {
        const userFile = path.join(TICKETS_DIR, `${userId}.json`);
        if (fs.existsSync(userFile)) {
            const data = fs.readFileSync(userFile, 'utf8');
            return JSON.parse(data);
        }
    } catch (error) {
        console.error('Error loading tickets:', error);
    }
    return { tickets: [], counter: 1 };
}

// Save tickets for a specific user
function saveUserTickets(userId, data) {
    try {
        const userFile = path.join(TICKETS_DIR, `${userId}.json`);
        fs.writeFileSync(userFile, JSON.stringify(data, null, 2));
    } catch (error) {
        console.error('Error saving tickets:', error);
    }
}

app.use(express.json());
app.use(express.static('.'));

const openai = new OpenAI({
    apiKey: process.env.OPENAI_API_KEY
});

// Auth routes
app.get('/auth/google',
    passport.authenticate('google', { scope: ['profile', 'email'] })
);

app.get('/auth/google/callback',
    passport.authenticate('google', { failureRedirect: '/login.html' }),
    (req, res) => {
        res.redirect('/');
    }
);

app.get('/auth/logout', (req, res) => {
    req.logout((err) => {
        if (err) return res.status(500).json({ error: 'Logout failed' });
        res.redirect('/login.html');
    });
});

app.get('/auth/user', (req, res) => {
    if (req.isAuthenticated()) {
        res.json({
            authenticated: true,
            user: {
                name: req.user.displayName,
                email: req.user.emails?.[0]?.value,
                photo: req.user.photos?.[0]?.value
            }
        });
    } else {
        res.json({ authenticated: false });
    }
});

app.get('/api/tickets', ensureAuthenticated, (req, res) => {
    const userId = getUserId(req);
    const ticketsData = loadUserTickets(userId);
    res.json(ticketsData);
});

app.post('/api/tickets', ensureAuthenticated, (req, res) => {
    const userId = getUserId(req);
    const ticketsData = loadUserTickets(userId);
    const { description, classification } = req.body;
    
    const ticket = {
        id: ticketsData.counter++,
        description,
        classification,
        timestamp: new Date().toISOString()
    };
    
    ticketsData.tickets.unshift(ticket);
    saveUserTickets(userId, ticketsData);
    
    res.json(ticket);
});

app.put('/api/tickets/:id', ensureAuthenticated, (req, res) => {
    const userId = getUserId(req);
    const ticketsData = loadUserTickets(userId);
    const ticketId = parseInt(req.params.id);
    const { description } = req.body;
    
    const ticket = ticketsData.tickets.find(t => t.id === ticketId);
    if (ticket) {
        ticket.description = description;
        saveUserTickets(userId, ticketsData);
        res.json(ticket);
    } else {
        res.status(404).json({ error: 'Ticket not found' });
    }
});

app.delete('/api/tickets/:id', ensureAuthenticated, (req, res) => {
    const userId = getUserId(req);
    const ticketsData = loadUserTickets(userId);
    const ticketId = parseInt(req.params.id);
    const index = ticketsData.tickets.findIndex(t => t.id === ticketId);
    
    if (index !== -1) {
        ticketsData.tickets.splice(index, 1);
        saveUserTickets(userId, ticketsData);
        res.json({ success: true });
    } else {
        res.status(404).json({ error: 'Ticket not found' });
    }
});

app.post('/api/classify', ensureAuthenticated, async (req, res) => {
    const { description } = req.body;

    try {
        const completion = await openai.chat.completions.create({
            model: 'gpt-3.5-turbo',
            messages: [
                {
                    role: 'system',
                    content: 'You are a ticket classifier. Classify tickets into one of these categories: task, bug, enhancement, research, design, testing, deployment, documentation. Respond with only the category name in lowercase.'
                },
                {
                    role: 'user',
                    content: description
                }
            ],
            temperature: 0.3,
            max_tokens: 10
        });

        const classification = completion.choices[0].message.content.trim().toLowerCase();
        res.json({ classification });
    } catch (error) {
        console.error('Error:', error);
        res.status(500).json({ classification: 'other' });
    }
});

app.post('/api/translate', ensureAuthenticated, async (req, res) => {
    const { text, language } = req.body;

    try {
        const completion = await openai.chat.completions.create({
            model: 'gpt-3.5-turbo',
            messages: [
                {
                    role: 'system',
                    content: `You are a translator. Translate the given text to ${language}. Respond with only the translated text, nothing else.`
                },
                {
                    role: 'user',
                    content: text
                }
            ],
            temperature: 0.3,
            max_tokens: 500
        });

        const translation = completion.choices[0].message.content.trim();
        res.json({ translation });
    } catch (error) {
        console.error('Error:', error);
        res.status(500).json({ error: 'Translation failed' });
    }
});

app.post('/api/transcribe', ensureAuthenticated, upload.single('audio'), async (req, res) => {
    try {
        // Read the uploaded file
        const audioBuffer = fs.readFileSync(req.file.path);
        
        // Create a new file with .webm extension for Whisper
        const webmPath = req.file.path + '.webm';
        fs.writeFileSync(webmPath, audioBuffer);
        
        const transcription = await openai.audio.transcriptions.create({
            file: fs.createReadStream(webmPath),
            model: 'whisper-1'
        });

        // Clean up files
        fs.unlinkSync(req.file.path);
        fs.unlinkSync(webmPath);
        
        res.json({ text: transcription.text });
    } catch (error) {
        console.error('Error:', error);
        if (req.file) {
            fs.unlinkSync(req.file.path);
            const webmPath = req.file.path + '.webm';
            if (fs.existsSync(webmPath)) fs.unlinkSync(webmPath);
        }
        res.status(500).json({ error: 'Transcription failed' });
    }
});

app.listen(port, () => {
    console.log(`Server running at http://localhost:${port}`);
});
