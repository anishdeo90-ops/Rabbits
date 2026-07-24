function normalizeTagIds(value) {
  if (!Array.isArray(value)) return [];
  const seen = new Set();
  const ids = [];
  for (const item of value) {
    const id = typeof item === "string" ? item.trim() : "";
    if (!id || seen.has(id)) continue;
    seen.add(id);
    ids.push(id);
  }
  return ids;
}

function parseTagNames(value) {
  if (value == null) return [];
  const seen = new Set();
  const names = [];
  for (const part of String(value).split(/[,;|]+/)) {
    const name = part.trim().replace(/\s+/g, " ");
    const key = name.toLowerCase();
    if (!name || seen.has(key)) continue;
    seen.add(key);
    names.push(name);
  }
  return names;
}

function buildCandidateTagRows(candidateId, tagIds, assignedBy) {
  return normalizeTagIds(tagIds).map((tagId) => ({
    candidate_id: candidateId,
    tag_id: tagId,
    assigned_by: assignedBy,
  }));
}

module.exports = {
  normalizeTagIds,
  parseTagNames,
  buildCandidateTagRows,
};
