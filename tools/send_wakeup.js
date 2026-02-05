// Native fetch is available in Node 18+

const to = '+27761963997';
const message = 'Hello! This is a test message to verify the B.L.A.S.T. System connection. Have a wonderful day! 🚀';

async function sendWakeup() {
    console.log(`🚀 Sending wake-up message to ${to}...`);
    try {
        const response = await fetch('http://localhost:3001/send-whatsapp', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({ to, message }),
        });

        const data = await response.json();
        if (response.ok) {
            console.log('✅ Success!', data);
        } else {
            console.error('❌ Failed:', data);
        }
    } catch (error) {
        console.error('❌ Fatal Error:', error.message);
    }
}

sendWakeup();
