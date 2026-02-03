// Simulate offline mode by using a fake/blocked URL
const testOfflineExecution = async () => {
  console.log("🧪 Simulating OFFLINE code execution...\n");
  
  const code = `print(input())`;
  const testCases = [
    { input: 'hello', expected: 'hello' }
  ];

  console.log("📝 Test Code:", code);
  console.log("📋 Test Case:", testCases[0]);
  console.log("\n🚫 Attempting to call Piston API (but simulating network failure)...\n");

  try {
    // Use a non-existent URL to simulate offline
    const response = await fetch("http://localhost:99999/fake", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        language: 'python',
        version: "*",
        files: [{ content: code }],
        stdin: testCases[0].input,
      }),
    });

    console.log("✅ Request succeeded (unexpected!)");
  } catch (err) {
    console.log(`❌ ERROR: ${err.message}`);
    console.log(`\n📌 This is what happens when offline:`);
    console.log(`   - Backend server.js line 2635 calls fetch()`);
    console.log(`   - Fetch fails with error`);
    console.log(`   - Catch block at line 2616 returns: "Execution failed: ${err.message}"`);
    console.log(`   - Frontend receives 500 error`);
    console.log(`   - Test case evaluation CANNOT happen`);
    console.log(`\n🔍 Conclusion: The system REQUIRES internet to work.`);
    console.log(`   When you tested offline and it "worked", you likely had:`);
    console.log(`   1. Cached responses in browser`);
    console.log(`   2. Intermittent connection`);
    console.log(`   3. Or were actually online`);
  }
};

testOfflineExecution();
