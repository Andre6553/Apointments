
const http = require('http');

const data = JSON.stringify({
    level: 'INFO',
    event: 'test.script.ping',
    payload: { message: 'Testing from node script' },
    business_name: 'TestBusiness'
});

const options = {
    hostname: 'localhost',
    port: 3001,
    path: '/log',
    method: 'POST',
    headers: {
        'Content-Type': 'application/json',
        'Content-Length': data.length,
    },
};

const req = http.request(options, (res) => {
    console.log(`STATUS: ${res.statusCode}`);
    res.setEncoding('utf8');
    res.on('data', (chunk) => {
        console.log(`BODY: ${chunk}`);
    });
    res.on('end', () => {
        console.log('No more data in response.');
    });
});

req.on('error', (e) => {
    console.error(`problem with request: ${e.message}`);
});

req.write(data);
req.end();
