// SM-2 spaced repetition algorithm
// quality: 0-2 = fail, 3 = hard, 4 = good, 5 = easy
export function sm2(card, quality) {
  let { repetitions = 0, ease_factor = 2.5, interval = 1 } = card

  if (quality < 3) {
    repetitions = 0
    interval = 1
  } else {
    if (repetitions === 0) interval = 1
    else if (repetitions === 1) interval = 6
    else interval = Math.round(interval * ease_factor)

    ease_factor = ease_factor + (0.1 - (5 - quality) * (0.08 + (5 - quality) * 0.02))
    ease_factor = Math.max(1.3, ease_factor)
    repetitions += 1
  }

  const next_review_date = new Date()
  next_review_date.setDate(next_review_date.getDate() + interval)

  return {
    repetitions,
    ease_factor: parseFloat(ease_factor.toFixed(4)),
    interval,
    next_review_date: next_review_date.toISOString().split('T')[0],
    last_review_date: new Date().toISOString().split('T')[0],
  }
}

export function isDue(card) {
  if (!card.next_review_date) return true
  return new Date(card.next_review_date) <= new Date()
}
