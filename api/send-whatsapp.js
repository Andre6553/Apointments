import twilio from 'twilio';

export default async function handler(req, res) {
    // Enable CORS
    res.setHeader('Access-Control-Allow-Credentials', true)
    res.setHeader('Access-Control-Allow-Origin', '*')
    res.setHeader('Access-Control-Allow-Methods', 'GET,OPTIONS,PATCH,DELETE,POST,PUT')
    res.setHeader(
        'Access-Control-Allow-Headers',
        'X-CSRF-Token, X-Requested-With, Accept, Accept-Version, Content-Length, Content-MD5, Content-Type, Date, X-Api-Version'
    )

    if (req.method === 'OPTIONS') {
        res.status(200).end()
        return
    }

    if (req.method !== 'POST') {
        return res.status(405).json({ error: 'Method Not Allowed' });
    }

    const { to, message } = req.body;
    const accountSid = process.env.TWILIO_ACCOUNT_SID?.trim();
    const authToken = process.env.TWILIO_AUTH_TOKEN?.trim();
    const fromNumber = process.env.TWILIO_WHATSAPP_FROM?.trim();

    if (!accountSid || !authToken) {
        return res.status(500).json({ error: 'Server configuration error: Missing Twilio Credentials' });
    }

    try {
        const client = twilio(accountSid, authToken);

        const result = await client.messages.create({
            body: message,
            from: fromNumber,
            to: to.startsWith('whatsapp:') ? to : `whatsapp:${to}`
        });

        return res.status(200).json({ sid: result.sid, status: result.status });
    } catch (error) {
        console.error('Twilio Error:', error);
        return res.status(error.status || 500).json({
            error: error.message || 'Failed to send message',
            code: error.code
        });
    }
}
