import { Highlight, themes } from 'prism-react-renderer'
import { Check, Copy } from 'lucide-react'
import { toast } from 'sonner'
import Button from '../ui/Button.jsx'

export default function CodeSnippetViewer({ language, code, onCopy }) {
  async function handleCopy() {
    await navigator.clipboard.writeText(code)
    onCopy?.()
    toast.success('Tracking snippet copied')
  }

  return (
    <div className="overflow-hidden rounded-3xl border border-white/10 bg-slate-950/90">
      <div className="flex items-center justify-between border-b border-white/10 px-4 py-3">
        <div className="text-sm font-medium uppercase tracking-[0.24em] text-slate-400">
          {language}
        </div>
        <Button variant="secondary" size="sm" onClick={handleCopy} className="gap-2">
          <Copy className="h-4 w-4" />
          Copy
        </Button>
      </div>
      <Highlight code={code} language={language} theme={themes.nightOwl}>
        {({ className, style, tokens, getLineProps, getTokenProps }) => (
          <pre className={`${className} overflow-x-auto p-5 text-sm`} style={style}>
            {tokens.map((line, index) => (
              <div key={index} {...getLineProps({ line })}>
                <span className="mr-4 inline-block w-6 select-none text-slate-600">
                  {index + 1}
                </span>
                {line.map((token, tokenIndex) => (
                  <span key={tokenIndex} {...getTokenProps({ token })} />
                ))}
              </div>
            ))}
          </pre>
        )}
      </Highlight>
      <div className="flex items-center gap-2 border-t border-white/10 px-4 py-3 text-xs text-emerald-300">
        <Check className="h-4 w-4" />
        Snippet is ready for your instrumentation layer.
      </div>
    </div>
  )
}
