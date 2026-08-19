import { type CSSProperties, type ReactNode } from 'react';
import {
  safeLink,
  hasRichTextContent,
  type ResumeDocument as Document,
  type ResumeEntry,
  type ResumeSection,
  type RichTextNode,
  hasEntryContent,
  type Appearance,
} from './model.ts';
import { profileContacts } from './fields.ts';
import { formatResumeDate } from './dates.ts';
import {
  highlightCssColor,
  normalizeTextColor,
  normalizeFontSize,
  normalizeTextAlign,
  normalizeParagraphIndent,
  normalizeParagraphLineHeight,
  normalizeHighlightColor,
} from './textFormatting.ts';
import DocumentFields from './DocumentFields';
import ContributionCalendar from './ContributionCalendar';
import PublicationDetails from './PublicationDetails';
import { publicationCitationLabel } from './publications.ts';
import './advanced-rich-text.css';

function RichNode({ node }: { node: RichTextNode }) {
  const children = node.content?.map((child, i) => <RichNode key={i} node={child} />);
  if (node.type === 'text') {
    let result: ReactNode = node.text;
    for (const mark of node.marks ?? []) {
      if (mark.type === 'bold') result = <strong>{result}</strong>;
      else if (mark.type === 'italic') result = <em>{result}</em>;
      else if (mark.type === 'underline') result = <u>{result}</u>;
      else if (mark.type === 'strike') result = <s>{result}</s>;
      else if (mark.type === 'code') result = <code>{result}</code>;
      else if (mark.type === 'superscript') result = <sup>{result}</sup>;
      else if (mark.type === 'subscript') result = <sub>{result}</sub>;
      else if (mark.type === 'highlight' && normalizeHighlightColor(mark.attrs?.color))
        result = (
          <mark
            className="rich-highlight"
            style={{
              backgroundColor: highlightCssColor(mark.attrs?.color),
              color: 'inherit',
            }}
          >
            {result}
          </mark>
        );
      else if (mark.type === 'link' && safeLink(mark.attrs?.href ?? ''))
        result = (
          <a href={safeLink(mark.attrs!.href!)} target="_blank" rel="noreferrer">
            {result}
          </a>
        );
      else if (
        mark.type === 'textStyle' &&
        (normalizeFontSize(mark.attrs?.fontSize) || normalizeTextColor(mark.attrs?.color))
      )
        result = (
          <span
            style={{
              fontSize: normalizeFontSize(mark.attrs?.fontSize),
              color: normalizeTextColor(mark.attrs?.color),
            }}
          >
            {result}
          </span>
        );
    }
    return <>{result}</>;
  }
  if (node.type === 'paragraph')
    return (
      <p
        style={{
          textAlign: normalizeTextAlign(node.attrs?.textAlign),
          marginLeft:
            normalizeParagraphIndent(node.attrs?.paragraphIndent) === undefined
              ? undefined
              : `${normalizeParagraphIndent(node.attrs?.paragraphIndent)}em`,
          lineHeight: normalizeParagraphLineHeight(node.attrs?.lineHeight),
        }}
      >
        {children?.length ? children : <br />}
      </p>
    );
  if (node.type === 'bulletList') return <ul>{children}</ul>;
  if (node.type === 'heading') {
    const level = node.attrs?.level;
    const Heading = level === 1 ? 'h1' : level === 2 ? 'h2' : level === 3 ? 'h3' : 'h4';
    return (
      <Heading style={{ textAlign: normalizeTextAlign(node.attrs?.textAlign) }}>{children}</Heading>
    );
  }
  if (node.type === 'blockquote') return <blockquote>{children}</blockquote>;
  if (node.type === 'codeBlock')
    return (
      <pre>
        <code data-language={node.attrs?.language}>{children}</code>
      </pre>
    );
  if (node.type === 'horizontalRule') return <hr />;
  if (node.type === 'table')
    return (
      <table>
        <tbody>{children}</tbody>
      </table>
    );
  if (node.type === 'tableRow') return <tr>{children}</tr>;
  if (node.type === 'tableCell' || node.type === 'tableHeader') {
    const Cell = node.type === 'tableHeader' ? 'th' : 'td';
    const width = node.attrs?.colwidth?.reduce((sum, width) => sum + width, 0);
    return (
      <Cell
        colSpan={node.attrs?.colspan}
        rowSpan={node.attrs?.rowspan}
        style={{
          width: width || undefined,
          backgroundColor: normalizeTextColor(node.attrs?.backgroundColor),
        }}
      >
        {children}
      </Cell>
    );
  }
  if (node.type === 'orderedList') return <ol start={node.attrs?.start}>{children}</ol>;
  if (node.type === 'listItem') return <li>{children}</li>;
  if (node.type === 'hardBreak') return <br />;
  return <>{children}</>;
}

