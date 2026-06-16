import { useRef, useState } from 'react'
import { supabase } from '../lib/supabase'
import CardRenderer from './CardRenderer'

const STEP_SEP = '\n---\n'

export default function CardEditor({ value, onChange, placeholder = 'Réponse…' }) {
  const textareaRef = useRef()
  const fileRef = useRef()
  const [uploading, setUploading] = useState(false)
  const [preview, setPreview] = useState(false)
  const [stepMode, setStepMode] = useState(() => value.includes(STEP_SEP))

  const steps = value.split(STEP_SEP)

  function toggleStepMode() {
    setStepMode(s => !s)
  }

  function updateStep(idx, newVal) {
    const newSteps = [...steps]
    newSteps[idx] = newVal
    onChange(newSteps.join(STEP_SEP))
  }

  function addStep() {
    onChange(value + STEP_SEP)
  }

  function removeStep(idx) {
    const newSteps = steps.filter((_, i) => i !== idx)
    onChange(newSteps.join(STEP_SEP))
  }

  function insertAtCursor(before, after = '') {
    const el = textareaRef.current
    const start = el.selectionStart
    const end = el.selectionEnd
    const selected = value.slice(start, end)
    const newVal = value.slice(0, start) + before + selected + after + value.slice(end)
    onChange(newVal)
    setTimeout(() => {
      el.focus()
      el.setSelectionRange(start + before.length, start + before.length + selected.length)
    }, 0)
  }

  function insertBulletList() {
    const el = textareaRef.current
    const start = el.selectionStart
    const lineStart = value.lastIndexOf('\n', start - 1) + 1
    const prefix = value.slice(lineStart, start).startsWith('- ') ? '' : '- '
    if (prefix) {
      insertAtCursor('- ')
    } else {
      const newVal = value.slice(0, start) + '\n- ' + value.slice(start)
      onChange(newVal)
    }
  }

  function insertNumberedList() {
    const lines = value.split('\n')
    const el = textareaRef.current
    const cursorLine = value.slice(0, el.selectionStart).split('\n').length - 1
    const isAlreadyNumbered = /^\d+\.\s/.test(lines[cursorLine] || '')
    if (!isAlreadyNumbered) {
      insertAtCursor('1. ')
    }
  }

  async function handleImageUpload(e) {
    const file = e.target.files[0]
    if (!file) return
    setUploading(true)

    const ext = file.name.split('.').pop()
    const path = `${Date.now()}-${Math.random().toString(36).slice(2)}.${ext}`

    const { error } = await supabase.storage.from('card-images').upload(path, file)
    if (error) {
      alert('Erreur upload image. Vérifiez que le bucket "card-images" existe dans Supabase Storage.')
      setUploading(false)
      return
    }

    const { data } = supabase.storage.from('card-images').getPublicUrl(path)
    const markdown = `\n![](${data.publicUrl})\n`
    onChange(value + markdown)
    setUploading(false)
    e.target.value = ''
  }

  const toolbarBtn = (active) =>
    `px-2 py-1 text-xs rounded-lg transition-colors ${
      active ? 'bg-foret text-ivoire' : 'text-ink-3 hover:bg-rule/40 hover:text-ink'
    }`

  return (
    <div className="border border-rule rounded-[14px] overflow-hidden focus-within:border-foret transition-colors">
      {/* Toolbar */}
      <div className="flex items-center gap-1 px-2 py-1.5 border-b border-rule bg-ivoire">
        {!stepMode && (
          <>
            <button type="button" title="Liste à puces" onClick={insertBulletList} className={toolbarBtn(false) + ' font-mono'}>
              • Liste
            </button>
            <button type="button" title="Liste numérotée" onClick={insertNumberedList} className={toolbarBtn(false) + ' font-mono'}>
              1. Liste
            </button>
            <button type="button" title="Gras" onClick={() => insertAtCursor('**', '**')} className={toolbarBtn(false) + ' font-bold'}>
              G
            </button>
            <div className="w-px h-4 bg-rule mx-1" />
            <button
              type="button"
              onClick={() => fileRef.current.click()}
              disabled={uploading}
              className={toolbarBtn(false) + ' disabled:opacity-40'}
            >
              {uploading ? 'Upload…' : 'Image'}
            </button>
            <input ref={fileRef} type="file" accept="image/*" onChange={handleImageUpload} className="hidden" />
            <div className="w-px h-4 bg-rule mx-1" />
          </>
        )}
        <button type="button" onClick={toggleStepMode} className={toolbarBtn(stepMode)}>
          Par étapes
        </button>
        <div className="flex-1" />
        <button type="button" onClick={() => setPreview(!preview)} className={toolbarBtn(preview)}>
          {preview ? 'Éditer' : 'Aperçu'}
        </button>
      </div>

      {/* Editor / Preview */}
      {preview ? (
        <div className="px-3 py-2 min-h-20 text-sm bg-ivoire-2">
          {value
            ? <CardRenderer content={value} />
            : <span className="text-ink-3 text-sm">{placeholder}</span>
          }
        </div>
      ) : stepMode ? (
        <div className="divide-y divide-rule bg-ivoire-2">
          {steps.map((stepContent, idx) => (
            <div key={idx}>
              <div className="flex items-center justify-between px-3 pt-2">
                <span className="text-xs font-bold uppercase tracking-[1.5px] text-laiton">Étape {idx + 1}</span>
                {steps.length > 1 && (
                  <button
                    type="button"
                    onClick={() => removeStep(idx)}
                    className="text-ink-3 hover:text-seal text-sm leading-none transition-colors"
                  >
                    ×
                  </button>
                )}
              </div>
              <textarea
                value={stepContent}
                onChange={e => updateStep(idx, e.target.value)}
                placeholder={`Contenu de l'étape ${idx + 1}…`}
                rows={3}
                className="w-full px-3 py-2 text-sm focus:outline-none resize-none bg-ivoire-2 text-ink placeholder:text-ink-3"
              />
            </div>
          ))}
          <div className="px-3 py-2">
            <button
              type="button"
              onClick={addStep}
              className="text-xs font-bold uppercase tracking-[1px] text-laiton hover:text-foret transition-colors"
            >
              + Ajouter une étape
            </button>
          </div>
        </div>
      ) : (
        <textarea
          ref={textareaRef}
          value={value}
          onChange={e => onChange(e.target.value)}
          placeholder={placeholder}
          rows={3}
          className="w-full px-3 py-2 text-sm focus:outline-none resize-none bg-ivoire-2 text-ink placeholder:text-ink-3"
        />
      )}
    </div>
  )
}
