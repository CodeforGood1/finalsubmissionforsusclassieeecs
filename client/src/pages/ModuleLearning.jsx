import React, { useState, useEffect, useCallback } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import API_BASE_URL from '../config/api';
import JitsiMeet from '../components/JitsiMeet';

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

  // Jitsi state
  const [showJitsi, setShowJitsi] = useState(false);

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
    setShowJitsi(false);
    
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
      const res = await fetch("https://emkc.org/api/v2/piston/execute", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          language: langMap[language]?.name || 'python',
          version: langMap[language]?.version || '3.10.0',
          files: [{ content: code }],
          stdin: ''
        }),
      });
      const data = await res.json();
      setOutput(data.run?.output || data.run?.stderr || "No output.");
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
        alert('🎉 Module completed! Great work!');
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
      alert('🎉 Module completed! Great work!');
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
                      src={currentStep.content?.replace('watch?v=', 'embed/').replace('youtu.be/', 'www.youtube.com/embed/')}
                      title="Video"
                      frameBorder="0"
                      allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
                      allowFullScreen
                    />
                  </div>
                ) : currentStep.content?.includes('cloudinary') || currentStep.content?.endsWith('.mp4') ? (
                  <video controls className="w-full rounded-2xl bg-slate-900">
                    <source src={currentStep.content} type="video/mp4" />
                    Your browser does not support video playback.
                  </video>
                ) : (
                  <div className="bg-slate-100 p-8 rounded-2xl text-center">
                    <p className="text-slate-500">Video URL: {currentStep.content}</p>
                  </div>
                )}
              </div>
            )}

            {/* JITSI LIVE VIDEO */}
            {currentStep.step_type === 'jitsi' && (
              <div className="space-y-4">
                {!showJitsi ? (
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
                    <button
                      onClick={() => setShowJitsi(true)}
                      className="px-8 py-4 bg-indigo-600 text-white rounded-2xl font-bold hover:bg-indigo-700 transition-all"
                    >
                      Join Live Session
                    </button>
                  </div>
                ) : (
                  <JitsiMeet
                    roomName={currentStep.mcq_data?.roomName || currentStep.content || 'classroom'}
                    displayName={userName}
                    onClose={() => setShowJitsi(false)}
                  />
                )}
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
                    <p className="text-slate-700">{currentStep.mcq_data.description}</p>
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
                    className="w-full h-64 p-4 bg-slate-900 text-emerald-400 font-mono text-sm outline-none resize-none"
                    spellCheck={false}
                  />
                </div>

                {/* Output */}
                <div className="bg-slate-800 rounded-2xl p-4">
                  <p className="text-xs text-slate-500 font-bold uppercase mb-2">Output</p>
                  <pre className="text-emerald-400 font-mono text-sm whitespace-pre-wrap min-h-[60px]">
                    {output || 'Run your code to see output...'}
                  </pre>
                </div>

                {/* Run Button */}
                <button
                  onClick={handleCodeRun}
                  disabled={isProcessing}
                  className="px-8 py-4 bg-emerald-600 text-white rounded-xl font-bold hover:bg-emerald-700 disabled:bg-slate-400"
                >
                  {isProcessing ? 'Running...' : 'Run Code'}
                </button>
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
