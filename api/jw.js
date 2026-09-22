module.exports = async function handler(req, res) {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');

    if (req.method === 'OPTIONS') {
        return res.status(200).end();
    }

    if (req.method !== 'POST') {
        return res.status(405).json({ error: 'Method not allowed' });
    }

    try {
        const getJsonBody = async () => {
            if (req.body && typeof req.body === 'object') return req.body;
            const chunks = [];
            for await (const chunk of req) {
                chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
            }
            const raw = Buffer.concat(chunks).toString('utf8');
            if (!raw.trim()) return {};
            try {
                return JSON.parse(raw);
            } catch {
                return null;
            }
        };

        const body = await getJsonBody();
        if (!body || typeof body !== 'object') {
            return res.status(400).json({ error: 'Invalid request body' });
        }

        const response = await fetch('https://apis.justwatch.com/graphql', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'App-Version': '3.8.2-web#eb7f36c'
            },
            body: JSON.stringify(body)
        });

        const text = await response.text();
        let data;
        try {
            data = text ? JSON.parse(text) : {};
        } catch {
            return res.status(502).json({ error: 'Invalid response from JustWatch' });
        }

        if (!response.ok) {
            return res.status(response.status || 502).json({
                error: data?.errors?.[0]?.message || 'JustWatch request failed',
                details: data
            });
        }

        return res.status(200).json(data);
    } catch (err) {
        return res.status(500).json({ error: err?.message || 'Unexpected server error' });
    }
};