export function RichTextContent({ value }: { value: RichTextNode }) {
  return (
    <div className="resume-rich">
      <RichNode node={value} />
    </div>
  );
}

function Entry({
  entry,
  simple,
  appearance,
  number,
}: {
  entry: ResumeEntry;
  simple: boolean;
  appearance: Appearance;
  number: number;
}) {
  const hidden = entry.hiddenFields ?? [];
  const hasDescription = !hidden.includes('description') && hasRichTextContent(entry.description);
  if (!hasEntryContent(entry)) return null;
  const start = hidden.includes('dates')
    ? ''
    : formatResumeDate(entry.startDate, appearance.dateFormat, appearance.language);
  const end = hidden.includes('dates')
    ? ''
    : formatResumeDate(
        entry.current ? '至今' : entry.endDate,
        appearance.dateFormat,
        appearance.language,
      );
  const title = hidden.includes('title') ? '' : entry.title;
  const subtitle = hidden.includes('subtitle') ? '' : entry.subtitle;
  const degree = hidden.includes('degree') ? '' : entry.degree?.trim();
  const gpa = hidden.includes('gpa') ? '' : entry.gpa?.trim();
  const publication = hidden.includes('publication') ? undefined : entry.publication;
  const citation = publication
    ? publicationCitationLabel(
        publication,
        number - 1,
        hidden.includes('dates') ? '' : entry.startDate,
      )
    : '';
  return (
    <div
      className={`resume-entry ${simple ? 'resume-entry-simple' : ''}`}
      data-entry-id={entry.id}
      data-entry-number={number}
      data-citation-style={publication?.citationStyle}
    >
      {!simple && (
        <div className="resume-entry-date">
          {start && <span>{start}</span>}
          {end && <span>{end}</span>}
        </div>
      )}
      <div className="resume-entry-content">
        <div className={`resume-entry-heading-group logo-${entry.logoPosition ?? 'left'}`}>
          {!hidden.includes('logo') && entry.logoVisible !== false && entry.logo && (
            <img
              className="resume-entry-logo"
              src={entry.logo}
              alt="机构标志"
              style={{
                width: entry.logoWidth ?? entry.logoSize ?? 40,
                height: entry.logoHeight ?? entry.logoSize ?? 40,
                borderRadius: entry.logoRadius ?? 6,
                objectFit: entry.logoFit ?? 'contain',
              }}
            />
          )}
          {(!simple ||
            title ||
            subtitle ||
            degree ||
            gpa ||
            start ||
            end ||
            (!hidden.includes('location') && entry.location)) && (
            <div className="resume-entry-head">
              <div>
                {(title || subtitle) && (
                  <h3>
                    {citation && <span className="resume-citation-label">{citation} </span>}
                    {(title ? entry.fieldLabels?.title : entry.fieldLabels?.subtitle) && (
                      <span className="resume-profile-label">
                        {title ? entry.fieldLabels?.title : entry.fieldLabels?.subtitle}：{' '}
                      </span>
                    )}
                    {title || subtitle}
                  </h3>
                )}
                {title && subtitle && !appearance.centerSubtitle && (
                  <p className="resume-subtitle">
                    {entry.fieldLabels?.subtitle && (
                      <span className="resume-profile-label">{entry.fieldLabels.subtitle}： </span>
                    )}
                    {subtitle}
                  </p>
                )}
              </div>
              {title && subtitle && appearance.centerSubtitle && (
                <p className="resume-subtitle resume-subtitle-centered">
                  {entry.fieldLabels?.subtitle && (
                    <span className="resume-profile-label">{entry.fieldLabels.subtitle}： </span>
                  )}
                  {subtitle}
                </p>
              )}
              <div className="resume-entry-meta">
                {degree && degree !== subtitle.trim() && (
                  <span>
                    {entry.fieldLabels?.degree?.trim()
                      ? `${entry.fieldLabels.degree.trim()}: ${degree}`
                      : degree}
                  </span>
                )}
                {gpa && (
                  <span>
                    {entry.fieldLabels?.gpa?.trim() || 'GPA'}: {gpa}
                  </span>
                )}
                {(start || end) && (
                  <span className="resume-entry-date-inline">
                    {start}
                    {start && end ? ' — ' : ''}
                    {end}
                  </span>
                )}
                {!hidden.includes('location') && entry.location && <span>{entry.location}</span>}
              </div>
            </div>
          )}
        </div>
        {!hidden.includes('link') &&
          entry.link &&
          (safeLink(entry.link) ? (
            <a
              className="resume-entry-link"
              href={safeLink(entry.link)}
              target="_blank"
              rel="noreferrer"
            >
              {entry.linkLabel?.trim() || entry.link}
            </a>
          ) : (
            <span className="resume-entry-link">{entry.link}</span>
          ))}
        {publication && (
          <PublicationDetails publication={publication} language={appearance.language} />
        )}
        <DocumentFields fields={entry.customFields ?? []} className="resume-custom-fields" />
        {hasDescription && <RichTextContent value={entry.description} />}
        {!hidden.includes('image') && entry.image && (
          <img
            className="resume-entry-image"
            src={entry.image}
            style={{
              width: `${entry.imageWidth ?? 100}%`,
              marginLeft:
                entry.imageAlign === 'center' || entry.imageAlign === 'right' ? 'auto' : 0,
              marginRight: entry.imageAlign === 'center' ? 'auto' : 0,
              objectPosition: `${entry.imageAlign ?? 'left'} top`,
            }}
            alt="条目配图"
          />
        )}
      </div>
    </div>
  );
}

