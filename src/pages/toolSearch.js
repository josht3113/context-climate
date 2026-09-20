// ── toolSearch ───────────────────────────────────────────────────────────────
// Shared matcher behind the SectionNav filter input.
//
// Home.jsx and EarthAndSpace.jsx keep their own SECTIONS arrays and do their
// own filtering — SectionNav stays shape-blind and only owns the input. This
// module is the one piece both pages share, because their card objects expose
// the same searchable fields (title, description, tags, footerTags). It also
// tolerates EarthAndSpace's `subgroups` nesting, which Home doesn't use.
//
//   const terms   = parseQuery(query)
//   const visible = filterSections(SECTIONS, terms)
//   const count   = countCards(visible)
//
// `filterSections` returns the ORIGINAL array reference when there are no
// terms, so the no-query path allocates nothing and downstream useMemo keys
// stay stable.

// Fold case, diacritics and typographic apostrophes so a keyboard-realistic
// query finds the card: "el nino" → "El Niño", "sporer" → "Spörer's Law".
// Apostrophes are dropped entirely, not just folded, so "earths layers"
// and "earth's layers" both reach "Earth's Layers".
function normalize(str) {
  return String(str)
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/['\u2018\u2019]/g, '')
    .toLowerCase()
}

// Card objects are module-level constants on both pages, so they're stable
// identities and safe to cache against. Keeps a 100-card filter down to one
// string build per card for the life of the page.
const haystackCache = new WeakMap()

function cardHaystack(card) {
  let cached = haystackCache.get(card)
  if (cached === undefined) {
    cached = normalize(
      [card.title, card.description, ...(card.tags || []), ...(card.footerTags || [])]
        .filter(Boolean)
        .join(' ')
    )
    haystackCache.set(card, cached)
  }
  return cached
}

// Whitespace-split, then AND every term — "kepler area" should land on one
// card, not on everything Kepler plus everything with an area.
export function parseQuery(query) {
  return normalize(query || '').split(/\s+/).filter(Boolean)
}

function matches(card, terms) {
  const haystack = cardHaystack(card)
  return terms.every((t) => haystack.includes(t))
}

// Filters a page's SECTIONS, dropping cards that don't match, then subgroups
// and sections left with nothing. Sections are spread rather than rebuilt, so
// whatever identifies them on that page (`key` on Earth & Space, `id` on Home)
// and their accent/label survive untouched.
export function filterSections(sections, terms) {
  if (!terms.length) return sections
  return sections
    .map((section) => {
      if (section.subgroups) {
        const subgroups = section.subgroups
          .map((sub) => ({ ...sub, cards: sub.cards.filter((c) => matches(c, terms)) }))
          .filter((sub) => sub.cards.length > 0)
        return subgroups.length ? { ...section, subgroups } : null
      }
      const cards = (section.cards || []).filter((c) => matches(c, terms))
      return cards.length ? { ...section, cards } : null
    })
    .filter(Boolean)
}

export function countCards(sections) {
  return sections.reduce((total, section) => {
    if (section.subgroups) {
      return total + section.subgroups.reduce((n, sub) => n + sub.cards.length, 0)
    }
    return total + (section.cards?.length || 0)
  }, 0)
}