import { useEffect, useState } from 'react'
import ReactMarkdown from 'react-markdown'

const mdComponents = {
  ul: ({ children }) => <ul className="list-disc list-inside text-left space-y-1 my-2">{children}</ul>,
  ol: ({ children }) => <ol className="list-decimal list-inside text-left space-y-1 my-2">{children}</ol>,
  li: ({ children }) => <li className="text-ink-2">{children}</li>,
  p: ({ children }) => <p className="text-ink-2 my-1">{children}</p>,
  img: ({ src, alt }) => (
    <img src={src} alt={alt || ''} className="max-w-full max-h-64 rounded-2xl mx-auto my-2 object-contain" />
  ),
  strong: ({ children }) => <strong className="font-bold text-ink">{children}</strong>,
}

function normalizeBullets(text) {
  return text.replace(/^[•·]\s*/gm, '- ')
}

export default function CardRenderer({ content }) {
  const steps = content.split('\n---\n').filter(s => s.trim())
  const [step, setStep] = useState(0)

  useEffect(() => { setStep(0) }, [content])

  if (steps.length <= 1) {
    return <ReactMarkdown components={mdComponents}>{normalizeBullets(content)}</ReactMarkdown>
  }

  return (
    <div>
      <ReactMarkdown components={mdComponents}>{normalizeBullets(steps[step])}</ReactMarkdown>
      <div className="flex items-center justify-between mt-3 pt-2 border-t border-rule">
        <button
          type="button"
          onClick={() => setStep(s => s - 1)}
          disabled={step === 0}
          className="w-8 h-8 flex items-center justify-center text-ink-3 hover:text-ink disabled:opacity-30 text-xl rounded-xl hover:bg-rule/40 transition-colors"
        >
          ‹
        </button>
        <span className="text-xs font-bold uppercase tracking-[1.5px] text-ink-3">{step + 1} / {steps.length}</span>
        <button
          type="button"
          onClick={() => setStep(s => s + 1)}
          disabled={step === steps.length - 1}
          className="w-8 h-8 flex items-center justify-center text-ink-3 hover:text-ink disabled:opacity-30 text-xl rounded-xl hover:bg-rule/40 transition-colors"
        >
          ›
        </button>
      </div>
    </div>
  )
}
