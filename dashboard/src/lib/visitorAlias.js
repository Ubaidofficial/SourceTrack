// Friendly display name for an ANONYMOUS visitor — "Brave Otter" instead of a raw
// distinct_id, so a journey can be talked about ("the Brave Otter one") without reading out
// a 36-character opaque string.
//
// PRIVACY — read before changing (§6, cookieless / no de-anonymisation):
//   - This is a PSEUDONYM, strictly less identifying than the id it replaces. It is a pure
//     function of the visitor id and adds no information whatsoever: no lookup, no enrichment,
//     no person data, no network call, nothing stored. Two words out of a fixed list.
//   - It must NEVER be presented as the visitor's actual name. JourneyModal.jsx's avatar note
//     is explicit that inventing a person-level identity would breach the rule, and that
//     reasoning holds: the alias ships ALONGSIDE the raw short id, never replacing it, and is
//     labelled as a generated reference. A caller that hides the id and shows only the alias
//     turns a safe pseudonym into something that reads like a real person — don't.
//   - Never derive it from anything but the opaque id. Feeding an email, a user_id, or any
//     volunteered PII into this function would leak that value's identity into a label that
//     looks safe to display.
//
// DETERMINISM is the whole point: the same visitor must produce the same alias on every render,
// every session, and every machine, with no persistence. That rules out Math.random and any
// Date-seeded scheme. FNV-1a below is a fixed, well-defined integer hash — same input, same
// output, forever. If the word lists are ever reordered or resized, every existing visitor's
// alias changes; treat these two arrays as append-only.

// 64 × 64 = 4096 combinations. Neutral, non-evaluative words only — an alias is attached to a
// real person's browsing session and must not editorialise about them.
const ADJECTIVES = [
  'Amber', 'Ancient', 'Arctic', 'Autumn', 'Bold', 'Brave', 'Brisk', 'Bright',
  'Calm', 'Candid', 'Cedar', 'Clever', 'Coastal', 'Cobalt', 'Copper', 'Coral',
  'Crimson', 'Curious', 'Daring', 'Dawn', 'Deft', 'Distant', 'Dusty', 'Eager',
  'Early', 'Eastern', 'Ember', 'Emerald', 'Fleet', 'Forest', 'Frosted', 'Gentle',
  'Gilded', 'Glacial', 'Golden', 'Granite', 'Harbor', 'Hazel', 'Hidden', 'Humble',
  'Indigo', 'Ivory', 'Jade', 'Keen', 'Lively', 'Lunar', 'Maple', 'Marbled',
  'Midnight', 'Mellow', 'Nimble', 'Northern', 'Olive', 'Opal', 'Patient', 'Quiet',
  'Rapid', 'Rustic', 'Sable', 'Silent', 'Solar', 'Steady', 'Tidal', 'Velvet'
]

const ANIMALS = [
  'Albatross', 'Antelope', 'Badger', 'Beetle', 'Bison', 'Bittern', 'Cardinal', 'Caribou',
  'Cheetah', 'Chinchilla', 'Cormorant', 'Coyote', 'Crane', 'Cricket', 'Dolphin', 'Dormouse',
  'Egret', 'Falcon', 'Ferret', 'Finch', 'Gazelle', 'Gecko', 'Gibbon', 'Grouse',
  'Harrier', 'Hedgehog', 'Heron', 'Ibex', 'Ibis', 'Impala', 'Jackdaw', 'Jaguar',
  'Kestrel', 'Kingfisher', 'Lapwing', 'Lemur', 'Leopard', 'Lynx', 'Magpie', 'Marmot',
  'Marten', 'Meerkat', 'Mongoose', 'Narwhal', 'Nightjar', 'Ocelot', 'Osprey', 'Otter',
  'Panther', 'Pelican', 'Petrel', 'Pika', 'Plover', 'Puffin', 'Quokka', 'Raven',
  'Sandpiper', 'Serval', 'Shrike', 'Sparrow', 'Starling', 'Tapir', 'Vireo', 'Wombat'
]

// FNV-1a, 32-bit. Chosen over a hand-rolled sum because a weak hash clusters — sequential or
// prefix-sharing ids (which distinct_ids often are) would collapse onto the same few aliases.
// `>>> 0` after each step keeps it in unsigned 32-bit range under JS number semantics.
function fnv1a(str, seed) {
  let h = seed >>> 0
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i)
    // h * 16777619, via shifts, to stay inside 32-bit integer range.
    h = (h + ((h << 1) + (h << 4) + (h << 7) + (h << 8) + (h << 24))) >>> 0
  }
  return h >>> 0
}

/**
 * Deterministic "Adjective Animal" alias for an opaque visitor id.
 *
 * @param {string} visitorId - the opaque distinct_id. Never pass PII.
 * @returns {string|null} e.g. "Brave Otter", or null when there is no id to derive from.
 */
export function visitorAlias(visitorId) {
  const id = String(visitorId || '').trim()
  if (!id) return null
  // Two DIFFERENT seeds so the adjective and the animal are independent. Seeding both the same
  // way correlates the pair and collapses the effective space well below 4096.
  const adjective = ADJECTIVES[fnv1a(id, 0x811c9dc5) % ADJECTIVES.length]
  const animal = ANIMALS[fnv1a(id, 0x01000193) % ANIMALS.length]
  return `${adjective} ${animal}`
}

export const ALIAS_WORD_COUNTS = { adjectives: ADJECTIVES.length, animals: ANIMALS.length }
