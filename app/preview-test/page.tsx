"use client";

import dynamic from "next/dynamic";

const CodePanel = dynamic(
  () => import("@/components/CodePanel").then((mod) => mod.CodePanel),
  { ssr: false }
);

const sampleFileData = {
  title: "Test Kanban Board",
  files: {
    "/App.js": {
      code: `import React, { useState } from "react";
import { Plus, Trash2, CheckCircle } from "lucide-react";

export default function App() {
  const [tasks, setTasks] = useState([
    { id: 1, text: "Explore AI App Builder", status: "todo" },
    { id: 2, text: "Build React Kanban Preview", status: "done" },
  ]);
  const [input, setInput] = useState("");

  const addTask = () => {
    if (!input.trim()) return;
    setTasks([...tasks, { id: Date.now(), text: input.trim(), status: "todo" }]);
    setInput("");
  };

  const toggleStatus = (id) => {
    setTasks(
      tasks.map((t) =>
        t.id === id ? { ...t, status: t.status === "todo" ? "done" : "todo" } : t
      )
    );
  };

  const deleteTask = (id) => {
    setTasks(tasks.filter((t) => t.id !== id));
  };

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 p-8 flex flex-col items-center">
      <div className="max-w-md w-full bg-slate-900 border border-slate-800 rounded-2xl p-6 shadow-2xl">
        <h1 className="text-2xl font-bold text-center bg-gradient-to-r from-blue-400 to-violet-400 bg-clip-text text-transparent mb-6">
          Live Sandbox Preview
        </h1>

        <div className="flex gap-2 mb-6">
          <input
            type="text"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && addTask()}
            placeholder="Add new task..."
            className="flex-1 bg-slate-800 border border-slate-700 rounded-xl px-4 py-2 text-sm text-white placeholder:text-slate-500 focus:outline-none focus:border-blue-500"
          />
          <button
            onClick={addTask}
            className="bg-blue-600 hover:bg-blue-500 text-white px-4 py-2 rounded-xl text-sm font-medium flex items-center gap-1 transition-all"
          >
            <Plus size={16} /> Add
          </button>
        </div>

        <div className="space-y-3">
          {tasks.map((t) => (
            <div
              key={t.id}
              className="flex items-center justify-between p-3 bg-slate-800/60 border border-slate-700/50 rounded-xl transition-all hover:bg-slate-800"
            >
              <div
                onClick={() => toggleStatus(t.id)}
                className="flex items-center gap-3 cursor-pointer flex-1"
              >
                <CheckCircle
                  size={18}
                  className={t.status === "done" ? "text-emerald-400" : "text-slate-600"}
                />
                <span
                  className={
                    t.status === "done"
                      ? "line-through text-slate-500 text-sm"
                      : "text-slate-200 text-sm"
                  }
                >
                  {t.text}
                </span>
              </div>
              <button
                onClick={() => deleteTask(t.id)}
                className="text-slate-500 hover:text-red-400 transition-colors p-1"
              >
                <Trash2 size={16} />
              </button>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}`,
    },
  },
  dependencies: {
    "lucide-react": "latest",
  },
};

export default function PreviewTestPage() {
  return (
    <div className="h-screen w-screen flex flex-col bg-[#0a0a0a]">
      <div className="p-3 border-b border-white/10 text-white font-medium text-sm flex items-center justify-between">
        <span>Sandbox Live Preview Test Page</span>
        <span className="text-xs text-emerald-400 bg-emerald-400/10 px-2 py-0.5 rounded-full border border-emerald-400/20">
          Ready
        </span>
      </div>
      <div className="flex-1 min-h-0">
        <CodePanel
          fileData={sampleFileData}
          isGenerating={false}
          statusLog={[]}
          onImprove={async () => {}}
          onFixError={async () => {}}
          onFilePatch={() => {}}
          appTitle="Test Kanban Board"
          isImproving={false}
          workspaceId="test-workspace"
          userId="test-user"
        />
      </div>
    </div>
  );
}