function Section({
  section,
  appearance,
  number,
}: {
  section: ResumeSection;
  appearance: Appearance;
  number: number;
}) {
  if (!section.visible || !section.items.some(hasEntryContent)) return null;
  return (
    <section
      className={`resume-section resume-section-${section.type} placement-${section.placement ?? 'auto'} ${section.showTitle === false ? 'resume-section-no-title' : ''}`}
      data-break-before={section.breakBefore ? 'true' : undefined}
      data-section-id={section.id}
      data-section-number={String(number).padStart(2, '0')}
    >
      {section.showTitle !== false && <h2>{section.title}</h2>}
      <div className={`resume-section-body section-columns-${section.columns}`}>
        {section.items.filter(hasEntryContent).map((entry, index) => (
          <Entry
            key={entry.id}
            entry={entry}
            simple={['summary', 'skills', 'freeform'].includes(section.type)}
            appearance={appearance}
            number={index + 1}
          />
        ))}
      </div>
    </section>
  );
}

export default function ResumeDocument({
  document,
  miniature = false,
}: {
  document: Document;
  miniature?: boolean;
}) {
  const { profile, appearance, sections } = document;
  const style = {
    '--resume-accent': appearance.accent,
    '--resume-font-size': `${appearance.fontSize}px`,
    '--resume-line-height': appearance.lineHeight,
    '--resume-margin': `${appearance.pageMargin}mm`,
    '--resume-section-gap': `${appearance.sectionGap}px`,
    '--resume-photo-size': `${appearance.photoSize}px`,
    '--resume-photo-width': `${appearance.photoWidth ?? appearance.photoSize}px`,
    '--resume-photo-height': `${appearance.photoHeight ?? (appearance.photoShape === 'circle' ? (appearance.photoWidth ?? appearance.photoSize) : appearance.photoSize * 1.28)}px`,
    '--resume-photo-radius':
      appearance.photoRadius === undefined ? undefined : `${appearance.photoRadius}px`,
    '--resume-photo-fit': appearance.photoFit ?? 'cover',
    '--resume-subtitle-align': appearance.subtitleAlign,
    '--resume-entry-heading-size':
      appearance.entryHeadingSize === undefined ? undefined : `${appearance.entryHeadingSize}px`,
    '--resume-entry-heading-gap':
      appearance.entryHeadingGap === undefined ? undefined : `${appearance.entryHeadingGap}px`,
    '--resume-name-size': appearance.nameSize ? `${appearance.nameSize}px` : undefined,
    '--resume-heading-size': appearance.headingSize ? `${appearance.headingSize}px` : undefined,
    '--resume-entry-gap':
      appearance.entryGap !== undefined ? `${appearance.entryGap}px` : undefined,
    '--resume-paragraph-gap':
      appearance.paragraphGap !== undefined ? `${appearance.paragraphGap}px` : undefined,
    '--resume-photo-x': `${appearance.photoPositionX ?? 50}%`,
    '--resume-photo-y': `${appearance.photoPositionY ?? 50}%`,
    '--resume-column-left':
      appearance.columnRatio === undefined ? undefined : `${appearance.columnRatio}fr`,
    '--resume-column-right':
      appearance.columnRatio === undefined ? undefined : `${100 - appearance.columnRatio}fr`,
    '--resume-column-gap':
      appearance.columnGap === undefined ? undefined : `${appearance.columnGap}px`,
  } as CSSProperties;
  const contacts = profileContacts(profile);
  const hidden = profile.hiddenFields ?? [];
  return (
    <article
      className={`resume-document template-${appearance.template} resume-font-${appearance.font} resume-align-${appearance.headerAlign} resume-heading-${appearance.headingStyle} resume-photo-${appearance.photoShape} photo-side-${appearance.photoSide ?? 'right'} resume-header-${appearance.headerLayout ?? 'standard'} entry-heading-${appearance.entryHeadingLayout ?? 'split'} ${appearance.centerSubtitle ? 'entry-subtitle-centered' : ''} ${appearance.flexibleHeaderLayout ? 'entry-heading-flexible' : ''} ${miniature ? 'resume-miniature' : ''}`}
      style={style}
      aria-label="简历文档"
      data-document-id={document.id}
      data-automatic-one-page={appearance.automaticOnePage || undefined}
      data-automatic-one-page-min-scale={appearance.automaticOnePageMinScale}
    >
      <header className="resume-header">
        <div className="resume-identity">
          {!hidden.includes('name') && (
            <h1>
              {profile.fieldLabels?.name && (
                <small className="resume-name-label">{profile.fieldLabels.name} </small>
              )}
              {profile.name || (appearance.language === 'en' ? 'Your name' : '你的姓名')}
            </h1>
          )}
          {!hidden.includes('headline') && (
            <p className="resume-headline">
              {profile.fieldLabels?.headline && (
                <span className="resume-profile-label">{profile.fieldLabels.headline}： </span>
              )}
              {profile.headline ||
                (appearance.language === 'en' ? 'Your professional headline' : '填写你的求职意向')}
            </p>
          )}
          <DocumentFields
            fields={contacts}
            className="resume-contacts"
            icons={appearance.contactIcons ?? false}
            emailUnderline={profile.emailUnderline}
          />
          <ContributionCalendar calendar={profile.contributions} language={appearance.language} />
        </div>
        {profile.photo && appearance.showPhoto && (
          <img
            className="resume-photo"
            src={profile.photo}
            width="78"
            height="100"
            alt="简历头像"
          />
        )}
      </header>
      <div
        className={`resume-body ${sections.some((section) => section.visible && section.items.some(hasEntryContent) && section.placement && section.placement !== 'auto') ? 'resume-custom-layout' : ''}`}
      >
        {sections
          .filter((s) => s.visible && s.items.some(hasEntryContent))
          .map((s, index) => (
            <Section section={s} key={s.id} appearance={appearance} number={index + 1} />
          ))}
      </div>
      {!sections.some((s) => s.visible && s.items.some(hasEntryContent)) && (
        <p className="resume-empty">从左侧填写经历，让这里成为你的故事。</p>
      )}
    </article>
  );
}
