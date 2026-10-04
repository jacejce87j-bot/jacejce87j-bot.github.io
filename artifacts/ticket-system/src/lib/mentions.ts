import type { Contact } from "@workspace/api-client-react";

export function getCurrentMentionToken(value: string) {
  const match = /(?:^|\s)@([^\s]+)$/;
  const result = value.match(match);
  return result ? result[1].trim().toLowerCase() : "";
}

export function getMentionCandidates(value: string, contacts: Contact[]) {
  const token = getCurrentMentionToken(value);
  if (!token) return [];
  const lowerToken = token.toLowerCase();
  return contacts.filter((contact) => {
    const haystack = `${contact.name ?? ""} ${contact.email ?? ""}`.toLowerCase();
    return haystack.includes(lowerToken);
  }).slice(0, 6);
}

export function replaceLastMention(value: string, contact: Contact) {
  const target = contact.email || contact.name || "someone";
  const pattern = /(^|\s)@([^\s]+)$/;
  if (pattern.test(value)) {
    return value.replace(pattern, `$1@${target}`);
  }
  return `${value.trimEnd()} @${target} `;
}
