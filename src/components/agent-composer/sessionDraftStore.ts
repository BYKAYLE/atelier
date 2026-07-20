export type ChatAttachment = {
  id: string;
  kind: "image";
  name: string;
  path: string;
  size?: number;
  mime?: string;
};

export interface SessionComposerDraft {
  text: string;
  attachments: ChatAttachment[];
}

export interface SessionDraftCarrier {
  id: string;
  draft?: SessionComposerDraft;
}

function cloneAttachment(attachment: ChatAttachment): ChatAttachment {
  return { ...attachment };
}

function normalizeAttachment(value: unknown): ChatAttachment | null {
  if (!value || typeof value !== "object") return null;
  const attachment = value as Record<string, unknown>;
  if (
    typeof attachment.id !== "string"
    || attachment.kind !== "image"
    || typeof attachment.name !== "string"
    || typeof attachment.path !== "string"
  ) {
    return null;
  }
  return {
    id: attachment.id,
    kind: "image",
    name: attachment.name,
    path: attachment.path,
    size: typeof attachment.size === "number" ? attachment.size : undefined,
    mime: typeof attachment.mime === "string" ? attachment.mime : undefined,
  };
}

function sameAttachment(left: ChatAttachment, right: ChatAttachment): boolean {
  return left.id === right.id
    && left.kind === right.kind
    && left.name === right.name
    && left.path === right.path
    && left.size === right.size
    && left.mime === right.mime;
}

export function createSessionComposerDraft(
  text: string,
  attachments: ChatAttachment[],
  maxAttachments: number,
): SessionComposerDraft | undefined {
  const nextText = typeof text === "string" ? text : "";
  const nextAttachments = Array.isArray(attachments)
    ? attachments.slice(-maxAttachments).map(cloneAttachment)
    : [];
  return nextText.length > 0 || nextAttachments.length > 0
    ? { text: nextText, attachments: nextAttachments }
    : undefined;
}

export function normalizeSessionComposerDraft(
  value: unknown,
  maxAttachments: number,
): SessionComposerDraft | undefined {
  if (!value || typeof value !== "object") return undefined;
  const draft = value as Record<string, unknown>;
  const text = typeof draft.text === "string" ? draft.text : "";
  const attachments = Array.isArray(draft.attachments)
    ? draft.attachments
        .map(normalizeAttachment)
        .filter((attachment): attachment is ChatAttachment => Boolean(attachment))
        .slice(-maxAttachments)
    : [];
  return text.length > 0 || attachments.length > 0 ? { text, attachments } : undefined;
}

export function sameSessionComposerDraft(
  left: SessionComposerDraft | undefined,
  right: SessionComposerDraft | undefined,
): boolean {
  if (!left || !right) return left === right;
  if (left.text !== right.text || left.attachments.length !== right.attachments.length) return false;
  return left.attachments.every((attachment, index) => sameAttachment(attachment, right.attachments[index]));
}

export function readSessionComposerDraft<T extends SessionDraftCarrier>(
  sessions: T[],
  sessionId: string | null | undefined,
): SessionComposerDraft | undefined {
  if (!sessionId) return undefined;
  return sessions.find((session) => session.id === sessionId)?.draft;
}

export function upsertSessionComposerDraft<T extends SessionDraftCarrier>(
  sessions: T[],
  sessionId: string | null | undefined,
  draft: SessionComposerDraft | undefined,
): { sessions: T[]; changed: boolean } {
  if (!sessionId) return { sessions, changed: false };
  let changed = false;
  const nextSessions = sessions.map((session) => {
    if (session.id !== sessionId) return session;
    if (sameSessionComposerDraft(session.draft, draft)) return session;
    changed = true;
    if (!draft) {
      const { draft: _draft, ...rest } = session;
      return rest as T;
    }
    return { ...session, draft };
  });
  return changed ? { sessions: nextSessions, changed } : { sessions, changed };
}

export function clearSessionComposerDraft<T extends SessionDraftCarrier>(
  sessions: T[],
  sessionId: string | null | undefined,
): { sessions: T[]; changed: boolean } {
  return upsertSessionComposerDraft(sessions, sessionId, undefined);
}
