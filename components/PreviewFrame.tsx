// components/PreviewFrame.tsx
"use client";

import React, { useEffect, useRef, useState, useMemo } from "react";
import {
  RotateCw,
  ExternalLink,
  Smartphone,
  Tablet,
  Monitor,
  AlertTriangle,
  Loader2,
  CheckCircle2,
} from "lucide-react";
import type { FileData } from "@/types/workspace";

interface PreviewFrameProps {
  fileData: FileData | null;
  onError?: (err: string | null) => void;
  className?: string;
}

type DeviceMode = "desktop" | "tablet" | "mobile";

export function PreviewFrame({
  fileData,
  onError,
  className = "",
}: PreviewFrameProps) {
  const iframeRef = useRef<HTMLIFrameElement>(null);
  const [device, setDevice] = useState<DeviceMode>("desktop");
  const [key, setKey] = useState(0);
  const [isLoading, setIsLoading] = useState(true);
  const [localError, setLocalError] = useState<string | null>(null);

  const handleRefresh = () => {
    setIsLoading(true);
    setLocalError(null);
    setKey((prev) => prev + 1);
  };

  const handleOpenNewTab = () => {
    const blob = new Blob([srcDocContent], { type: "text/html" });
    const url = URL.createObjectURL(blob);
    window.open(url, "_blank");
  };

  // Listen for postMessage from inside iframe
  useEffect(() => {
    const handleMessage = (event: MessageEvent) => {
      if (!event.data || typeof event.data !== "object") return;
      if (event.data.type === "forge-preview-error") {
        const msg = event.data.message || "An error occurred in preview.";
        setLocalError(msg);
        onError?.(msg);
        setIsLoading(false);
      } else if (event.data.type === "forge-preview-success") {
        setLocalError(null);
        onError?.(null);
        setIsLoading(false);
      }
    };

    window.addEventListener("message", handleMessage);
    return () => window.removeEventListener("message", handleMessage);
  }, [onError]);

  // Generate self-contained HTML bundle with Babel Standalone, React 18, Tailwind CSS, Lucide Icons
  const srcDocContent = useMemo(() => {
    const files = fileData?.files ?? {};
    const safeFilesJson = JSON.stringify(files).replace(/</g, "\\u003c");

    return `<!DOCTYPE html>
<html lang="en" class="dark">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>Forge Live Preview</title>
  
  <!-- Fonts -->
  <link rel="preconnect" href="https://fonts.googleapis.com" />
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin />
  <link href="https://fonts.googleapis.com/css2?family=Inter:wght@300;400;500;600;700;800&display=swap" rel="stylesheet" />
  
  <!-- Tailwind CSS -->
  <script src="https://cdn.tailwindcss.com"></script>
  <script>
    tailwind.config = {
      darkMode: 'class',
      theme: {
        extend: {
          fontFamily: {
            sans: ['Inter', 'system-ui', 'sans-serif'],
          },
          colors: {
            border: 'rgba(255,255,255,0.1)',
            background: '#09090b',
            foreground: '#f4f4f5',
          }
        }
      }
    }
  </script>

  <!-- React 18 & ReactDOM -->
  <script crossorigin src="https://unpkg.com/react@18.3.1/umd/react.production.min.js"></script>
  <script crossorigin src="https://unpkg.com/react-dom@18.3.1/umd/react-dom.production.min.js"></script>
  
  <!-- Lucide Icons UMD -->
  <script src="https://unpkg.com/lucide@latest/dist/umd/lucide.min.js"></script>
  
  <!-- Babel Standalone for live JSX/TSX compilation -->
  <script src="https://unpkg.com/@babel/standalone@7.24.0/babel.min.js"></script>

  <style>
    * { box-sizing: border-box; }
    html, body, #root {
      min-height: 100vh;
      margin: 0;
      padding: 0;
      background-color: #09090b;
      color: #f4f4f5;
      font-family: 'Inter', system-ui, -apple-system, sans-serif;
      -webkit-font-smoothing: antialiased;
    }
    /* Scrollbar */
    ::-webkit-scrollbar { width: 6px; height: 6px; }
    ::-webkit-scrollbar-track { background: transparent; }
    ::-webkit-scrollbar-thumb { background: rgba(255,255,255,0.15); border-radius: 9999px; }
    ::-webkit-scrollbar-thumb:hover { background: rgba(255,255,255,0.25); }
    
    #forge-error-box {
      display: none;
      padding: 1.5rem;
      margin: 1rem;
      background: rgba(127, 29, 29, 0.4);
      border: 1px solid rgba(239, 68, 68, 0.3);
      border-radius: 0.75rem;
      color: #fca5a5;
      font-family: monospace;
      font-size: 0.85rem;
      white-space: pre-wrap;
    }
  </style>
</head>
<body class="bg-[#09090b] text-[#f4f4f5]">
  <div id="root">
    <div style="min-height: 100vh; display: flex; align-items: center; justify-content: center; color: rgba(255,255,255,0.4); font-size: 14px;">
      <div style="text-align: center;">
        <div style="font-size: 32px; margin-bottom: 8px;">⚡</div>
        <p>Loading interactive live preview…</p>
      </div>
    </div>
  </div>
  <div id="forge-error-box"></div>

  <script>
    window.__FORGE_FILES__ = ${safeFilesJson};

    // Error reporters
    function reportError(err) {
      console.error("[Forge Live Preview Error]", err);
      const errBox = document.getElementById("forge-error-box");
      if (errBox) {
        errBox.style.display = "block";
        errBox.textContent = "Preview Error: " + (err.message || String(err));
      }
      window.parent.postMessage({ type: "forge-preview-error", message: err.message || String(err) }, "*");
    }

    window.onerror = function(msg, url, line, col, err) {
      reportError(err || msg);
      return true;
    };

    window.addEventListener("unhandledrejection", function(e) {
      reportError(e.reason || "Unhandled Promise Rejection");
    });

    // Universal Lucide React Component Proxy
    const LucideProxy = new Proxy({}, {
      get: function(target, prop) {
        if (typeof prop !== "string") return undefined;
        return function DynamicIcon(props) {
          const { size = 20, color = "currentColor", className = "", style = {}, strokeWidth = 2, ...rest } = props || {};
          
          // Render SVG using Lucide JS or generic fallback
          const svgRef = React.useRef(null);
          
          React.useEffect(() => {
            if (svgRef.current && window.lucide) {
              const kebabName = prop.replace(/([a-z0-9])([A-Z])/g, "$1-$2").toLowerCase();
              const iconDef = window.lucide.icons ? window.lucide.icons[prop] || window.lucide.icons[kebabName] : null;
              if (iconDef && iconDef.toSvg) {
                svgRef.current.innerHTML = iconDef.toSvg({
                  size: String(size),
                  "stroke-width": String(strokeWidth),
                  class: className,
                  color: color
                });
                const firstSvg = svgRef.current.querySelector("svg");
                if (firstSvg) {
                  firstSvg.style.width = typeof size === "number" ? size + "px" : size;
                  firstSvg.style.height = typeof size === "number" ? size + "px" : size;
                }
              }
            }
          }, [prop, size, color, className, strokeWidth]);

          return React.createElement("span", {
            ref: svgRef,
            style: { display: "inline-flex", alignItems: "center", justifyContent: "center", width: size, height: size, verticalAlign: "middle", ...style },
            className: className,
            ...rest
          }, React.createElement("svg", {
            width: size,
            height: size,
            viewBox: "0 0 24 24",
            fill: "none",
            stroke: color,
            strokeWidth: strokeWidth,
            strokeLinecap: "round",
            strokeLinejoin: "round"
          }, React.createElement("circle", { cx: "12", cy: "12", r: "4" })));
        };
      }
    });

    // Environment & Module System
    window.__modules__ = {
      "react": window.React,
      "react-dom": window.ReactDOM,
      "react-dom/client": window.ReactDOM,
      "lucide-react": LucideProxy,
      "react-icons": LucideProxy,
      "react-icons/fi": LucideProxy,
      "react-icons/fa": LucideProxy,
      "react-icons/lu": LucideProxy,
      "react-icons/hi": LucideProxy,
      "react-icons/md": LucideProxy,
      "clsx": function() {
        return Array.prototype.slice.call(arguments).flat(Infinity).filter(Boolean).join(" ");
      },
      "tailwind-merge": {
        twMerge: function() {
          return Array.prototype.slice.call(arguments).flat(Infinity).filter(Boolean).join(" ");
        }
      },
      "class-variance-authority": {
        cva: function(base) {
          return function() { return base || ""; };
        }
      },
      "framer-motion": {
        motion: new Proxy({}, {
          get: (t, el) => React.forwardRef((p, r) => {
            const { initial, animate, exit, transition, whileHover, whileTap, ...rest } = p || {};
            return React.createElement(el, { ref: r, ...rest });
          })
        }),
        AnimatePresence: ({ children }) => React.createElement(React.Fragment, null, children)
      }
    };

    function cleanPath(p) {
      if (!p) return "";
      var s = String(p);
      if (s.indexOf("./") === 0) s = s.substring(2);
      if (s.indexOf("/") === 0) s = s.substring(1);
      if (s.indexOf("src/") === 0) s = s.substring(4);
      var dotIdx = s.lastIndexOf(".");
      if (dotIdx > 0) s = s.substring(0, dotIdx);
      return s;
    }

    function customRequire(name) {
      if (window.__modules__[name]) return window.__modules__[name];
      var target = cleanPath(name);
      for (var k in window.__modules__) {
        if (cleanPath(k) === target) return window.__modules__[k];
      }
      return LucideProxy;
    }

    // Build and mount React app
    try {
      const files = window.__FORGE_FILES__ || {};
      
      // If no files, render placeholder
      if (Object.keys(files).length === 0) {
        document.getElementById("root").innerHTML = '<div style="min-height:100vh;display:flex;align-items:center;justify-content:center;color:rgba(255,255,255,0.3);font-size:14px;"><div style="text-align:center;"><div style="font-size:40px;margin-bottom:16px;">⚡</div><p>Your generated app preview will appear here</p></div></div>';
        window.parent.postMessage({ type: "forge-preview-success" }, "*");
      } else {
        // Collect and sort files
        const fileEntries = Object.entries(files);
        
        // Find App entry
        let appEntry = fileEntries.find(([path]) => 
          path.endsWith("/App.js") || path.endsWith("/App.jsx") || path.endsWith("/App.tsx") || path === "App.js" || path === "App.jsx" || path === "App.tsx"
        );

        if (!appEntry) {
          appEntry = fileEntries.find(([path, f]) => {
            const code = typeof f === "object" && f && "code" in f ? f.code : String(f || "");
            return code.includes("export default") && !path.includes("styles.css");
          });
        }

        // Transpile helper
        function transpileFile(code, path) {
          const transformed = Babel.transform(code, {
            presets: ["react", "env"],
            filename: path,
          }).code;

          const module = { exports: {} };
          const exports = module.exports;
          const fn = new Function("require", "module", "exports", "React", transformed);
          fn(customRequire, module, exports, window.React);
          return module.exports;
        }

        // Transpile non-app components first
        for (const [path, fileObj] of fileEntries) {
          if (appEntry && path === appEntry[0]) continue;
          if (path.endsWith(".css") || path.endsWith(".html") || path.endsWith(".json")) continue;
          
          const rawCode = typeof fileObj === "object" && fileObj && "code" in fileObj ? fileObj.code : String(fileObj || "");
          try {
            const modExports = transpileFile(rawCode, path);
            window.__modules__[path] = modExports.default || modExports;
          } catch (e) {
            console.warn("Could not pre-transpile " + path, e);
          }
        }

        // Transpile and render App component
        if (appEntry) {
          const appCode = typeof appEntry[1] === "object" && appEntry[1] && "code" in appEntry[1] ? appEntry[1].code : String(appEntry[1] || "");
          const appMod = transpileFile(appCode, appEntry[0]);
          const AppComponent = appMod.default || appMod;

          if (typeof AppComponent === "function") {
            const root = ReactDOM.createRoot(document.getElementById("root"));
            root.render(React.createElement(AppComponent));
            window.parent.postMessage({ type: "forge-preview-success" }, "*");
          } else {
            throw new Error("Default export in App component is not a valid React component.");
          }
        }
      }
    } catch (err) {
      reportError(err);
    }
  </script>
</body>
</html>`;
  }, [fileData]);

  const deviceWidthClass = {
    desktop: "w-full h-full",
    tablet: "w-[768px] h-[90%] shadow-2xl rounded-xl border border-white/10 my-auto",
    mobile: "w-[375px] h-[667px] shadow-2xl rounded-2xl border border-white/10 my-auto",
  }[device];

  return (
    <div className={`relative flex flex-col h-full w-full min-h-0 bg-[#070709] overflow-hidden ${className}`}>
      {/* Top Bar Controls */}
      <div className="flex items-center justify-between px-3 py-1.5 border-b border-white/[0.08] bg-[#0d0d11] shrink-0 text-xs select-none">
        <div className="flex items-center gap-1.5">
          <div className="flex items-center gap-1 bg-white/[0.04] p-0.5 rounded-lg border border-white/[0.06]">
            <button
              onClick={() => setDevice("desktop")}
              title="Desktop View"
              className={`p-1 rounded-md transition-colors cursor-pointer ${
                device === "desktop"
                  ? "bg-violet-600/30 text-violet-300 border border-violet-500/30 shadow-sm"
                  : "text-white/40 hover:text-white/80"
              }`}
            >
              <Monitor className="h-3.5 w-3.5" />
            </button>
            <button
              onClick={() => setDevice("tablet")}
              title="Tablet View (768px)"
              className={`p-1 rounded-md transition-colors cursor-pointer ${
                device === "tablet"
                  ? "bg-violet-600/30 text-violet-300 border border-violet-500/30 shadow-sm"
                  : "text-white/40 hover:text-white/80"
              }`}
            >
              <Tablet className="h-3.5 w-3.5" />
            </button>
            <button
              onClick={() => setDevice("mobile")}
              title="Mobile View (375px)"
              className={`p-1 rounded-md transition-colors cursor-pointer ${
                device === "mobile"
                  ? "bg-violet-600/30 text-violet-300 border border-violet-500/30 shadow-sm"
                  : "text-white/40 hover:text-white/80"
              }`}
            >
              <Smartphone className="h-3.5 w-3.5" />
            </button>
          </div>

          <span className="text-[11px] text-white/30 font-mono ml-2 hidden sm:inline">
            {device === "desktop" ? "Responsive" : device === "tablet" ? "768 × 1024" : "375 × 667"}
          </span>
        </div>

        <div className="flex items-center gap-2">
          {isLoading ? (
            <span className="flex items-center gap-1 text-[11px] text-amber-400/80">
              <Loader2 className="h-3 w-3 animate-spin" /> Compiling
            </span>
          ) : localError ? (
            <span className="flex items-center gap-1 text-[11px] text-red-400">
              <AlertTriangle className="h-3 w-3" /> Error
            </span>
          ) : (
            <span className="flex items-center gap-1 text-[11px] text-emerald-400/90">
              <CheckCircle2 className="h-3 w-3" /> Live Sandbox
            </span>
          )}

          <button
            onClick={handleRefresh}
            title="Reload Preview"
            className="p-1 rounded-md text-white/40 hover:text-white/90 hover:bg-white/[0.06] transition-colors cursor-pointer"
          >
            <RotateCw className="h-3.5 w-3.5" />
          </button>

          <button
            onClick={handleOpenNewTab}
            title="Open Preview in New Tab"
            className="p-1 rounded-md text-white/40 hover:text-white/90 hover:bg-white/[0.06] transition-colors cursor-pointer"
          >
            <ExternalLink className="h-3.5 w-3.5" />
          </button>
        </div>
      </div>

      {/* Main Viewport Container */}
      <div className="relative flex-1 flex items-center justify-center p-0 overflow-auto bg-[#070709]">
        <iframe
          key={key}
          ref={iframeRef}
          srcDoc={srcDocContent}
          title="Live Application Preview"
          sandbox="allow-scripts allow-modals allow-same-origin allow-forms allow-popups"
          className={`${deviceWidthClass} border-none transition-all duration-300 bg-[#09090b]`}
        />
      </div>
    </div>
  );
}
