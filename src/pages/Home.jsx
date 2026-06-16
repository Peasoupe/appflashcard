import { useEffect, useMemo, useRef, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { useAuth } from '../contexts/AuthContext'

function parseCSV(text) {
  const cards = []
  let pos = 0
  const len = text.length

  function parseField(sep) {
    if (pos < len && text[pos] === '"') {
      pos++
      let value = ''
      while (pos < len) {
        if (text[pos] === '"') {
          if (text[pos + 1] === '"') { value += '"'; pos += 2 }
          else { pos++; break }
        } else {
          value += text[pos++]
        }
      }
      if (pos < len && (text[pos] === sep || text[pos] === ';' || text[pos] === ',')) pos++
      return value
    } else {
      let start = pos
      while (pos < len && text[pos] !== sep && text[pos] !== '\n' && text[pos] !== '\r') pos++
      const value = text.slice(start, pos).trim()
      if (pos < len && (text[pos] === sep || text[pos] === ';' || text[pos] === ',')) pos++
      return value
    }
  }

  while (pos < len) {
    while (pos < len && (text[pos] === '\r' || text[pos] === '\n')) pos++
    if (pos >= len) break

    const rowStart = pos
    let sep = ','
    {
      let p = pos
      if (text[p] === '"') { p++; while (p < len && !(text[p] === '"' && text[p+1] !== '"')) p++; p += 2 }
      else { while (p < len && text[p] !== ',' && text[p] !== ';' && text[p] !== '\n') p++ }
      if (p < len && text[p] === ';') sep = ';'
    }
    pos = rowStart

    const front = parseField(sep)
    const back = parseField(sep)
    while (pos < len && text[pos] !== '\n') pos++
    if (front && back) cards.push({ front, back })
  }

  return cards
}

async function parseExcel(buffer) {
  const XLSX = await import('xlsx')
  const workbook = XLSX.read(buffer, { type: 'array' })
  const sheet = workbook.Sheets[workbook.SheetNames[0]]
  const rows = XLSX.utils.sheet_to_json(sheet, { header: 1, defval: '' })
  const cards = []
  for (const row of rows) {
    const front = String(row[0] ?? '').trim()
    const back = String(row[1] ?? '').trim()
    if (front && back) cards.push({ front, back })
  }
  return cards
}

async function parseWord(buffer) {
  const { default: JSZip } = await import('jszip')
  const zip = await JSZip.loadAsync(buffer)
  const xmlFile = zip.files['word/document.xml']
  if (!xmlFile) return []
  const xml = await xmlFile.async('string')

  const doc = new DOMParser().parseFromString(xml, 'application/xml')
  const WNS = 'http://schemas.openxmlformats.org/wordprocessingml/2006/main'
  const paragraphs = doc.getElementsByTagNameNS(WNS, 'p')

  const cards = []
  let currentFront = null
  let backLines = []

  function flushCard() {
    if (currentFront && backLines.length > 0) {
      cards.push({ front: currentFront, back: backLines.join('\n').trim() })
    }
    backLines = []
    currentFront = null
  }

  for (const p of paragraphs) {
    const pPr = p.getElementsByTagNameNS(WNS, 'pPr')[0]
    const pStyle = pPr?.getElementsByTagNameNS(WNS, 'pStyle')[0]?.getAttribute(`${WNS.replace('http://schemas.openxmlformats.org/wordprocessingml/2006/main', '')}val`)
      ?? pPr?.getElementsByTagNameNS(WNS, 'pStyle')[0]?.getAttributeNS(WNS, 'val')
      ?? pPr?.getElementsByTagNameNS(WNS, 'pStyle')[0]?.getAttribute('w:val')
      ?? ''

    const tNodes = p.getElementsByTagNameNS(WNS, 't')
    const text = Array.from(tNodes).map(t => t.textContent).join('').trim()
    const isHeading = /^(Heading|Titre|heading|titre)\d?$/i.test(pStyle) || /^heading/i.test(pStyle)

    if (isHeading) {
      flushCard()
      if (text) currentFront = text
    } else if (currentFront !== null) {
      if (text === '---') backLines.push('---')
      else if (text) backLines.push(text)
    }
  }
  flushCard()
  return cards
}

async function parsePPTX(buffer) {
  const { default: JSZip } = await import('jszip')
  const zip = await JSZip.loadAsync(buffer)
  const slideEntries = Object.keys(zip.files)
    .filter(name => /^ppt\/slides\/slide\d+\.xml$/.test(name))
    .sort((a, b) => {
      const n = s => parseInt(s.match(/\d+/)[0])
      return n(a) - n(b)
    })

  function extractShapeTexts(xml) {
    const parser = new DOMParser()
    const doc = parser.parseFromString(xml, 'application/xml')
    const shapes = []
    const spNodes = doc.getElementsByTagNameNS('http://schemas.openxmlformats.org/presentationml/2006/main', 'sp')

    for (const sp of spNodes) {
      const phNodes = sp.getElementsByTagNameNS('http://schemas.openxmlformats.org/presentationml/2006/main', 'ph')
      const phType = phNodes.length > 0 ? (phNodes[0].getAttribute('type') || 'body') : 'body'
      const pNodes = sp.getElementsByTagNameNS('http://schemas.openxmlformats.org/drawingml/2006/main', 'p')
      const paragraphs = []
      for (const p of pNodes) {
        const runs = p.getElementsByTagNameNS('http://schemas.openxmlformats.org/drawingml/2006/main', 't')
        const line = Array.from(runs).map(t => t.textContent).join('')
        if (line.trim()) paragraphs.push(line)
      }
      const text = paragraphs.join('\n').trim()
      if (text) shapes.push({ type: phType, text })
    }
    return shapes
  }

  const cards = []
  for (const slidePath of slideEntries) {
    const xml = await zip.files[slidePath].async('string')
    const shapes = extractShapeTexts(xml)
    const titleShape = shapes.find(s => s.type === 'title' || s.type === 'ctrTitle')
    const bodyShapes = shapes.filter(s => s !== titleShape)
    const front = titleShape ? titleShape.text : (shapes[0]?.text ?? '')
    const back = bodyShapes.length > 0 ? bodyShapes.map(s => s.text).join('\n') : (shapes[1]?.text ?? '')
    if (front && back) cards.push({ front, back })
  }
  return cards
}

const AI_PROMPTS = {
  excel: `Tu vas reformater un fichier Excel pour qu'il soit compatible avec l'application de flashcards FlashEFC.

STRUCTURE REQUISE :
- Colonne A : question / recto de la carte
- Colonne B : réponse / verso de la carte
- Une carte par ligne, pas d'en-tête obligatoire

SAUTS DE LIGNE DANS UNE CELLULE :
Dans Excel, les sauts de ligne à l'intérieur d'une cellule se font avec Alt+Entrée. Dans le fichier .xlsx généré, ils apparaissent comme des retours à la ligne normaux dans la cellule.

BULLET POINTS :
Commence chaque point par • ou - suivi d'un espace. Chaque point sur sa propre ligne (Alt+Entrée entre chaque).
Exemple dans la cellule B2 :
• Premier critère
• Deuxième critère
• Troisième critère

CARROUSEL PAR ÉTAPES :
Pour diviser une réponse en plusieurs étapes affichées l'une après l'autre, sépare chaque étape par --- seul sur une ligne.
Exemple dans la cellule B2 :
**Étape 1 — Identifier l'enjeu :**
Texte de l'étape 1
---
**Étape 2 — Évaluer les critères :**
• Critère A
• Critère B
---
**Étape 3 — Conclure :**
Texte de conclusion

MISE EN FORME :
- Gras : **texte**
- Les titres d'étapes en gras sont recommandés

Reformate maintenant le fichier Excel fourni en respectant ces règles. Conserve le contenu original, adapte uniquement la structure et la mise en forme.`,

  csv: `Tu vas reformater un fichier en CSV pour qu'il soit compatible avec l'application de flashcards FlashEFC.

STRUCTURE REQUISE :
- Deux colonnes séparées par une virgule ou un point-virgule
- Colonne 1 : question / recto de la carte
- Colonne 2 : réponse / verso de la carte
- Une carte par ligne, pas d'en-tête obligatoire
- Les cellules contenant des sauts de ligne ou des virgules doivent être entourées de guillemets doubles

BULLET POINTS :
Commence chaque point par • ou - suivi d'un espace, séparés par des sauts de ligne à l'intérieur de la cellule (la cellule doit être entre guillemets doubles).
Exemple :
"Qu'est-ce que le goodwill ?","• Excédent du coût d'acquisition sur la JV des actifs nets
• Comptabilisé uniquement lors d'un regroupement
• Soumis à un test de dépréciation annuel"

CARROUSEL PAR ÉTAPES :
Pour diviser une réponse en plusieurs étapes, sépare chaque étape par --- seul sur une ligne à l'intérieur de la cellule (entre guillemets doubles).
Exemple :
"Étapes de comptabilisation","**Étape 1 — Identifier l'enjeu :**
Texte de l'étape 1
---
**Étape 2 — Évaluer les critères :**
• Critère A
• Critère B
---
**Étape 3 — Conclure :**
Texte de conclusion"

MISE EN FORME :
- Gras : **texte**
- Les titres d'étapes en gras sont recommandés
- Encodage : UTF-8

Génère maintenant le fichier CSV en respectant ces règles. Conserve le contenu original, adapte uniquement la structure et la mise en forme.`,

  word: `Tu vas reformater un document Word pour qu'il soit compatible avec l'application de flashcards FlashEFC.

STRUCTURE REQUISE :
- Chaque carte commence par un titre en style "Titre 2" (Heading 2) → ce sera le recto (question)
- Le texte en style "Normal" qui suit → ce sera le verso (réponse)
- La prochaine ligne "Titre 2" démarre une nouvelle carte automatiquement

BULLET POINTS :
Utilise les listes à puces normales de Word. Chaque point sera converti automatiquement.
Tu peux aussi écrire • ou - en début de ligne dans un paragraphe Normal.

CARROUSEL PAR ÉTAPES :
Pour diviser le verso en plusieurs étapes affichées l'une après l'autre, ajoute un paragraphe Normal contenant uniquement --- entre chaque étape.

MISE EN FORME :
- Gras : **texte** ou gras natif de Word
- Ne pas utiliser Titre 1 (réservé au titre du document)
- Encodage : UTF-8

Reformate maintenant le document Word en respectant ces règles. Conserve le contenu original, adapte uniquement la structure et la mise en forme.`,

  pptx: `Tu vas reformater une présentation PowerPoint pour qu'elle soit compatible avec l'application de flashcards FlashEFC.

STRUCTURE REQUISE :
- Une carte par slide
- Titre de la slide → recto de la carte (question)
- Contenu / corps de la slide → verso de la carte (réponse)
- Les slides sans titre ou sans contenu seront ignorées

BULLET POINTS :
Utilise les listes à puces normales de PowerPoint. Chaque point sera automatiquement converti en liste dans l'application.

CARROUSEL PAR ÉTAPES :
Pour diviser le verso en plusieurs étapes, place le texte --- seul sur une ligne dans la zone de contenu de la slide.

MISE EN FORME :
- Gras : **texte** ou utilise le gras natif de PowerPoint
- Une seule zone de titre et une seule zone de contenu par slide

Reformate maintenant la présentation PowerPoint en respectant ces règles. Conserve le contenu original, adapte uniquement la structure et la mise en forme.`,
}

function CopyPromptBox() {
  const [mode, setMode] = useState('excel')
  const [copied, setCopied] = useState(false)

  function handleCopy() {
    navigator.clipboard.writeText(AI_PROMPTS[mode]).then(() => {
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    })
  }

  const tabClass = (m) =>
    `px-2 py-0.5 text-xs transition-colors ${mode === m ? 'bg-foret text-ivoire' : 'bg-ivoire-2 text-ink-2 hover:bg-rule/40'}`

  return (
    <div className="border border-rule rounded-xl overflow-hidden">
      <div className="flex items-center justify-between bg-ivoire-2 px-3 py-2 gap-2 border-b border-rule">
        <div className="flex items-center gap-2 min-w-0">
          <span className="text-xs font-bold text-ink-3 uppercase tracking-[1.5px] shrink-0">Prompt IA</span>
          <div className="flex rounded-lg overflow-hidden border border-rule text-xs shrink-0">
            {['excel', 'csv', 'pptx', 'word'].map(m => (
              <button key={m} type="button" onClick={() => { setMode(m); setCopied(false) }} className={tabClass(m)}>
                {m === 'pptx' ? 'PowerPoint' : m.charAt(0).toUpperCase() + m.slice(1)}
              </button>
            ))}
          </div>
        </div>
        <button
          type="button"
          onClick={handleCopy}
          className="text-xs px-2.5 py-1 rounded-lg bg-foret text-ivoire hover:brightness-90 transition-all shrink-0"
        >
          {copied ? '✓ Copié !' : 'Copier'}
        </button>
      </div>
      <textarea
        readOnly
        value={AI_PROMPTS[mode]}
        rows={5}
        className="w-full text-xs text-ink-3 px-3 py-2 resize-none bg-ivoire-2 focus:outline-none font-mono leading-relaxed"
      />
    </div>
  )
}

function CardPreview({ card, index }) {
  return (
    <div className="bg-ivoire border border-rule rounded-2xl p-4" style={{ boxShadow: '0 12px 28px -16px rgba(28,24,20,0.18)' }}>
      <p className="text-xs font-bold uppercase tracking-[2px] text-ink-3 mb-2">Carte {index + 1}</p>
      <p className="font-bold text-ink text-sm leading-snug mb-2">{card.front}</p>
      <div className="border-t border-rule pt-2">
        <p className="text-xs text-ink-2 line-clamp-3">{card.back}</p>
      </div>
    </div>
  )
}

function ImportModal({ onClose, onImported }) {
  const { user } = useAuth()
  const fileRef = useRef()
  const [deckName, setDeckName] = useState('')
  const [preview, setPreview] = useState(null)
  const [error, setError] = useState('')
  const [importing, setImporting] = useState(false)

  function handleFile(e) {
    const file = e.target.files[0]
    if (!file) return
    setError('')
    setDeckName(file.name.replace(/\.(csv|xlsx|xls|pptx|docx)$/i, ''))

    const isPPTX = /\.pptx$/i.test(file.name)
    const isExcel = /\.(xlsx|xls)$/i.test(file.name)
    const isWord = /\.docx$/i.test(file.name)
    const reader = new FileReader()

    reader.onload = async (evt) => {
      try {
        let cards
        if (isPPTX) cards = await parsePPTX(evt.target.result)
        else if (isWord) cards = await parseWord(evt.target.result)
        else if (isExcel) cards = parseExcel(evt.target.result)
        else cards = parseCSV(evt.target.result)

        if (cards.length === 0) {
          setError('Aucune carte trouvée. Vérifiez le format du fichier.')
          setPreview(null)
        } else {
          setPreview(cards)
        }
      } catch {
        setError('Erreur lors de la lecture du fichier.')
        setPreview(null)
      }
    }
    if (isPPTX || isExcel || isWord) reader.readAsArrayBuffer(file)
    else reader.readAsText(file, 'UTF-8')
  }

  async function handleImport() {
    if (!deckName.trim() || !preview?.length) return
    setImporting(true)

    const { data: deck, error: deckErr } = await supabase
      .from('decks')
      .insert({ name: deckName.trim(), user_id: user.id })
      .select()
      .single()

    if (deckErr) { setError('Erreur lors de la création du deck.'); setImporting(false); return }

    const cardRows = preview.map(c => ({ deck_id: deck.id, front: c.front, back: c.back }))
    const { error: cardsErr } = await supabase.from('cards').insert(cardRows)

    if (cardsErr) { setError('Erreur lors de l\'import des cartes.'); setImporting(false); return }

    onImported()
    onClose()
  }

  return (
    <div className="fixed inset-0 bg-ink/40 flex items-center justify-center z-50 px-4">
      <div className="bg-ivoire-2 rounded-2xl w-full max-w-lg border border-rule" style={{ boxShadow: '0 12px 28px -16px rgba(28,24,20,0.18)' }}>
        <div className="flex items-center justify-between p-5 border-b border-rule">
          <h2 className="font-display font-semibold text-foret" style={{ fontSize: '22px' }}>Importer un fichier</h2>
          <button onClick={onClose} className="text-ink-3 hover:text-ink text-xl leading-none transition-colors">×</button>
        </div>

        <div className="p-5 space-y-4">
          <div className="bg-ivoire border border-rule rounded-xl px-4 py-3 text-xs text-ink-3 space-y-1">
            <p className="font-bold text-ink-2 uppercase tracking-[1.5px] text-[11px]">Format attendu</p>
            <p>Excel (.xlsx) et CSV (.csv) : colonne A = question, colonne B = réponse.</p>
            <p>PowerPoint (.pptx) : titre de la slide = question, contenu = réponse.</p>
            <p>Word (.docx) : Titre 2 = question, paragraphes suivants = réponse.</p>
          </div>

          <CopyPromptBox />

          <div>
            <label className="block text-xs font-bold uppercase tracking-[1.5px] text-ink-3 mb-2">
              Fichier Excel, CSV, PowerPoint ou Word
            </label>
            <input
              ref={fileRef}
              type="file"
              accept=".csv,.xlsx,.xls,.pptx,.docx,text/csv"
              onChange={handleFile}
              className="w-full text-sm text-ink-2 file:mr-3 file:py-1.5 file:px-3 file:rounded-lg file:border file:border-rule file:bg-ivoire file:text-ink-2 file:text-xs file:font-bold hover:file:bg-rule/30 cursor-pointer"
            />
          </div>

          {error && (
            <p className="text-sm text-ivoire bg-seal rounded-xl px-4 py-2">{error}</p>
          )}

          {preview && (
            <div>
              <label className="block text-xs font-bold uppercase tracking-[1.5px] text-ink-3 mb-2">
                Nom du deck
              </label>
              <input
                value={deckName}
                onChange={e => setDeckName(e.target.value)}
                className="w-full border-b border-rule bg-transparent text-ink text-sm py-1.5 focus:outline-none focus:border-foret transition-colors"
              />
            </div>
          )}

          {preview && (
            <div>
              <p className="text-xs font-bold uppercase tracking-[1.5px] text-ink-3 mb-3">
                Aperçu — {preview.length} carte{preview.length !== 1 ? 's' : ''} détectée{preview.length !== 1 ? 's' : ''}
              </p>
              <div className="grid gap-3 sm:grid-cols-3">
                {preview.slice(0, 3).map((c, i) => (
                  <CardPreview key={i} card={c} index={i} />
                ))}
              </div>
              {preview.length > 3 && (
                <p className="text-xs text-ink-3 text-center mt-3">
                  + {preview.length - 3} autre{preview.length - 3 > 1 ? 's' : ''} carte{preview.length - 3 > 1 ? 's' : ''}
                </p>
              )}
            </div>
          )}
        </div>

        <div className="flex justify-end gap-3 p-5 border-t border-rule">
          <button onClick={onClose} className="text-sm px-4 py-2 text-ink-3 hover:text-ink transition-colors">
            Annuler
          </button>
          <button
            onClick={handleImport}
            disabled={importing || !preview?.length || !deckName.trim()}
            className="bg-foret text-ivoire text-sm px-5 py-2 rounded-[18px] hover:brightness-90 disabled:opacity-40 transition-all font-bold"
          >
            {importing ? 'Import en cours…' : `Importer ${preview?.length ?? ''} cartes`}
          </button>
        </div>
      </div>
    </div>
  )
}

function WeeklyChart() {
  const days = []
  const studied = new Set(JSON.parse(localStorage.getItem('flashefc_study_dates') || '[]'))
  const dayLabels = ['D', 'L', 'M', 'M', 'J', 'V', 'S']
  for (let i = 6; i >= 0; i--) {
    const d = new Date()
    d.setDate(d.getDate() - i)
    const dateStr = d.toISOString().split('T')[0]
    days.push({ date: dateStr, studied: studied.has(dateStr), label: dayLabels[d.getDay()] })
  }
  const streak = days.filter(d => d.studied).length

  return (
    <div className="flex items-center gap-3">
      <div className="flex gap-1.5 items-end">
        {days.map((d, i) => (
          <div key={i} className="flex flex-col items-center gap-1">
            <div
              className={`w-5 h-5 rounded ${d.studied ? 'bg-foret' : 'bg-rule'}`}
              title={d.date}
            />
            <span className="text-[10px] text-ink-3">{d.label}</span>
          </div>
        ))}
      </div>
      {streak > 0 && (
        <span className="text-xs text-ink-3">{streak}/7 jours cette semaine</span>
      )}
    </div>
  )
}

export default function Home() {
  const { user } = useAuth()
  const navigate = useNavigate()
  const [decks, setDecks] = useState([])
  const [loading, setLoading] = useState(true)
  const stats = useMemo(() => ({
    total: decks.reduce((a, d) => a + d.cardCount, 0),
    due: decks.reduce((a, d) => a + d.due, 0),
    mastered: decks.reduce((a, d) => a + d.mastered, 0),
  }), [decks])
  const [newDeckName, setNewDeckName] = useState('')
  const [creating, setCreating] = useState(false)
  const [showForm, setShowForm] = useState(false)
  const [showImport, setShowImport] = useState(false)

  useEffect(() => { fetchDecks() }, [])

  async function fetchDecks() {
    setLoading(true)
    const { data } = await supabase
      .from('decks')
      .select('*, cards(id, next_review_date, repetitions)')
      .eq('user_id', user.id)
      .order('created_at', { ascending: false })

    if (data) {
      const today = new Date().toISOString().split('T')[0]
      const processed = data.map(deck => {
        const cards = deck.cards || []
        const due = cards.filter(c => !c.next_review_date || c.next_review_date <= today).length
        const mastered = cards.filter(c => c.repetitions >= 3).length
        return { ...deck, cardCount: cards.length, due, mastered }
      })
      setDecks(processed)
    }
    setLoading(false)
  }

  async function createDeck(e) {
    e.preventDefault()
    if (!newDeckName.trim()) return
    setCreating(true)
    await supabase.from('decks').insert({ name: newDeckName.trim(), user_id: user.id })
    setNewDeckName('')
    setShowForm(false)
    setCreating(false)
    fetchDecks()
  }

  function startSession() {
    const deckWithDue = decks.find(d => d.due > 0) || decks[0]
    if (deckWithDue) navigate(`/study/${deckWithDue.id}`)
  }

  function buildNarrativeSummary() {
    const deckCount = decks.filter(d => d.due > 0).length
    const lastStudied = localStorage.getItem('flashefc_last_studied')
    let datePhrase = ''
    if (lastStudied) {
      const diff = Math.floor((Date.now() - new Date(lastStudied)) / 86400000)
      if (diff === 0) datePhrase = "Dernière session aujourd'hui."
      else if (diff === 1) datePhrase = 'Dernière session hier.'
      else datePhrase = `Dernière session il y a ${diff} jours.`
    }
    if (stats.due === 0) return `Tout est à jour. ${stats.total} carte${stats.total !== 1 ? 's' : ''} dans votre collection. ${datePhrase}`
    return `Aujourd'hui, ${stats.due} carte${stats.due !== 1 ? 's' : ''} à réviser${deckCount > 1 ? ` dans ${deckCount} decks` : ''}. ${datePhrase}`
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center flex-1">
        <div className="w-6 h-6 border-2 border-rule border-t-foret rounded-full animate-spin" />
      </div>
    )
  }

  return (
    <div className="max-w-4xl mx-auto px-4 w-full" style={{ paddingTop: '80px', paddingBottom: '80px' }}>
      {showImport && (
        <ImportModal onClose={() => setShowImport(false)} onImported={fetchDecks} />
      )}

      {/* Hero header */}
      <div className="mb-10">
        <h1 className="font-display font-semibold text-foret mb-4" style={{ fontSize: '52px', lineHeight: '1.05', letterSpacing: '-0.5px' }}>
          Votre maison d'étude.
        </h1>
        {decks.length > 0 && (
          <p className="font-display text-ink-2 mb-6" style={{ fontSize: '20px', fontStyle: 'italic', lineHeight: '1.5' }}>
            {buildNarrativeSummary()}
          </p>
        )}
        <WeeklyChart />
      </div>

      {/* Actions */}
      <div className="flex items-center gap-3 mb-8 flex-wrap">
        {stats.due > 0 && (
          <button
            onClick={startSession}
            className="bg-foret text-ivoire text-sm px-5 py-3 rounded-[18px] hover:brightness-90 transition-all font-bold"
          >
            Démarrer une session
          </button>
        )}
        <button
          onClick={() => setShowImport(true)}
          className="border border-foret text-foret text-sm px-4 py-2.5 rounded-[18px] hover:bg-foret/5 transition-colors font-bold"
        >
          Importer
        </button>
        <button
          onClick={() => setShowForm(!showForm)}
          className="border border-foret text-foret text-sm px-4 py-2.5 rounded-[18px] hover:bg-foret/5 transition-colors font-bold"
        >
          + Nouveau deck
        </button>
      </div>

      {/* New deck form */}
      {showForm && (
        <form onSubmit={createDeck} className="bg-ivoire-2 border border-rule rounded-2xl p-5 mb-6 flex gap-3">
          <input
            autoFocus
            type="text"
            value={newDeckName}
            onChange={e => setNewDeckName(e.target.value)}
            placeholder="Nom du deck…"
            className="flex-1 border-b border-rule bg-transparent text-ink text-sm py-1.5 focus:outline-none focus:border-foret transition-colors placeholder:text-ink-3"
          />
          <button
            type="submit"
            disabled={creating || !newDeckName.trim()}
            className="bg-foret text-ivoire text-sm px-4 py-2 rounded-[18px] hover:brightness-90 disabled:opacity-40 transition-all font-bold"
          >
            Créer
          </button>
          <button
            type="button"
            onClick={() => setShowForm(false)}
            className="text-sm px-3 py-2 text-ink-3 hover:text-ink transition-colors"
          >
            Annuler
          </button>
        </form>
      )}

      {/* Deck list */}
      {decks.length === 0 ? (
        <div className="text-center py-20 text-ink-3">
          <p className="font-display text-2xl mb-3" style={{ fontStyle: 'italic' }}>Collection vide.</p>
          <p className="text-sm">Créez votre premier deck ou importez un fichier Excel, CSV, PowerPoint ou Word.</p>
        </div>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2">
          {decks.map(deck => (
            <div
              key={deck.id}
              className="bg-ivoire-2 border border-rule rounded-2xl p-6 hover:border-laiton transition-colors"
              style={{ boxShadow: '0 12px 28px -16px rgba(28,24,20,0.18)' }}
            >
              <div className="flex items-start justify-between mb-1">
                <Link to={`/decks/${deck.id}`}>
                  <h3 className="font-display font-semibold text-foret hover:text-laiton transition-colors" style={{ fontSize: '22px', lineHeight: '1.1' }}>
                    {deck.name}
                  </h3>
                </Link>
                {deck.due > 0 && (
                  <span className="text-[11px] font-bold uppercase tracking-[1.5px] text-seal border border-seal/40 px-2 py-0.5 rounded-full ml-3 shrink-0">
                    {deck.due} à réviser
                  </span>
                )}
              </div>
              <p className="text-xs font-bold uppercase tracking-[2px] text-ink-3 mb-4">
                {deck.cardCount} carte{deck.cardCount !== 1 ? 's' : ''} · {deck.mastered} maîtrisée{deck.mastered !== 1 ? 's' : ''}
              </p>

              {deck.cardCount > 0 && (
                <div className="bg-rule rounded-full h-px mb-4">
                  <div
                    className="bg-foret h-px rounded-full transition-all"
                    style={{ width: `${Math.round((deck.mastered / deck.cardCount) * 100)}%` }}
                  />
                </div>
              )}

              <Link
                to={`/study/${deck.id}`}
                className="inline-block bg-foret text-ivoire text-xs font-bold uppercase tracking-[1px] px-4 py-2 rounded-[18px] hover:brightness-90 transition-all"
              >
                Étudier
              </Link>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
