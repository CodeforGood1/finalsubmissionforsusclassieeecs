// Test if code execution works offline
// This simulates the /api/student/submit-code endpoint

const testCodeExecution = async () => {
  console.log("🧪 Testing code execution offline...\n");
  
  const code = `print(input())`;
  const language = 'python';
  const testCases = [
    { input: 'hello', expected: 'hello' },
    { input: 'world', expected: 'world' }
  ];

  console.log("📝 Test Code:");
  console.log(code);
  console.log("\n📋 Test Cases:", JSON.stringify(testCases, null, 2));
  console.log("\n🌐 Attempting to call Piston API...\n");

  let passedCount = 0;

  for (const tc of testCases) {
    try {
      console.log(`⏳ Running test case: input="${tc.input}", expected="${tc.expected}"`);
      
      const response = await fetch("https://emkc.org/api/v2/piston/execute", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          language: language,
          version: "*",
          files: [{ content: code }],
          stdin: tc.input,
        }),
      });

      const result = await response.json();
      const actualOutput = (result.run.stdout || "").trim();
      
      console.log(`   📤 Actual output: "${actualOutput}"`);
      
      if (actualOutput === tc.expected.trim()) {
        passedCount++;
        console.log(`   ✅ PASS\n`);
      } else {
        console.log(`   ❌ FAIL (expected "${tc.expected}")\n`);
      }
    } catch (err) {
      console.log(`   🚫 ERROR: ${err.message}`);
      console.log(`   ⚠️  This proves the code CANNOT work offline!\n`);
      return;
    }
  }

  console.log(`\n🎯 Final Result: ${passedCount}/${testCases.length} tests passed`);
  console.log("✅ If you see this, the code DOES work (somehow) - there must be internet!");
};

// Run the test
testCodeExecution().catch(err => {
  console.error("\n💥 Fatal Error:", err.message);
  console.log("\n📌 Conclusion: Code execution REQUIRES internet to reach emkc.org");
  console.log("   The system CANNOT work offline as currently implemented.");
});
