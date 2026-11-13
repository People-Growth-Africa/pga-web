/**
 * A speaker on a post, as both the public page and the admin editor see them.
 *
 * The shape is deliberately small: everything a page draws, and nothing about
 * the row it came from. Names, roles and bios are rendered as React text on the
 * public page - never as HTML - so this module has no business carrying markup.
 */

export type SpeakerView = {
  name: string;
  role: string | null;
  organisation: string | null;
  bio: string | null;
  /** The 400px square, for the carousel and the modal card. */
  photoUrl: string | null;
  /** The 96px square, for the circular row. */
  photoThumbUrl: string | null;
  linkedinUrl: string | null;
};

/**
 * A speaker row as the admin API returns it.
 *
 * Snake_case because it is the row: the editor renames these once, when it
 * builds its own draft, rather than casting the payload all over the panel.
 */
export type SpeakerRecord = {
  id: string;
  position: number;
  name: string;
  role: string | null;
  organisation: string | null;
  bio: string | null;
  photo_url: string | null;
  photo_thumb_url: string | null;
  linkedin_url: string | null;
};

/** One speaker as the editor holds it, before a save. */
export type SpeakerDraftInput = {
  id?: string | null;
  name: string;
  role: string | null;
  organisation: string | null;
  bio: string | null;
  photoUrl: string | null;
  photoThumbUrl: string | null;
  linkedinUrl: string | null;
};

/** A saved row as a draft the form can edit. */
export function speakerToDraft(record: SpeakerRecord): SpeakerDraftInput {
  return {
    id: record.id,
    name: record.name,
    role: record.role,
    organisation: record.organisation,
    bio: record.bio,
    photoUrl: record.photo_url,
    photoThumbUrl: record.photo_thumb_url,
    linkedinUrl: record.linkedin_url,
  };
}

/** A draft as the public renderer sees it, for the visitor-preview carousel. */
export function speakerDraftToView(draft: SpeakerDraftInput): SpeakerView {
  return {
    name: draft.name.trim(),
    role: draft.role,
    organisation: draft.organisation,
    bio: draft.bio,
    photoUrl: draft.photoUrl,
    photoThumbUrl: draft.photoThumbUrl,
    linkedinUrl: draft.linkedinUrl,
  };
}

/** The letter shown when a speaker has no photo. */
export function speakerInitial(name: string): string {
  const trimmed = name.trim();
  return trimmed.length > 0 ? trimmed.charAt(0).toUpperCase() : '?';
}

/**
 * The smallest photo available, falling back to the large one.
 *
 * A thumbnail first is the whole point of storing two sizes: a row of twelve
 * avatars should not pull twelve 400px squares.
 */
export function speakerThumb(speaker: SpeakerView): string | null {
  return speaker.photoThumbUrl ?? speaker.photoUrl;
}

export function speakerPhoto(speaker: SpeakerView): string | null {
  return speaker.photoUrl ?? speaker.photoThumbUrl;
}

/** "Role, Organisation", or whichever of the two is set. */
export function speakerLine(speaker: SpeakerView): string {
  const parts = [speaker.role, speaker.organisation]
    .map((part) => part?.trim() ?? '')
    .filter(Boolean);
  return parts.join(', ');
}

/**
 * Only an https LinkedIn URL is ever written into an href.
 *
 * The server validates this on save and the editor checks it before saving, so
 * this is the third check and the one that protects the rendered page: a value
 * that somehow reached the database another way still cannot become a link.
 */
export function speakerLinkedIn(speaker: SpeakerView): string | null {
  const value = speaker.linkedinUrl?.trim() ?? '';
  if (!value) return null;
  try {
    const url = new URL(value);
    const linkedIn = /^(?:[a-z0-9-]+\.)?linkedin\.com$/i.test(url.hostname);
    return url.protocol === 'https:' && !url.username && !url.password && linkedIn ? value : null;
  } catch {
    return null;
  }
}

/** True when a post has something to show: at least one named speaker. */
export function hasSpeakers(speakers: readonly SpeakerView[] | null | undefined): boolean {
  return Array.isArray(speakers) && speakers.some((speaker) => speaker.name.trim() !== '');
}

/**
 * A malformed payload entry becomes an empty-but-shaped speaker.
 *
 * The public feed is a network response, so a field can be missing or the wrong
 * type. Coercing once here keeps every consumer from re-checking, and a speaker
 * with no name is dropped by the renderer rather than drawn as a blank avatar.
 */
export function coerceSpeakers(value: unknown): SpeakerView[] {
  if (!Array.isArray(value)) return [];
  return value.flatMap((entry) => {
    if (typeof entry !== 'object' || entry === null) return [];
    const record = entry as Record<string, unknown>;
    const name = typeof record.name === 'string' ? record.name.trim() : '';
    if (!name) return [];
    const text = (key: string) => (typeof record[key] === 'string' ? (record[key] as string) : null);
    return [
      {
        name,
        role: text('role'),
        organisation: text('organisation'),
        bio: text('bio'),
        photoUrl: text('photoUrl'),
        photoThumbUrl: text('photoThumbUrl'),
        linkedinUrl: text('linkedinUrl'),
      },
    ];
  });
}
