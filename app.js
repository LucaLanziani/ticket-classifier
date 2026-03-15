let tickets = [];
let ticketIdCounter = 1;
let activeFilter = 'all';
let activeSort = 'newest';

const ticketInput = document.getElementById('ticketInput');
const submitBtn = document.getElementById('submitBtn');
const voiceBtn = document.getElementById('voiceBtn');
const ticketsList = document.getElementById('ticketsList');
const logoutBtn = document.getElementById('logoutBtn');
const userName = document.getElementById('userName');
const userPhoto = document.getElementById('userPhoto');
const sortSelect = document.getElementById('sortSelect');

// Filter buttons
document.querySelectorAll('.filter-btn').forEach(btn => {
    btn.addEventListener('click', () => {
        document.querySelectorAll('.filter-btn').forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        activeFilter = btn.dataset.filter;
        renderTickets();
    });
});

sortSelect.addEventListener('change', () => {
    activeSort = sortSelect.value;
    renderTickets();
});

let mediaRecorder = null;
let audioChunks = [];
let isRecording = false;

// Check authentication on load
async function checkAuth() {
    try {
        const response = await fetch('/auth/user');
        const data = await response.json();
        
        if (!data.authenticated) {
            window.location.href = '/login.html';
            return;
        }
        
        userName.textContent = data.user.name;
        if (data.user.photo) {
            userPhoto.src = data.user.photo;
            userPhoto.style.display = 'block';
        }
    } catch (error) {
        console.error('Auth check failed:', error);
        window.location.href = '/login.html';
    }
}

logoutBtn.addEventListener('click', () => {
    window.location.href = '/auth/logout';
});

checkAuth();

voiceBtn.addEventListener('click', async () => {
    if (isRecording) {
        stopRecording();
    } else {
        await startRecording();
    }
});

async function startRecording() {
    try {
        const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
        
        // Use audio/webm;codecs=opus for better compatibility
        const options = { mimeType: 'audio/webm;codecs=opus' };
        mediaRecorder = new MediaRecorder(stream, options);
        audioChunks = [];

        mediaRecorder.ondataavailable = (event) => {
            audioChunks.push(event.data);
        };

        mediaRecorder.onstop = async () => {
            const audioBlob = new Blob(audioChunks, { type: 'audio/webm' });
            await transcribeAudio(audioBlob);
            stream.getTracks().forEach(track => track.stop());
        };

        mediaRecorder.start();
        isRecording = true;
        voiceBtn.classList.add('recording');
        voiceBtn.textContent = '⏹️ Stop';
    } catch (error) {
        console.error('Error accessing microphone:', error);
        alert('Could not access microphone. Please grant permission.');
    }
}

function stopRecording() {
    if (mediaRecorder && mediaRecorder.state !== 'inactive') {
        mediaRecorder.stop();
        isRecording = false;
        voiceBtn.classList.remove('recording');
        voiceBtn.textContent = '🎤 Voice';
        voiceBtn.disabled = true;
        voiceBtn.textContent = '⏳ Transcribing...';
    }
}

async function transcribeAudio(audioBlob) {
    try {
        const formData = new FormData();
        formData.append('audio', audioBlob, 'recording.webm');

        const response = await fetch('/api/transcribe', {
            method: 'POST',
            body: formData
        });

        const data = await response.json();
        
        if (data.text) {
            ticketInput.value += (ticketInput.value ? ' ' : '') + data.text;
        }
    } catch (error) {
        console.error('Transcription error:', error);
        alert('Transcription failed. Please try again.');
    } finally {
        voiceBtn.disabled = false;
        voiceBtn.textContent = '🎤 Voice';
    }
}

submitBtn.addEventListener('click', async () => {
    const description = ticketInput.value.trim();
    if (!description) return;

    submitBtn.disabled = true;
    submitBtn.textContent = 'Creating...';

    const classification = await classifyTicket(description);
    
    const response = await fetch('/api/tickets', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ description, classification })
    });
    
    const ticket = await response.json();
    tickets.unshift(ticket);
    ticketInput.value = '';
    renderTickets();
    
    submitBtn.disabled = false;
    submitBtn.textContent = 'Submit Ticket';
});

async function loadTickets() {
    try {
        const response = await fetch('/api/tickets');
        const data = await response.json();
        tickets = data.tickets;
        ticketIdCounter = data.counter;
        renderTickets();
    } catch (error) {
        console.error('Error loading tickets:', error);
    }
}

async function classifyTicket(description) {
    try {
        const response = await fetch('/api/classify', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ description })
        });
        
        const data = await response.json();
        return data.classification || 'other';
    } catch (error) {
        console.error('Classification error:', error);
        return 'other';
    }
}

