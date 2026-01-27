import React, { useState, useEffect, useCallback } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import API_BASE_URL from '../config/api';

function CoursePlayer() {
  const { moduleId } = useParams();
  const navigate = useNavigate();
  const token = localStorage.getItem('token');

  // Module & Problem State
  const [currentStep, setCurrentStep] = useState(null);
  const [dbTestCases, setDbTestCases] = useState([]);
  const [loading, setLoading] = useState(true);

  // Coding Workspace State
  const [language, setLanguage] = useState('java');
  const [code, setCode] = useState('');
  const [userInput, setUserInput] = useState('');
  const [output, setOutput] = useState('Terminal ready...');
  const [isProcessing, setIsProcessing] = useState(false);

  // Piston API Language Mapping
  const langMap = {
    java: { name: "java", version: "15.0.2" },
    python: { name: "python", version: "3.10.0" },
    javascript: { name: "javascript", version: "18.15.0" }
  };

  const fetchModuleContent = useCallback(async () => {
    try {
      const res = await fetch(`${API_BASE_URL}/api/student/module/${moduleId}`, {
        headers: { 'Authorization': `Bearer ${token}` }
      });
      const data = await res.json();
      
      if (res.ok) {
        // Find the coding challenge in the steps array
        const codingChallenge = data.find(s => s.step_type === 'coding');
        if (codingChallenge) {
          setCurrentStep(codingChallenge);
          const mData = codingChallenge.mcq_data || {};
          setDbTestCases(mData.testCases || []);
          // Set starter code if teacher provided it, else blank
          setCode(mData.starterCode?.[language] || "// Write your solution here");
        }
      }
    } catch (err) {
      console.error(err);
      setOutput("Error: Could not connect to server.");
    } finally {
      setLoading(false);
    }
  }, [moduleId, token, language]);

  useEffect(() => { fetchModuleContent(); }, [fetchModuleContent]);

  const runTest = async () => {
    setIsProcessing(true);
    setOutput("> Compiling and Running...");
    try {
      const res = await fetch("https://emkc.org/api/v2/piston/execute", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ 
          language: langMap[language].name, 
          version: langMap[language].version, 
          files: [{ content: code }], 
          stdin: userInput 
        }),
      });
      const data = await res.json();
      setOutput(data.run.output || data.run.stderr || "No output.");
    } catch (err) { 
      console.error(err);
      setOutput("Execution failed."); }
    finally { setIsProcessing(false); }
  };

  const handleSubmit = async () => {
    setIsProcessing(true);
    try {
      const res = await fetch(`${API_BASE_URL}/api/student/submit-code`, {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ moduleId, code, language, testCases: dbTestCases })
      });
      const data = await res.json();
      if (res.ok) {
        alert(`🏆 MISSION ACCOMPLISHED\nScore: ${data.score}%\nTests Passed: ${data.passed}/${data.total}`);
        navigate('/dashboard');
      }
    } catch (err) { 
      console.error(err);
      alert("Submission failed."); }
    finally { setIsProcessing(false); }
  };

  if (loading) return <div className="p-20 text-center font-black animate-pulse text-slate-400">LOADING ENVIRONMENT...</div>;

  return (
    <div className="min-h-screen bg-[#f8fafc] p-6 font-sans">
      {/* 1. TOP HEADER: DYNAMIC QUESTION FETCHED FROM DB */}
      <div className="bg-white p-8 rounded-[2.5rem] shadow-sm border border-slate-200 mb-6">
        <h2 className="text-emerald-500 text-[10px] font-black uppercase tracking-[0.3em] mb-2">Challenge Objective</h2>
        <h1 className="text-slate-500 text-sm font-medium leading-relaxed max-w-5xl">
          {currentStep?.mcq_data?.description || "No description provided for this task."}
        </h1>
      </div>

      {/* 2. MAIN WORKSPACE */}
      <div className="grid grid-cols-12 gap-6 h-[65vh]">
        
        {/* LEFT: TEST CASES (Fetched from DB) */}
        <div className="col-span-3 space-y-4 overflow-y-auto">
          <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest px-2">Public Test Cases</p>
          {dbTestCases.filter(tc => !tc.isHidden).map((tc, i) => (
            <div key={i} className="bg-white p-5 rounded-3xl border border-slate-200 shadow-sm">
              <div className="flex justify-between items-center mb-3">
                <span className="text-[9px] font-black text-emerald-600 bg-emerald-50 px-2 py-1 rounded-lg uppercase">Case {i+1}</span>
              </div>
              <div className="space-y-3">
                <div>
                  <p className="text-[8px] font-bold text-slate-400 uppercase mb-1">Input</p>
                  <pre className="text-[11px] bg-slate-50 p-2 rounded-xl font-mono border border-slate-100">{tc.input || 'None'}</pre>
                </div>
                <div>
                  <p className="text-[8px] font-bold text-slate-400 uppercase mb-1">Expected</p>
                  <pre className="text-[11px] bg-emerald-50 text-emerald-700 p-2 rounded-xl font-mono border border-emerald-100">{tc.expected}</pre>
                </div>
              </div>
            </div>
          ))}
          {dbTestCases.some(tc => tc.isHidden) && (
            <div className="bg-slate-900 p-4 rounded-3xl text-center">
              <p className="text-[10px] font-bold text-slate-400">🔒 {dbTestCases.filter(tc => tc.isHidden).length} Hidden Tests Locked</p>
            </div>
          )}
        </div>

        {/* MIDDLE: EDITOR */}
        <div className="col-span-6 flex flex-col gap-4">
          <div className="flex-[3] bg-white rounded-[2.5rem] shadow-xl border border-slate-200 overflow-hidden flex flex-col">
            <div className="px-6 py-4 bg-slate-50 border-b flex justify-between items-center">
              <span className="text-[10px] font-black text-slate-400 uppercase">Logic Editor</span>
              <select value={language} onChange={(e) => setLanguage(e.target.value)} className="text-[10px] font-bold bg-white border rounded-lg px-2 py-1 outline-none">
                <option value="java">Java</option>
                <option value="python">Python</option>
                <option value="javascript">Node.js</option>
              </select>
            </div>
            <textarea 
              value={code} 
              onChange={(e) => setCode(e.target.value)} 
              className="flex-1 p-8 font-mono text-sm outline-none resize-none" 
              spellCheck="false" 
            />
          </div>

          <div className="flex-1 bg-white rounded-[2rem] border-2 border-emerald-50 overflow-hidden flex flex-col shadow-inner">
            <div className="px-6 py-2 bg-emerald-50 text-[9px] font-black text-emerald-700 uppercase">Interactive Stdin</div>
            <textarea 
              value={userInput} 
              onChange={(e) => setUserInput(e.target.value)} 
              className="flex-1 p-4 font-mono text-xs outline-none" 
              placeholder="Enter manual input for 'Run Code'..." 
            />
          </div>
        </div>

        {/* RIGHT: TERMINAL & ACTIONS */}
        <div className="col-span-3 flex flex-col gap-4">
          <button onClick={runTest} className="w-full py-4 bg-slate-200 rounded-2xl text-[10px] font-black uppercase tracking-widest hover:bg-slate-300 transition-all">
            Run Code
          </button>
          <button 
            onClick={handleSubmit} 
            disabled={isProcessing} 
            className="w-full py-4 bg-slate-900 text-white rounded-2xl text-[10px] font-black uppercase tracking-widest shadow-lg hover:bg-black transition-all"
          >
            {isProcessing ? "Validating..." : "Submit Solution"}
          </button>
          
          <div className="flex-1 bg-[#0f172a] rounded-[2rem] p-6 font-mono text-xs text-emerald-400 overflow-y-auto shadow-2xl border-[6px] border-slate-800">
            <div className="text-slate-500 mb-4 pb-2 border-b border-slate-800 uppercase text-[9px] font-black">System Output</div>
            <pre className="whitespace-pre-wrap">{output}</pre>
          </div>
        </div>

      </div>
    </div>
  );
}

export default CoursePlayer;