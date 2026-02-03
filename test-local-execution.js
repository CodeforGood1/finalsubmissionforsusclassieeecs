// Test local code execution inside the container
const http = require('http');

const testLocalCodeExecution = async () => {
  console.log("🧪 Testing LOCAL code execution (no internet required)...\n");
  
  const code = 'print(input())';
  const testCases = [
    { input: 'hello', expected: 'hello' },
    { input: 'world', expected: 'world' }
  ];

  // Simulate the execute-code endpoint
  for (const tc of testCases) {
    const data = JSON.stringify({
      code: code,
      language: 'python',
      stdin: tc.input
    });

    const options = {
      hostname: 'localhost',
      port: 5000,
      path: '/api/student/execute-code',
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Content-Length': data.length,
        'Authorization': 'Bearer test-token-will-fail-but-check-error'
      }
    };

    try {
      await new Promise((resolve, reject) => {
        const req = http.request(options, (res) => {
          let body = '';
          res.on('data', chunk => body += chunk);
          res.on('end', () => {
            console.log(`Test: input="${tc.input}", expected="${tc.expected}"`);
            console.log(`Response:`, body);
            console.log('');
            resolve();
          });
        });

        req.on('error', reject);
        req.write(data);
        req.end();
      });
    } catch (err) {
      console.log(`❌ Error: ${err.message}\n`);
    }
  }
};

// Wait for backend to start
setTimeout(() => {
  testLocalCodeExecution().then(() => {
    console.log("✅ Test complete - check if Python executed locally!");
  });
}, 3000);
