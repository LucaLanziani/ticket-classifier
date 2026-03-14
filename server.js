const express = require('express');
const OpenAI = require('openai');
const multer = require('multer');
const fs = require('fs');
const path = require('path');

const app = express();
const port = 3000;

const upload = multer({ dest: 'uploads/' });
const TICKETS_FILE = path.join(__dirname, 'tickets.json');

// Load tickets from file
function loadTickets() {
    try {
        if (fs.existsSync(TICKETS_FILE)) {
            const data = fs.readFileSync(TICKETS_FILE, 'utf8');
            return JSON.parse(data);
        }
    } catch (error) {
        console.error('Error loading tickets:', error);
    }
    return { tickets: [], counter: 1 };
}

// Save tickets to file
function saveTickets(data) {
    try {
        fs.writeFileSync(TICKETS_FILE, JSON.stringify(data, null, 2));
    } catch (error) {
        console.error('Error saving tickets:', error);
    }
}

let ticketsData = loadTickets();

app.use(express.json());
app.use(express.static('.'));

const openai = new OpenAI({
    apiKey: process.env.OPENAI_API_KEY
});

app.get('/api/tickets', (req, res) => {
    res.json(ticketsData);
});

app.post('/api/tickets', (req, res) => {
    const { description, classification } = req.body;
    
    const ticket = {
        id: ticketsData.counter++,
        description,
        classification,
        timestamp: new Date().toISOString()
    };
    
    ticketsData.tickets.unshift(ticket);
    saveTickets(ticketsData);
    
    res.json(ticket);
});

app.put('/api/tickets/:id', (req, res) => {
    const ticketId = parseInt(req.params.id);
    const { description } = req.body;
    
    const ticket = ticketsData.tickets.find(t => t.id === ticketId);
    if (ticket) {
        ticket.description = description;
        saveTickets(ticketsData);
        res.json(ticket);
    } else {
        res.status(404).json({ error: 'Ticket not found' });
    }
});

app.delete('/api/tickets/:id', (req, res) => {
    const ticketId = parseInt(req.params.id);
    const index = ticketsData.tickets.findIndex(t => t.id === ticketId);
    
    if (index !== -1) {
        ticketsData.tickets.splice(index, 1);
        saveTickets(ticketsData);
        res.json({ success: true });
    } else {
        res.status(404).json({ error: 'Ticket not found' });
    }
});

app.post('/api/classify', async (req, res) => {
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

app.post('/api/translate', async (req, res) => {
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

app.post('/api/transcribe', upload.single('audio'), async (req, res) => {
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