function renderTickets() {
    const ticketCount = document.getElementById('ticketCount');

    let filtered = activeFilter === 'all'
        ? [...tickets]
        : tickets.filter(t => t.classification === activeFilter);

    if (activeSort === 'newest') {
        filtered.sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));
    } else if (activeSort === 'oldest') {
        filtered.sort((a, b) => new Date(a.timestamp) - new Date(b.timestamp));
    } else if (activeSort === 'type') {
        filtered.sort((a, b) => a.classification.localeCompare(b.classification));
    }

    ticketCount.textContent = `${filtered.length} of ${tickets.length} ticket${tickets.length !== 1 ? 's' : ''}`;

    if (filtered.length === 0) {
        ticketsList.innerHTML = '<p class="empty-state">No tickets found. Try a different filter or create a new ticket 🎫</p>';
        return;
    }

    ticketsList.innerHTML = filtered.map(ticket => `
        <div class="ticket" data-ticket-id="${ticket.id}">
            <div class="ticket-header">
                <span class="ticket-id">#${ticket.id}</span>
                <span class="ticket-classification classification-${ticket.classification}">
                    ${ticket.classification.toUpperCase()}
                </span>
            </div>
            <div class="ticket-description" data-ticket-id="${ticket.id}">
                ${escapeHtml(ticket.translatedText || ticket.description)}
            </div>
            <div class="ticket-footer">
                <span class="ticket-date">${new Date(ticket.timestamp).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' })}</span>
                <div class="ticket-actions">
                    <select class="language-select" data-ticket-id="${ticket.id}">
                        <option value="">🌐 Translate</option>
                        <option value="Spanish">Spanish</option>
                        <option value="French">French</option>
                        <option value="German">German</option>
                        <option value="Italian">Italian</option>
                        <option value="Portuguese">Portuguese</option>
                        <option value="Japanese">Japanese</option>
                        <option value="Chinese">Chinese</option>
                        <option value="Korean">Korean</option>
                        <option value="Russian">Russian</option>
                        <option value="Arabic">Arabic</option>
                    </select>
                    ${ticket.translatedText ? `<button class="icon-btn reset-btn" title="Show original" data-ticket-id="${ticket.id}">↩️</button>` : ''}
                    <button class="icon-btn edit-btn" title="Edit" data-ticket-id="${ticket.id}">✏️</button>
                    <button class="icon-btn delete-btn" title="Delete" data-ticket-id="${ticket.id}">🗑️</button>
                </div>
            </div>
        </div>
    `).join('');

    document.querySelectorAll('.language-select').forEach(s => s.addEventListener('change', handleTranslate));
    document.querySelectorAll('.reset-btn').forEach(b => b.addEventListener('click', handleReset));
    document.querySelectorAll('.edit-btn').forEach(b => b.addEventListener('click', handleEdit));
    document.querySelectorAll('.delete-btn').forEach(b => b.addEventListener('click', handleDelete));
}

function escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}

loadTickets();


async function handleTranslate(event) {
    const ticketId = parseInt(event.target.dataset.ticketId);
    const language = event.target.value;
    
    if (!language) return;

    const ticket = tickets.find(t => t.id === ticketId);
    if (!ticket) return;

    event.target.disabled = true;
    
    try {
        const response = await fetch('/api/translate', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ 
                text: ticket.description,
                language 
            })
        });
        
        const data = await response.json();
        ticket.translatedText = data.translation;
        ticket.translatedLanguage = language;
        renderTickets();
    } catch (error) {
        console.error('Translation error:', error);
        event.target.disabled = false;
    }
}

function handleReset(event) {
    const ticketId = parseInt(event.target.dataset.ticketId);
    const ticket = tickets.find(t => t.id === ticketId);
    
    if (ticket) {
        delete ticket.translatedText;
        delete ticket.translatedLanguage;
        renderTickets();
    }
}


function handleEdit(event) {
    const ticketId = parseInt(event.target.dataset.ticketId);
    const ticket = tickets.find(t => t.id === ticketId);
    
    if (!ticket) return;

    const descriptionEl = document.querySelector(`.ticket-description[data-ticket-id="${ticketId}"]`);
    const currentText = ticket.description;
    
    descriptionEl.innerHTML = `
        <textarea class="edit-textarea" data-ticket-id="${ticketId}">${escapeHtml(currentText)}</textarea>
        <div style="margin-top: 8px;">
            <button class="save-btn" data-ticket-id="${ticketId}">💾 Save</button>
            <button class="cancel-btn" data-ticket-id="${ticketId}">❌ Cancel</button>
        </div>
    `;

    const textarea = descriptionEl.querySelector('.edit-textarea');
    textarea.focus();
    textarea.setSelectionRange(textarea.value.length, textarea.value.length);

    descriptionEl.querySelector('.save-btn').addEventListener('click', async (e) => {
        const newText = textarea.value.trim();
        if (!newText) return;

        e.target.disabled = true;
        e.target.textContent = 'Saving...';

        try {
            const response = await fetch(`/api/tickets/${ticketId}`, {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ description: newText })
            });

            if (response.ok) {
                ticket.description = newText;
                delete ticket.translatedText;
                delete ticket.translatedLanguage;
                renderTickets();
            }
        } catch (error) {
            console.error('Error updating ticket:', error);
            alert('Failed to update ticket');
        }
    });

    descriptionEl.querySelector('.cancel-btn').addEventListener('click', () => {
        renderTickets();
    });
}

async function handleDelete(event) {
    const ticketId = parseInt(event.target.dataset.ticketId);
    
    if (!confirm('Are you sure you want to delete this ticket?')) return;

    try {
        const response = await fetch(`/api/tickets/${ticketId}`, {
            method: 'DELETE'
        });

        if (response.ok) {
            tickets = tickets.filter(t => t.id !== ticketId);
            renderTickets();
        }
    } catch (error) {
        console.error('Error deleting ticket:', error);
        alert('Failed to delete ticket');
    }
}
