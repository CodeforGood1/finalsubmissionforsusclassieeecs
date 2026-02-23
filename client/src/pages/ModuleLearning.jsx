import React, { useState, useEffect, useCallback } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import API_BASE_URL from '../config/api';

// Extract YouTube video ID and return a clean embed URL
const getYouTubeEmbedUrl = (url) => {
  if (!url) return '';
  const match = url.match(/(?:youtube\.com\/(?:watch\?v=|embed\/)|youtu\.be\/)([a-zA-Z0-9_-]{11})/);
  return match ? `https://www.youtube.com/embed/${match[1]}?rel=0&modestbranding=1` : url;
};

function ModuleLearning() {
  const { moduleId } = useParams();
  const navigate = useNavigate();
  const token = localStorage.getItem('token');

  const [module, setModule] = useState(null);
  const [steps, setSteps] = useState([]);
  const [currentStepIndex, setCurrentStepIndex] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [userName, setUserName] = useState('Student');

  // Coding state
  const [code, setCode] = useState('');
  const [language, setLanguage] = useState('java');
  const [output, setOutput] = useState('');
  const [isProcessing, setIsProcessing] = useState(false);

  // MCQ state
  const [selectedAnswer, setSelectedAnswer] = useState('');
  const [mcqSubmitted, setMcqSubmitted] = useState(false);
  const [mcqCorrect, setMcqCorrect] = useState(false);

  // Code submission state
  const [codeSubmitted, setCodeSubmitted] = useState(false);
  const [codeResults, setCodeResults] = useState(null);
  const [customInput, setCustomInput] = useState('');

  const langMap = {
    java: { name: "java", version: "15.0.2" },
    python: { name: "python", version: "3.10.0" },
    javascript: { name: "javascript", version: "18.15.0" },
    cpp: { name: "cpp", version: "10.2.0" }
  };

  const fetchModule = useCallback(async () => {
    try {
      // Get module details
      const res = await fetch(`${API_BASE_URL}/api/student/module/${moduleId}`, {
        headers: { 'Authorization': `Bearer ${token}` }
      });
      
      if (!res.ok) throw new Error('Failed to load module');
      
      const data = await res.json();
      console.log("Module data:", data);
      
      if (Array.isArray(data) && data.length > 0) {
        setModule({ topic_title: data[0].topic_title || 'Module' });
        setSteps(data);
      } else if (data.steps) {
        setModule(data);
        setSteps(data.steps);
      } else {
        setSteps([]);
      }

      // Get user name
      const profileRes = await fetch(`${API_BASE_URL}/api/student/profile`, {
        headers: { 'Authorization': `Bearer ${token}` }
      });
      if (profileRes.ok) {
        const profile = await profileRes.json();
        setUserName(profile.name || 'Student');
      }
    } catch (err) {
      console.error("Module fetch error:", err);
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, [moduleId, token]);

  useEffect(() => { fetchModule(); }, [fetchModule]);

  useEffect(() => {
    // Reset states when step changes
    setSelectedAnswer('');
    setMcqSubmitted(false);
    setMcqCorrect(false);
    setOutput('');
    setCodeSubmitted(false);
    setCodeResults(null);
    setCustomInput('');
    
    // Set starter code for coding steps
    const step = steps[currentStepIndex];
    if (step && step.step_type === 'coding' && step.mcq_data?.starterCode) {
      setCode(step.mcq_data.starterCode[language] || '// Write your solution here');
    }
  }, [currentStepIndex, steps, language]);

  const currentStep = steps[currentStepIndex];
  
  // Calculate progress based on completed steps from backend data
  const completedCount = steps.filter(step => step.is_completed).length;
  const progressPercent = steps.length > 0 ? (completedCount / steps.length) * 100 : 0;

  const handleMcqSubmit = () => {
    const correct = currentStep.mcq_data?.correct?.toUpperCase() === selectedAnswer.toUpperCase();
    setMcqCorrect(correct);
    setMcqSubmitted(true);
  };

  const handleCodeRun = async () => {
    setIsProcessing(true);
    setOutput('> Compiling...');
    try {
      const res = await fetch(`${API_BASE_URL}/api/student/execute-code`, {
        method: "POST",
        headers: { 
          "Content-Type": "application/json",
          "Authorization": `Bearer ${token}`
        },
        body: JSON.stringify({
          code: code,
          language: langMap[language]?.name || 'python',
          stdin: customInput
        }),
      });
      const data = await res.json();
      if (data.error) {
        setOutput(data.stderr || "Execution error");
      } else {
        setOutput(data.output || data.stderr || "No output.");
      }
    } catch (err) {
      setOutput("Execution failed: " + err.message);
    } finally {
      setIsProcessing(false);
    }
  };

  const handleCodeSubmit = async () => {
    const testCases = currentStep.mcq_data?.testCases || [];
    if (testCases.length === 0) {
      setOutput("No test cases defined for this problem.");
      return;
    }

    setIsProcessing(true);
    setOutput('> Running test cases...');
    setCodeSubmitted(false);
    setCodeResults(null);

    try {
      // Run code against each test case
      const results = [];
      let passedCount = 0;

      for (let i = 0; i < testCases.length; i++) {
        const tc = testCases[i];
        setOutput(`> Running test case ${i + 1} of ${testCases.length}...`);
        
        const res = await fetch(`${API_BASE_URL}/api/student/execute-code`, {
          method: "POST",
          headers: { 
            "Content-Type": "application/json",
            "Authorization": `Bearer ${token}`
          },
          body: JSON.stringify({
            code: code,
            language: langMap[language]?.name || 'python',
            stdin: tc.input || ''
          }),
        });
        
        const data = await res.json();
        const actualOutput = (data.output || '').trim();
        const expectedOutput = (tc.expected || '').trim();
        const passed = actualOutput === expectedOutput;
        
        if (passed) passedCount++;
        
        results.push({
          testCase: i + 1,
          input: tc.input,
          expected: expectedOutput,
          actual: actualOutput,
          passed,
          isHidden: tc.isHidden
        });
      }

      const score = ((passedCount / testCases.length) * 100).toFixed(0);
      
      // Save submission to backend
      try {
        await fetch(`${API_BASE_URL}/api/student/submit-code`, {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${token}`,
            'Content-Type': 'application/json'
          },
          body: JSON.stringify({
            moduleId,
            code,
            language: langMap[language]?.name || 'python',
            testCases: testCases.map(tc => ({ input: tc.input, expected: tc.expected }))
          })
        });
      } catch (saveErr) {
        console.error("Failed to save submission:", saveErr);
      }

      setCodeResults({ results, passedCount, total: testCases.length, score });
      setCodeSubmitted(true);
      setOutput(`✅ Completed: ${passedCount}/${testCases.length} test cases passed (${score}%)`);
      
    } catch (err) {
      setOutput("Execution failed: " + err.message);
    } finally {
      setIsProcessing(false);
    }
  };

  const handleNext = async () => {
    // Mark current step as complete
    try {
      const response = await fetch(`${API_BASE_URL}/api/student/module/${moduleId}/complete`, {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ stepIndex: currentStepIndex })
      });
      
      const result = await response.json();
      
      if (result.allComplete) {
        alert('Module completed! Great work!');
        navigate('/dashboard');
        return;
      }
    } catch (err) {
      console.error("Completion error:", err);
    }

    if (currentStepIndex < steps.length - 1) {
      setCurrentStepIndex(currentStepIndex + 1);
      // Refresh module data to update progress
      fetchModule();
    } else {
      alert('Module completed! Great work!');
      navigate('/dashboard');
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-slate-50 flex items-center justify-center">
        <div className="text-center">
          <div className="w-16 h-16 border-4 border-emerald-500 border-t-transparent rounded-full animate-spin mx-auto mb-4"></div>
          <p className="text-slate-500 font-bold">Loading module...</p>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="min-h-screen bg-slate-50 flex items-center justify-center">
        <div className="text-center bg-white p-12 rounded-3xl shadow-lg">
          <p className="text-red-500 font-bold mb-4">Error: {error}</p>
          <button onClick={() => navigate('/dashboard')} className="px-6 py-3 bg-slate-900 text-white rounded-xl font-bold">
            Return to Dashboard
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-50">
      {/* Header */}
      <div className="bg-white border-b border-slate-200 px-6 py-4">
        <div className="max-w-6xl mx-auto flex justify-between items-center">
          <button onClick={() => navigate('/courses')} className="text-slate-500 hover:text-emerald-600 font-medium flex items-center gap-2">
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 19l-7-7m0 0l7-7m-7 7h18" />
            </svg>
            Back to Courses
          </button>
          <div className="text-right">
            <p className="text-xs text-slate-400 uppercase font-bold">Progress</p>
            <p className="text-emerald-600 font-bold">{Math.round(progressPercent)}%</p>
          </div>
        </div>
      </div>

      {/* Progress Bar with better color indication */}
      <div className="bg-slate-200 h-1">
        <div 
          className={`h-full transition-all duration-500 ${
            progressPercent === 0 ? 'bg-slate-400' : 
            progressPercent < 100 ? 'bg-amber-500' : 
            'bg-emerald-500'
          }`} 
          style={{ width: `${Math.max(5, progressPercent)}%` }}
        ></div>
      </div>

      <main className="max-w-6xl mx-auto p-6">
        {/* Module Title */}
        <h1 className="text-2xl font-bold text-slate-800 mb-6">{module?.topic_title || 'Learning Module'}</h1>

        {/* Step Navigation */}
        <div className="flex gap-2 mb-8 overflow-x-auto pb-2">
          {steps.map((step, idx) => (
            <button
              key={idx}
              onClick={() => setCurrentStepIndex(idx)}
              className={`px-4 py-2 rounded-xl text-sm font-bold whitespace-nowrap transition-all ${
                idx === currentStepIndex
                  ? 'bg-blue-600 text-white' // Current step - blue
                  : step.is_completed
                  ? 'bg-emerald-100 text-emerald-700' // Completed - green
                  : 'bg-slate-200 text-slate-500' // Not started - gray
              }`}
            >
              Step {idx + 1}: {step.step_type?.toUpperCase() || 'Content'}
            </button>
          ))}
        </div>

        {/* Current Step Content */}
        {currentStep && (
          <div className="bg-white rounded-3xl shadow-lg border border-slate-200 p-8">
            {/* Step Header */}
            <div className="mb-6">
              <p className="text-xs text-slate-400 uppercase font-bold mb-2">
                Step {currentStepIndex + 1} of {steps.length} - {currentStep.step_type?.toUpperCase()}
              </p>
              <h2 className="text-xl font-bold text-slate-800">{currentStep.step_header || 'Lesson'}</h2>
            </div>

            {/* TEXT CONTENT */}
            {currentStep.step_type === 'text' && (
              <div className="prose max-w-none">
                <div className="bg-slate-50 p-6 rounded-2xl whitespace-pre-wrap text-slate-700 leading-relaxed">
                  {currentStep.content || 'No content available.'}
                </div>
              </div>
            )}

            {/* CODE EXAMPLE */}
            {currentStep.step_type === 'code' && (
              <div className="bg-slate-900 rounded-2xl overflow-hidden">
                <div className="px-4 py-2 bg-slate-800 text-xs text-slate-400 font-bold uppercase">Code Example</div>
                <pre className="p-4 text-emerald-400 font-mono text-sm overflow-x-auto">
                  {currentStep.content || '// No code provided'}
                </pre>
              </div>
            )}

            {/* VIDEO CONTENT */}
            {currentStep.step_type === 'video' && (
              <div className="space-y-4">
                {currentStep.content?.includes('youtube') || currentStep.content?.includes('youtu.be') ? (
                  <div className="aspect-video bg-slate-900 rounded-2xl overflow-hidden">
                    <iframe
                      className="w-full h-full"
                      src={getYouTubeEmbedUrl(currentStep.content)}
                      title="Video"
                      frameBorder="0"
                      allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
                      referrerPolicy="origin"
                      allowFullScreen
                    />
                  </div>
                ) : (
                  /* Support ALL video URLs - local uploads, cloudinary, any .mp4/.webm/.ogg */
                  <video 
                    controls 
                    className="w-full rounded-2xl bg-slate-900"
                    style={{ maxHeight: '70vh' }}
                  >
                    <source 
                      src={currentStep.content?.startsWith('http') ? currentStep.content : 
                           currentStep.content?.startsWith('/') ? currentStep.content :
                           `/uploads/videos/${currentStep.content}`} 
                      type={currentStep.content?.endsWith('.webm') ? 'video/webm' : 
                            currentStep.content?.endsWith('.ogg') ? 'video/ogg' : 'video/mp4'} 
                    />
                    Your browser does not support video playback.
                  </video>
                )}
              </div>
            )}

            {/* JITSI LIVE VIDEO */}
            {currentStep.step_type === 'jitsi' && (
              <div className="space-y-4">
                <div className="bg-gradient-to-br from-indigo-50 to-purple-50 p-8 rounded-2xl border-2 border-indigo-200 text-center">
                  <div className="w-16 h-16 bg-indigo-500 rounded-full flex items-center justify-center mx-auto mb-4">
                    <svg className="w-8 h-8 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 10l4.553-2.276A1 1 0 0121 8.618v6.764a1 1 0 01-1.447.894L15 14M5 18h8a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v8a2 2 0 002 2z" />
                    </svg>
                  </div>
                  <h3 className="text-xl font-bold text-indigo-900 mb-2">Live Session</h3>
                  <p className="text-indigo-700 mb-2">Room: {currentStep.mcq_data?.roomName || currentStep.content}</p>
                  {currentStep.mcq_data?.scheduledTime && (
                    <p className="text-indigo-600 text-sm mb-4">
                      Scheduled: {new Date(currentStep.mcq_data.scheduledTime).toLocaleString()}
                    </p>
                  )}
                  {currentStep.mcq_data?.duration && (
                    <p className="text-indigo-600 text-sm mb-4">Duration: {currentStep.mcq_data.duration} minutes</p>
                  )}
                  <button
                    onClick={() => {
                      const rawRoom = currentStep.mcq_data?.roomName || currentStep.content || 'classroom';
                      const cleanRoom = rawRoom.toLowerCase().replace(/\s+/g, '-').replace(/[^a-z0-9-]/g, '').substring(0, 50) || 'classroom';
                      window.open(`https://localhost:8443/${cleanRoom}`, '_blank');
                    }}
                    className="px-8 py-4 bg-indigo-600 text-white rounded-2xl font-bold hover:bg-indigo-700 transition-all"
                  >
                    Join Live Session
                  </button>
                  <p className="text-indigo-500 text-xs mt-3">Opens in a new tab for the best experience</p>
                </div>
              </div>
            )}

            {/* MCQ QUIZ */}
            {currentStep.step_type === 'mcq' && currentStep.mcq_data && (
              <div className="space-y-6">
                <div className="bg-slate-50 p-6 rounded-2xl">
                  <p className="text-lg font-bold text-slate-800 mb-6">{currentStep.mcq_data.question}</p>
                  <div className="space-y-3">
                    {['a', 'b', 'c', 'd'].map(opt => (
                      currentStep.mcq_data[opt] && (
                        <button
                          key={opt}
                          onClick={() => !mcqSubmitted && setSelectedAnswer(opt.toUpperCase())}
                          disabled={mcqSubmitted}
                          className={`w-full p-4 rounded-xl text-left font-medium transition-all ${
                            mcqSubmitted
                              ? opt.toUpperCase() === currentStep.mcq_data.correct?.toUpperCase()
                                ? 'bg-emerald-100 border-2 border-emerald-500 text-emerald-700'
                                : selectedAnswer === opt.toUpperCase()
                                ? 'bg-red-100 border-2 border-red-500 text-red-700'
                                : 'bg-slate-100 border-2 border-transparent text-slate-500'
                              : selectedAnswer === opt.toUpperCase()
                              ? 'bg-blue-100 border-2 border-blue-500 text-blue-700'
                              : 'bg-slate-100 border-2 border-transparent hover:bg-slate-200'
                          }`}
                        >
                          <span className="font-bold mr-3">{opt.toUpperCase()}.</span>
                          {currentStep.mcq_data[opt]}
                        </button>
                      )
                    ))}
                  </div>
                </div>
                
                {!mcqSubmitted ? (
                  <button
                    onClick={handleMcqSubmit}
                    disabled={!selectedAnswer}
                    className="px-8 py-4 bg-emerald-600 text-white rounded-xl font-bold disabled:bg-slate-300"
                  >
                    Submit Answer
                  </button>
                ) : (
                  <div className={`p-4 rounded-xl ${mcqCorrect ? 'bg-emerald-100 text-emerald-700' : 'bg-red-100 text-red-700'}`}>
                    <p className="font-bold">{mcqCorrect ? 'Correct!' : 'Incorrect.'} The answer is {currentStep.mcq_data.correct}.</p>
                  </div>
                )}
              </div>
            )}

            {/* CODING PROBLEM */}
            {(currentStep.step_type === 'coding' || currentStep.step_type === 'code') && (
              <div className="space-y-6">
                {/* Problem Description */}
                {currentStep.mcq_data?.description && (
                  <div className="bg-slate-50 p-6 rounded-2xl">
                    <p className="text-slate-700 whitespace-pre-wrap">{currentStep.mcq_data.description}</p>
                  </div>
                )}

                {/* Sample Test Cases (non-hidden) */}
                {currentStep.mcq_data?.testCases && currentStep.mcq_data.testCases.filter(tc => !tc.isHidden).length > 0 && (
                  <div className="bg-blue-50 p-4 rounded-xl">
                    <p className="text-sm font-bold text-blue-800 mb-3">Sample Test Cases:</p>
                    <div className="space-y-2">
                      {currentStep.mcq_data.testCases.filter(tc => !tc.isHidden).map((tc, idx) => (
                        <div key={idx} className="grid grid-cols-2 gap-4 text-sm">
                          <div className="bg-white p-2 rounded font-mono">
                            <span className="text-slate-500 text-xs">Input:</span>
                            <pre className="text-slate-700">{tc.input || '(empty)'}</pre>
                          </div>
                          <div className="bg-white p-2 rounded font-mono">
                            <span className="text-slate-500 text-xs">Expected:</span>
                            <pre className="text-slate-700">{tc.expected || '(empty)'}</pre>
                          </div>
                        </div>
                      ))}
                    </div>
                    {currentStep.mcq_data.testCases.some(tc => tc.isHidden) && (
                      <p className="text-xs text-blue-600 mt-2">+ {currentStep.mcq_data.testCases.filter(tc => tc.isHidden).length} hidden test case(s)</p>
                    )}
                  </div>
                )}

                {/* Language Selector */}
                <div className="flex gap-4 items-center">
                  <label className="text-sm font-bold text-slate-600">Language:</label>
                  <select
                    value={language}
                    onChange={(e) => setLanguage(e.target.value)}
                    className="px-4 py-2 border rounded-lg font-medium"
                  >
                    <option value="java">Java</option>
                    <option value="python">Python</option>
                    <option value="javascript">JavaScript</option>
                    <option value="cpp">C++</option>
                  </select>
                </div>

                {/* Code Editor */}
                <div className="bg-slate-900 rounded-2xl overflow-hidden">
                  <div className="px-4 py-2 bg-slate-800 text-xs text-slate-400 font-bold uppercase">Code Editor</div>
                  <textarea
                    value={code}
                    onChange={(e) => setCode(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === 'Tab') {
                        e.preventDefault();
                        const start = e.target.selectionStart;
                        const end = e.target.selectionEnd;
                        const newCode = code.substring(0, start) + '  ' + code.substring(end);
                        setCode(newCode);
                        requestAnimationFrame(() => {
                          e.target.selectionStart = start + 2;
                          e.target.selectionEnd = start + 2;
                        });
                      }
                    }}
                    className="w-full h-64 p-4 bg-slate-900 text-emerald-400 font-mono text-sm outline-none resize-none"
                    spellCheck={false}
                  />
                </div>

                {/* Custom Input for Run */}
                <div className="bg-slate-100 rounded-xl p-4">
                  <p className="text-xs text-slate-500 font-bold uppercase mb-2">Custom Input (for Run)</p>
                  <textarea
                    value={customInput}
                    onChange={(e) => setCustomInput(e.target.value)}
                    placeholder="Enter custom input here..."
                    className="w-full h-20 p-3 bg-white border rounded-lg font-mono text-sm outline-none resize-none"
                  />
                </div>

                {/* Output */}
                <div className="bg-slate-800 rounded-2xl p-4">
                  <p className="text-xs text-slate-500 font-bold uppercase mb-2">Output</p>
                  <pre className="text-emerald-400 font-mono text-sm whitespace-pre-wrap min-h-[60px]">
                    {output || 'Run your code to see output...'}
                  </pre>
                </div>

                {/* Test Case Results */}
                {codeSubmitted && codeResults && (
                  <div className={`p-4 rounded-xl ${codeResults.passedCount === codeResults.total ? 'bg-emerald-50' : 'bg-amber-50'}`}>
                    <div className="flex items-center justify-between mb-4">
                      <p className="font-bold text-lg">
                        {codeResults.passedCount === codeResults.total ? 'All Tests Passed!' : `${codeResults.passedCount}/${codeResults.total} Tests Passed`}
                      </p>
                      <span className={`px-3 py-1 rounded-full text-sm font-bold ${
                        parseInt(codeResults.score) >= 70 ? 'bg-emerald-500 text-white' : 
                        parseInt(codeResults.score) >= 40 ? 'bg-amber-500 text-white' : 'bg-red-500 text-white'
                      }`}>
                        Score: {codeResults.score}%
                      </span>
                    </div>
                    <div className="space-y-2">
                      {codeResults.results.map((r, idx) => (
                        <div key={idx} className={`p-3 rounded-lg ${r.passed ? 'bg-emerald-100' : 'bg-red-100'}`}>
                          <div className="flex items-center gap-2 mb-1">
                            <span className={`text-lg font-bold ${r.passed ? 'text-emerald-600' : 'text-red-600'}`}>
                              {r.passed ? 'PASS' : 'FAIL'}
                            </span>
                            <span className="font-medium">Test Case {r.testCase}</span>
                            {r.isHidden && <span className="text-xs bg-slate-300 px-2 py-0.5 rounded">Hidden</span>}
                          </div>
                          {!r.isHidden && !r.passed && (
                            <div className="text-sm mt-2 grid grid-cols-3 gap-2 font-mono">
                              <div><span className="text-slate-500">Input:</span> <pre className="inline">{r.input || '(empty)'}</pre></div>
                              <div><span className="text-slate-500">Expected:</span> <pre className="inline">{r.expected}</pre></div>
                              <div><span className="text-red-600">Got:</span> <pre className="inline">{r.actual}</pre></div>
                            </div>
                          )}
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* Run and Submit Buttons */}
                <div className="flex gap-4">
                  <button
                    onClick={handleCodeRun}
                    disabled={isProcessing}
                    className="px-8 py-4 bg-slate-600 text-white rounded-xl font-bold hover:bg-slate-700 disabled:bg-slate-400"
                  >
                    {isProcessing ? 'Running...' : '▶ Run Code'}
                  </button>
                  {currentStep.mcq_data?.testCases && currentStep.mcq_data.testCases.length > 0 && (
                    <button
                      onClick={handleCodeSubmit}
                      disabled={isProcessing}
                      className="px-8 py-4 bg-emerald-600 text-white rounded-xl font-bold hover:bg-emerald-700 disabled:bg-slate-400"
                    >
                      {isProcessing ? 'Validating...' : '✓ Submit Code'}
                    </button>
                  )}
                </div>
              </div>
            )}

            {/* Next Button */}
            <div className="mt-8 pt-6 border-t border-slate-200 flex justify-between">
              <button
                onClick={() => setCurrentStepIndex(Math.max(0, currentStepIndex - 1))}
                disabled={currentStepIndex === 0}
                className="px-6 py-3 text-slate-500 font-bold disabled:opacity-30"
              >
                Previous
              </button>
              <button
                onClick={handleNext}
                className="px-8 py-3 bg-slate-900 text-white rounded-xl font-bold hover:bg-black"
              >
                {currentStepIndex < steps.length - 1 ? 'Next Step' : 'Complete Module'}
              </button>
            </div>
          </div>
        )}
      </main>
    </div>
  );
}

export default ModuleLearning;
