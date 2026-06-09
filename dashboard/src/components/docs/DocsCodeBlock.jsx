import React, { useState } from 'react'

export default function DocsCodeBlock({ children, lang = 'javascript', replaceKey = false, pasteOnce = false }) {
  const [copied, setCopied] = useState(false)

  function copy() {
    if (children) {
      navigator.clipboard.writeText(children.trim())
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    }
  }

  const hasFooter = replaceKey || pasteOnce

  return (
    <div className="relative group my-4">
      <div className="flex items-center justify-between bg-[#0d1117] rounded-t-xl px-4 py-2 border border-[#30363d] border-b-0 select-none">
        <span className="text-[10px] text-gray-500 font-mono uppercase tracking-wide">{lang}</span>
        <button
          onClick={copy}
          className="flex items-center gap-1 text-[10px] text-gray-500 hover:text-gray-300 transition-colors font-bold"
        >
          {copied ? 'Copied!' : 'Copy'}
        </button>
      </div>
      <pre className={`bg-[#0d1117] border border-[#30363d] px-4 py-3 overflow-x-auto text-[13px] text-gray-300 font-mono leading-relaxed max-w-full select-all ${hasFooter ? 'rounded-b-none' : 'rounded-b-xl'}`}>
        <code>{children ? children.trim() : ''}</code>
      </pre>
      {hasFooter && (
        <div className="flex flex-wrap gap-x-4 gap-y-1 bg-[#161b22] border border-[#30363d] border-t-0 rounded-b-xl px-4 py-2 text-[11px] text-gray-400 font-medium">
          {replaceKey && (
            <span className="flex items-center gap-1.5">
              <span className="w-1.5 h-1.5 rounded-full bg-amber-500"></span>
              Replace only <code className="text-amber-400 bg-gray-800 px-1 py-0.5 rounded font-mono text-[10px]">YOUR_SITE_KEY</code> with your real key.
            </span>
          )}
          {pasteOnce && (
            <span className="flex items-center gap-1.5">
              <span className="w-1.5 h-1.5 rounded-full bg-blue-500"></span>
              Paste this once on every page (typically inside the <code className="text-blue-400 bg-gray-800 px-1 py-0.5 rounded font-mono text-[10px]">&lt;head&gt;</code>).
            </span>
          )}
        </div>
      )}
    </div>
  )
}
