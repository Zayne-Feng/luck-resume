import type { Publication } from './model.ts';
import { authorSegments, publicationStatusName } from './publications.ts';

export default function PublicationDetails({
  publication,
  language = 'zh',
}: {
  publication: Publication;
  language?: 'zh' | 'en';
}) {
  return (
    <div className="resume-publication">
      {publication.authors.trim() && (
        <p className="resume-publication-authors">
          {authorSegments(publication.authors, publication.highlightedAuthor).map(
            (segment, index) =>
              segment.highlighted ? (
                <strong key={index}>{segment.text}</strong>
              ) : (
                <span key={index}>{segment.text}</span>
              ),
          )}
        </p>
      )}
      {(publication.venue || publication.status !== 'none') && (
        <p className="resume-publication-venue">
          {publication.venue}
          {publication.venue && publication.status !== 'none' ? ' · ' : ''}
          {publicationStatusName(publication.status, language)}
        </p>
      )}
    </div>
  );
}
