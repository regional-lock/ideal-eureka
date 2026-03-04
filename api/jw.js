export default async function handler(req, res) {
    if (req.method !== 'POST') {
        return res.status(405).json({ error: 'Method not allowed' });
    }

    try {
        const response = await fetch('https://apis.justwatch.com/graphql', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'App-Version': '3.8.2-web#eb7f36c'
            },
            body: JSON.stringify(req.body)
        });

        const data = await response.json();
        res.status(200).json(data);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
}
