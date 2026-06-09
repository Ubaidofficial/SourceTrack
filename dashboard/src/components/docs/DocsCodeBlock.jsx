import React, { useState } from 'react'

export default function DocsCodeBlock({ children, lang = 'javascript' }) {
  const [copied, setCopied] = useState(false)

  function copy() {
    if (children) {
      navigator.clipboard.writeText(children.trim())
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    }
  }

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
      <pre className="bg-[#0d1117] border border-[#30363d] rounded-b-xl px-4 py-3 overflow-x-auto text-[13px] text-gray-300 font-mono leading-relaxed max-w-full select-all">
        <code>{children ? children.trim() : ''}</code>
      </pre>
    </div>
  )
}
