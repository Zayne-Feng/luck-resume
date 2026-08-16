import { cloneEntry, type ResumeDocument } from './model.ts';

export interface EntryTransferRequest {
  sourceDocumentId: string;
  sourceSectionId: string;
  entryId: string;
  destinationDocumentId: string;
  destinationSectionId: string;
  mode: 'copy' | 'move';
}

export function planEntryTransfer(
  documents: Record<string, ResumeDocument>,
  request: EntryTransferRequest,
): { documents: Record<string, ResumeDocument>; entryId: string } {
  if (request.mode !== 'copy' && request.mode !== 'move') throw new Error('请选择复制或移动。');
  const source = documents[request.sourceDocumentId];
  const destination = documents[request.destinationDocumentId];
  const sourceSection = source?.sections.find((section) => section.id === request.sourceSectionId);
  const destinationSection = destination?.sections.find(
    (section) => section.id === request.destinationSectionId,
  );
  const entry = sourceSection?.items.find((item) => item.id === request.entryId);
  if (!source || !destination || !sourceSection || !destinationSection || !entry)
    throw new Error('条目或目标已变化，请重新选择。');
  if (
    request.mode === 'move' &&
    source.id === destination.id &&
    sourceSection.id === destinationSection.id
  )
    throw new Error('请选择不同的目标模块。');
  if (destinationSection.items.length >= 500) throw new Error('目标模块已达到 500 个条目上限。');
  const changed: Record<string, ResumeDocument> = {
    [destination.id]: structuredClone(destination),
  };
  if (request.mode === 'move' && !changed[source.id]) changed[source.id] = structuredClone(source);
  const copy = cloneEntry(entry);
  changed[destination.id].sections
    .find((section) => section.id === destinationSection.id)!
    .items.push(copy);
  if (request.mode === 'move') {
    const section = changed[source.id].sections.find((section) => section.id === sourceSection.id)!;
    section.items = section.items.filter((item) => item.id !== entry.id);
  }
  const now = new Date().toISOString();
  for (const document of Object.values(changed)) document.updatedAt = now;
  return { documents: changed, entryId: copy.id };
}
