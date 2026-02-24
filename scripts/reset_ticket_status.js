// Reset a ticket to 'todo' with empty statusHistory for re-processing
const fs = require('fs');
const ticketPath = process.argv[2];
if (!ticketPath) { console.error('Usage: node scripts/reset_ticket_status.js <path>'); process.exit(1); }
const ticket = JSON.parse(fs.readFileSync(ticketPath, 'utf8'));
ticket.status = 'todo';
ticket.statusHistory = [];
fs.writeFileSync(ticketPath, JSON.stringify(ticket, null, 2) + '\n');
console.log(`Reset ${ticket.ticketId} -> todo`);
