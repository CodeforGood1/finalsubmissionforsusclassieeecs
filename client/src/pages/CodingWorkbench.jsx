import React, { useState } from 'react';
import API_BASE_URL from '../config/api';

function CodingWorkbench() {

  
  // 1. STATE MANAGEMENT
  const [language, setLanguage] = useState('java');
  const [code, setCode] = useState(`import java.util.*;

public class Solution {
    public static void main(String[] args) {
        Scanner in = new Scanner(System.in);
        
        // Safety check: Exit if no input is provided in stdin
        if (!in.hasNext()) {
            return; 
        }

        int a = in.nextInt();
        System.out.println("Result: " + a);
        System.out.println("Hello World!!!");
    }
}`);
  const [userInput, setUserInput] = useState(''); 
  const [output, setOutput] = useState('Terminal idle. Enter input and run code.');
  const [isRunning, setIsRunning] = useState(false);

  // 2. ENGINE CONFIGURATION
  const languageSpecs = {
    java: { name: "java", version: "15.0.2" },
    python: { name: "python", version: "3.10.0" },
    javascript: { name: "javascript", version: "18.15.0" },
    cpp: { name: "c++", version: "10.2.0" }
  };

  // 3. EXECUTION LOGIC
  const executeCode = async () => {
    setIsRunning(true);
    setOutput("> Executing...");

    try {
      const token = localStorage.getItem('token');
      const response = await fetch(`${API_BASE_URL}/api/student/execute-code`, {
        method: "POST",
        headers: { 
          "Content-Type": "application/json",
          "Authorization": `Bearer ${token}`
        },
        body: JSON.stringify({
          code: code,
          language: languageSpecs[language].name,
          stdin: userInput,
        }),
      });

      const data = await response.json();
      
      if (data.error) {
        setOutput(data.stderr || data.output || "> Execution error.");
      } else {
        setOutput(data.output || data.stderr || "> No output returned.");
      }
    } catch (error) {
      setOutput(`> Connection Error: ${error.message}`);
    } finally {
      setIsRunning(false);
    }
  };

  return (
    <div className="min-h-screen bg-slate-50 p-6 lg:p-10 font-sans text-slate-800">
      <div className="max-w-7xl mx-auto">
        
        {/* HEADER */}
        <header className="mb-8 flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div>
            <h1 className="text-3xl font-black text-slate-900 uppercase italic tracking-tighter">
              Coding <span className="text-emerald-600">Wrench</span>
            </h1>
            <p className="text-slate-400 text-[9px] font-bold uppercase tracking-[0.3em]">Execution Environment</p>
          </div>

          <div className="flex items-center gap-4 bg-white p-2 rounded-2xl shadow-sm border border-slate-100">
            <select 
              value={language} 
              onChange={(e) => setLanguage(e.target.value)}
              className="bg-transparent px-4 py-2 font-bold text-xs outline-none cursor-pointer"
            >
              <option value="java">Java (OpenJDK)</option>
              <option value="python">Python 3</option>
              <option value="javascript">Node.js</option>
              <option value="cpp">C++</option>
            </select>
            
            <button 
              onClick={executeCode}
              disabled={isRunning}
              className={`px-8 py-3 rounded-xl font-black uppercase text-[10px] tracking-widest transition-all ${
                isRunning ? 'bg-slate-200 text-slate-400' : 'bg-slate-900 text-white hover:bg-emerald-600 shadow-lg'
              }`}
            >
              {isRunning ? 'Running...' : 'Run Code'}
            </button>
          </div>
        </header>

        {/* WORKSPACE */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-8 h-[75vh]">
          
          {/* LEFT: EDITOR & STDIN */}
          <div className="flex flex-col gap-6 h-full">
            <div className="flex-1 bg-white rounded-[2rem] shadow-xl border border-slate-100 overflow-hidden flex flex-col">
              <div className="px-6 py-3 border-b border-slate-50 bg-slate-50/50 flex justify-between">
                <span className="text-[9px] font-black text-slate-400 uppercase tracking-widest">Input Editor</span>
              </div>
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
                spellCheck="false"
                className="flex-1 p-6 font-mono text-sm outline-none resize-none text-slate-700 custom-scrollbar"
              />
            </div>

            {/* STDIN BOX */}
            <div className={`h-36 bg-white rounded-[1.5rem] shadow-lg border-2 transition-colors overflow-hidden flex flex-col border-slate-100`}>
              <div className="px-5 py-2 border-b bg-slate-50/50 flex justify-between">
                <span className="text-[8px] font-black text-slate-500 uppercase tracking-widest">Program Input (stdin)</span>
              </div>
              <textarea
                value={userInput}
                onChange={(e) => setUserInput(e.target.value)}
                placeholder="Enter numbers or strings for your Scanner here..."
                className="flex-1 p-4 font-mono text-sm outline-none resize-none bg-transparent"
              />
            </div>
          </div>

          {/* RIGHT: OUTPUT TERMINAL */}
          <div className="bg-[#0f172a] rounded-[2.5rem] shadow-2xl overflow-hidden flex flex-col h-full border-[6px] border-[#1e293b]">
            <div className="px-6 py-4 border-b border-slate-800 bg-[#1e293b]/50 flex justify-between items-center">
              <div className="flex gap-1.5">
                <div className="w-2.5 h-2.5 rounded-full bg-red-500/30 border border-red-500/50"></div>
                <div className="w-2.5 h-2.5 rounded-full bg-amber-500/30 border border-amber-500/50"></div>
                <div className="w-2.5 h-2.5 rounded-full bg-emerald-500/30 border border-emerald-500/50"></div>
                <span className="text-[9px] font-black text-slate-500 uppercase tracking-widest ml-3">Terminal Output</span>
              </div>
              <button onClick={() => setOutput('')} className="text-[8px] font-bold text-slate-600 hover:text-slate-400 uppercase">Clear</button>
            </div>
            <pre className="flex-1 p-8 font-mono text-xs text-emerald-400 overflow-y-auto custom-scrollbar leading-relaxed">
              {output}
            </pre>
          </div>
        </div>

      </div>
      <style>{`
        .custom-scrollbar::-webkit-scrollbar { width: 5px; }
        .custom-scrollbar::-webkit-scrollbar-thumb { background: #cbd5e1; border-radius: 10px; }
      `}</style>
    </div>
  );
}

export default CodingWorkbench;